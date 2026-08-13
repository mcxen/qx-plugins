import {
  cleanText,
  copy,
  createPanel,
  normalizePost,
  parseCookies,
  parseIds,
  setLocale,
} from "./source/weibo.js";

const panels = new WeakMap();

const plugin = {
  panel: {
    title: "QxWeibo 微博",
    render(container, context) {
      panels.get(container)?.destroy();
      panels.set(container, createPanel(container, context));
    },
    destroy(container) {
      panels.get(container)?.destroy();
      panels.delete(container);
    },
  },
};

export { cleanText, normalizePost, parseCookies, parseIds, setLocale };
export default plugin;
