export function createPluginStateKit() {
  const createLatestWriter = (writer) => {
    let revision = 0;
    let queue = Promise.resolve();
    return {
      write(value) {
        const current = ++revision;
        const snapshot = JSON.parse(JSON.stringify(value));
        const operation = queue.catch(() => {}).then(
          () => current === revision ? writer(snapshot) : undefined,
        );
        queue = operation;
        return operation;
      },
      flush: () => queue,
    };
  };

  const createReadLedger = (options = {}) => {
    let retentionDays = Number(options.retentionDays) || 7;
    let maxEntries = Number(options.maxEntries) || 5_000;
    let values = {};
    const prune = () => {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1_000;
      values = Object.fromEntries(
        Object.entries(values)
          .filter(([, at]) => Number(at) >= cutoff)
          .sort((left, right) => Number(right[1]) - Number(left[1]))
          .slice(0, maxEntries),
      );
    };
    const merge = (source) => {
      for (const [id, at] of Object.entries(source || {})) {
        values[id] = Math.max(Number(values[id]) || 0, Number(at) || 0);
      }
      prune();
    };
    merge(options.initial);
    return {
      has: (id) => Boolean(values[String(id || "")]),
      mark(id, at = Date.now()) {
        const key = String(id || "");
        if (!key || values[key]) return false;
        values[key] = at;
        prune();
        return Boolean(values[key]);
      },
      unmark(id) {
        const key = String(id || "");
        if (!values[key]) return false;
        delete values[key];
        return true;
      },
      markMany(ids, at = Date.now()) {
        let changed = 0;
        for (const id of ids || []) {
          const key = String(id || "");
          if (!key || values[key]) continue;
          values[key] = at;
          changed += 1;
        }
        prune();
        return changed;
      },
      merge,
      replace(source) {
        values = {};
        merge(source);
      },
      configure(next = {}) {
        retentionDays = Number(next.retentionDays) || retentionDays;
        maxEntries = Number(next.maxEntries) || maxEntries;
        prune();
      },
      prune,
      snapshot() {
        prune();
        return { ...values };
      },
      ids: () => Object.keys(values),
      size: () => Object.keys(values).length,
      clear: () => { values = {}; },
    };
  };

  const createLru = (options = {}) => {
    const values = new Map();
    const maxEntries = Number(options.maxEntries) || 64;
    const maxSize = Number(options.maxSize) || Number.MAX_SAFE_INTEGER;
    const sizeOf = options.sizeOf || (() => 1);
    let total = 0;
    const remove = (key) => {
      const entry = values.get(key);
      if (!entry) return false;
      total -= entry.size;
      return values.delete(key);
    };
    return {
      get(key) {
        const entry = values.get(key);
        if (!entry) return undefined;
        values.delete(key);
        values.set(key, entry);
        return entry.value;
      },
      set(key, value) {
        remove(key);
        const size = Math.max(0, Number(sizeOf(value)) || 0);
        values.set(key, { value, size });
        total += size;
        while (values.size > maxEntries || total > maxSize) remove(values.keys().next().value);
        return values.has(key);
      },
      has: (key) => values.has(key),
      delete: remove,
      clear: () => { values.clear(); total = 0; },
      size: () => values.size,
      totalSize: () => total,
    };
  };

  const createGenerationGate = () => {
    let generation = 0;
    return {
      current: () => generation,
      next: () => ++generation,
      invalidate: () => ++generation,
      isCurrent: (candidate) => candidate === generation,
    };
  };

  return { createLatestWriter, createReadLedger, createLru, createGenerationGate };
}
