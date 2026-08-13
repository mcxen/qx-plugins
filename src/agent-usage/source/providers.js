const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const GROK_BILLING_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
const EMPTY_GRPC_WEB_BODY_BASE64 = "AAAAAAA=";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercent(value) {
  const parsed = finite(value);
  if (parsed == null) return null;
  return Math.min(100, Math.max(0, parsed));
}

function decodeBase64Utf8(encoded) {
  const binary = atob(String(encoded || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function readJsonFile(context, path) {
  try {
    const encoded = await context.invoke("plugin_file_read_base64", { path });
    return asObject(JSON.parse(decodeBase64Utf8(encoded)));
  } catch (error) {
    const message = String(error?.message || error || "");
    if (/not found|no such file|cannot find|os error 2/i.test(message)) {
      return null;
    }
    throw new Error(`local_file:${message}`);
  }
}

function windowLabel(seconds, fallback) {
  const duration = finite(seconds);
  if (duration == null || duration <= 0) return fallback;
  if (duration <= 6 * 60 * 60) return "5h";
  if (duration <= 9 * 24 * 60 * 60) return "weekly";
  if (duration <= 40 * 24 * 60 * 60) return "monthly";
  return fallback;
}

function normalizeCodexWindow(raw, fallback) {
  const value = asObject(raw);
  const used = clampPercent(value.used_percent);
  if (used == null) return null;
  const resetAtSeconds = finite(value.reset_at);
  const resetAfterSeconds = finite(value.reset_after_seconds);
  const resetAt = resetAtSeconds != null
    ? new Date(resetAtSeconds * 1000).toISOString()
    : resetAfterSeconds != null
      ? new Date(Date.now() + resetAfterSeconds * 1000).toISOString()
      : null;
  return {
    id: fallback,
    label: windowLabel(value.limit_window_seconds, fallback),
    usedPercent: used,
    remainingPercent: 100 - used,
    resetAt,
  };
}

function codexWindows(rateLimit, prefix = "") {
  const value = asObject(rateLimit);
  return [
    normalizeCodexWindow(value.primary_window, `${prefix}primary`),
    normalizeCodexWindow(value.secondary_window, `${prefix}secondary`),
  ].filter(Boolean);
}

export function parseCodexUsage(raw) {
  const value = asObject(raw);
  const rateLimit = asObject(value.rate_limit);
  const windows = codexWindows(rateLimit);
  const codeReviewWindows = codexWindows(value.code_review_rate_limit, "review-");
  const additionalLimits = (Array.isArray(value.additional_rate_limits) ? value.additional_rate_limits : [])
    .map((entry, index) => {
      const item = asObject(entry);
      const limitWindows = codexWindows(item.rate_limit, `extra-${index}-`);
      return limitWindows.length ? {
        id: stringValue(item.limit_name) || `extra-${index}`,
        label: stringValue(item.limit_name) || `Limit ${index + 1}`,
        windows: limitWindows,
      } : null;
    })
    .filter(Boolean);
  if (!windows.length && !codeReviewWindows.length && !additionalLimits.length) {
    throw new Error("parse:codex_windows");
  }
  const remaining = windows.length
    ? Math.min(...windows.map((window) => window.remainingPercent))
    : Math.min(100, ...codeReviewWindows.map((window) => window.remainingPercent));
  const credits = asObject(value.credits);
  return {
    provider: "codex",
    title: "Codex",
    account: stringValue(value.email),
    plan: stringValue(value.plan_type),
    remainingPercent: remaining,
    windows,
    codeReviewWindows,
    additionalLimits,
    credits: {
      available: Boolean(credits.has_credits),
      unlimited: Boolean(credits.unlimited),
      balance: stringValue(credits.balance),
    },
    allowed: rateLimit.allowed !== false && rateLimit.limit_reached !== true,
    fetchedAt: Date.now(),
  };
}

export async function fetchCodexUsage(context) {
  const auth = await readJsonFile(context, "~/.codex/auth.json");
  if (!auth) throw new Error("not_configured:codex");
  const tokens = asObject(auth.tokens);
  const accessToken = stringValue(tokens.access_token);
  if (!accessToken) throw new Error("not_configured:codex");
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "Qx-AgentUsage/1.0",
  };
  const accountId = stringValue(tokens.account_id);
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;
  const response = await context.http.fetch(CODEX_USAGE_URL, {
    method: "GET",
    headers,
    timeoutMs: 15_000,
    maxBytes: 1024 * 1024,
  });
  if (response.status === 401 || response.status === 403) throw new Error("unauthorized:codex");
  if (!response.ok) throw new Error(`http:codex:${response.status}`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("parse:codex_json");
  }
  return parseCodexUsage(data);
}

function parseDate(value) {
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function selectGrokCredentials(root) {
  const now = Date.now();
  const candidates = Object.entries(asObject(root))
    .map(([scope, entry]) => ({ scope, entry: asObject(entry) }))
    .filter(({ scope, entry }) => stringValue(entry.key) && (
      scope.startsWith("https://auth.x.ai::") || scope.includes("/sign-in")
    ));
  candidates.sort((left, right) => {
    const leftExpiry = parseDate(left.entry.expires_at)?.getTime() ?? -Infinity;
    const rightExpiry = parseDate(right.entry.expires_at)?.getTime() ?? -Infinity;
    const leftExpired = leftExpiry !== -Infinity && leftExpiry <= now ? 1 : 0;
    const rightExpired = rightExpiry !== -Infinity && rightExpiry <= now ? 1 : 0;
    if (leftExpired !== rightExpired) return leftExpired - rightExpired;
    if (leftExpiry !== rightExpiry) return rightExpiry - leftExpiry;
    return left.scope.localeCompare(right.scope);
  });
  const selected = candidates[0];
  if (!selected) return null;
  const entry = selected.entry;
  return {
    accessToken: stringValue(entry.key),
    expiresAt: parseDate(entry.expires_at)?.toISOString() || null,
    account: stringValue(entry.email),
    accountName: [stringValue(entry.first_name), stringValue(entry.last_name)].filter(Boolean).join(" ") || null,
    teamId: stringValue(entry.team_id),
    loginMethod: stringValue(entry.auth_mode)?.toLowerCase() === "oidc"
      ? "SuperGrok"
      : stringValue(entry.auth_mode),
  };
}

function readVarint(bytes, cursor) {
  let value = 0;
  let factor = 1;
  for (let count = 0; cursor.value < bytes.length && count < 10; count += 1) {
    const byte = bytes[cursor.value];
    cursor.value += 1;
    value += (byte & 0x7f) * factor;
    if ((byte & 0x80) === 0) return Number.isSafeInteger(value) ? value : null;
    factor *= 128;
  }
  return null;
}

function scanProtobuf(data, depth = 0, path = [], target = { floats: [], varints: [], order: 0 }) {
  const cursor = { value: 0 };
  while (cursor.value < data.length) {
    const fieldStart = cursor.value;
    const key = readVarint(data, cursor);
    if (!key) {
      cursor.value = fieldStart + 1;
      continue;
    }
    const fieldNumber = Math.floor(key / 8);
    const wireType = key & 7;
    const fieldPath = [...path, fieldNumber];
    if (wireType === 0) {
      const value = readVarint(data, cursor);
      if (value == null) cursor.value = fieldStart + 1;
      else target.varints.push({ path: fieldPath, value });
    } else if (wireType === 1) {
      if (cursor.value + 8 > data.length) break;
      cursor.value += 8;
    } else if (wireType === 2) {
      const length = readVarint(data, cursor);
      if (length == null || length < 0 || cursor.value + length > data.length) {
        cursor.value = fieldStart + 1;
        continue;
      }
      const end = cursor.value + length;
      if (depth < 4) scanProtobuf(data.subarray(cursor.value, end), depth + 1, fieldPath, target);
      cursor.value = end;
    } else if (wireType === 5) {
      if (cursor.value + 4 > data.length) break;
      const view = new DataView(data.buffer, data.byteOffset + cursor.value, 4);
      target.floats.push({ path: fieldPath, value: view.getFloat32(0, true), order: target.order });
      target.order += 1;
      cursor.value += 4;
    } else {
      cursor.value = fieldStart + 1;
    }
  }
  return target;
}

function grpcFrames(data) {
  const payloads = [];
  const trailers = {};
  let index = 0;
  while (index + 5 <= data.length) {
    const flags = data[index];
    const length = ((data[index + 1] << 24) | (data[index + 2] << 16) | (data[index + 3] << 8) | data[index + 4]) >>> 0;
    const start = index + 5;
    const end = start + length;
    if (end > data.length) throw new Error("parse:grok_frame");
    if ((flags & 0x80) === 0) payloads.push(data.subarray(start, end));
    else {
      const text = new TextDecoder().decode(data.subarray(start, end));
      for (const line of text.split(/\r?\n/)) {
        const separator = line.indexOf(":");
        if (separator > 0) trailers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
      }
    }
    index = end;
  }
  return { payloads, trailers };
}

export function parseGrokBilling(buffer, now = Date.now()) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const { payloads, trailers } = grpcFrames(data);
  const grpcStatus = finite(trailers["grpc-status"]);
  if (grpcStatus === 16 || grpcStatus === 7) throw new Error("unauthorized:grok");
  if (grpcStatus != null && grpcStatus !== 0) throw new Error(`grpc:grok:${grpcStatus}`);
  if (!payloads.length) throw new Error("parse:grok_payload");
  const scan = { floats: [], varints: [], order: 0 };
  for (const payload of payloads) scanProtobuf(payload, 0, [], scan);
  const percentage = scan.floats
    .filter((field) => field.path.at(-1) === 1 && field.value >= 0 && field.value <= 100)
    .sort((left, right) => left.path.length - right.path.length || left.order - right.order)[0]?.value;
  const resets = scan.varints
    .filter((field) => field.value >= 1_700_000_000 && field.value <= 2_100_000_000 && field.value * 1000 > now)
    .sort((left, right) => {
      const preferred = (field) => field.path.length === 3 && field.path[0] === 1 && field.path[1] === 5 && field.path[2] === 1 ? 0 : 1;
      return preferred(left) - preferred(right) || left.value - right.value;
    });
  if (percentage == null) throw new Error("parse:grok_usage");
  return {
    usedPercent: clampPercent(percentage),
    remainingPercent: 100 - clampPercent(percentage),
    resetAt: resets.length ? new Date(resets[0].value * 1000).toISOString() : null,
  };
}

export async function fetchGrokUsage(context) {
  const auth = await readJsonFile(context, "~/.grok/auth.json");
  const credentials = selectGrokCredentials(auth);
  if (!credentials?.accessToken) throw new Error("not_configured:grok");
  if (credentials.expiresAt && Date.parse(credentials.expiresAt) <= Date.now()) {
    throw new Error("unauthorized:grok");
  }
  const response = await context.http.fetch(GROK_BILLING_URL, {
    method: "POST",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      "x-user-agent": "connect-es/2.1.1",
      Origin: "https://grok.com",
      Referer: "https://grok.com/?_s=usage",
      "User-Agent": "Qx-AgentUsage/1.0",
    },
    bodyBase64: EMPTY_GRPC_WEB_BODY_BASE64,
    timeoutMs: 15_000,
    maxBytes: 1024 * 1024,
  });
  if (response.status === 401 || response.status === 403) throw new Error("unauthorized:grok");
  if (!response.ok) throw new Error(`http:grok:${response.status}`);
  const snapshot = parseGrokBilling(await response.arrayBuffer());
  return {
    provider: "grok",
    title: "Grok",
    account: credentials.account,
    accountName: credentials.accountName,
    plan: credentials.loginMethod,
    teamId: credentials.teamId,
    remainingPercent: snapshot.remainingPercent,
    windows: [{
      id: "credits",
      label: "credits",
      usedPercent: snapshot.usedPercent,
      remainingPercent: snapshot.remainingPercent,
      resetAt: snapshot.resetAt,
    }],
    codeReviewWindows: [],
    additionalLimits: [],
    credits: null,
    allowed: snapshot.remainingPercent > 0,
    fetchedAt: Date.now(),
  };
}

export const PROVIDERS = [
  {
    id: "codex",
    title: "Codex",
    dashboard: "https://chatgpt.com/codex/settings/usage",
    login: { program: "codex", args: ["login", "--device-auth"] },
    fetch: fetchCodexUsage,
  },
  {
    id: "grok",
    title: "Grok",
    dashboard: "https://grok.com/?_s=usage",
    login: { program: "grok", args: ["login", "--device-auth"] },
    fetch: fetchGrokUsage,
  },
];
