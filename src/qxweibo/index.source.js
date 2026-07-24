import {
  cleanText,
  copy,
  createPanel,
  normalizePost,
  parseCookies,
  parseIds,
} from "./source/weibo.js";

const panels = new WeakMap();

const plugin = {
  commands: [
    {
      name: "open-qxweibo",
      title: "打开 QxWeibo 微博",
      async run(context) {
        await context.showToast(copy(
          "Open QxWeibo from Extensions or search.",
          "请从扩展模块或搜索中打开 QxWeibo。",
        ));
      },
    },
  ],
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

export { cleanText, normalizePost, parseCookies, parseIds };
export default plugin;
