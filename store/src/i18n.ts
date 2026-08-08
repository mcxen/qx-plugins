import type { Locale } from "./types";

const dict = {
  "zh-CN": {
    brandStore: "Store",
    searchPlaceholder: "搜索插件、作者、权限…",
    github: "GitHub",
    themeToggle: "切换主题",
    lightTheme: "浅色",
    darkTheme: "深色",
    title: "为 Qx 准备的扩展",
    lede: "浏览官方与社区插件，查看版本与更新说明。安装请在 Qx 中打开 设置 → 扩展。",
    statPlugins: "插件",
    statUpdated: "最近更新",
    statSource: "目录源",
    statSourceValue: "index.json",
    showing: "显示",
    of: "/",
    sort: "排序",
    sortUpdated: "最近更新",
    sortName: "名称",
    sortVersion: "版本",
    emptyTitle: "没有匹配的插件",
    emptyBody: "试试更短的关键词，或清除搜索。",
    loadErrorTitle: "无法加载目录",
    loadErrorBody: "请确认已运行 prepare 并生成 catalog.json，或检查网络。",
    loading: "加载目录…",
    back: "全部插件",
    download: "下载包",
    openInQx: "在 Qx 中安装",
    copyChecksum: "复制校验和",
    copied: "已复制",
    install: "如何安装",
    installSteps:
      "点击「在 Qx 中安装」通过 qx:// 协议唤起应用（需已安装 Qx）。也可在 Qx → 设置 → 扩展 中搜索安装，或导入本地下载的 .qx-plugin。",
    meta: "详情",
    version: "版本",
    author: "作者",
    updated: "更新于",
    minApp: "最低 Qx",
    size: "大小",
    checksum: "SHA-256",
    permissions: "权限",
    releases: "版本记录",
    screenshots: "截图",
    noScreenshots: "暂无截图。",
    noReleases: "暂无版本说明。",
    noPermissions: "未声明额外权限。",
    shotPrev: "上一张",
    shotNext: "下一张",
    footerNote: "目录由 qx-plugins 自动同步。包校验与权限仍由 Qx 宿主执行。",
    source: "源码",
    navSources: "源配置",
    sourcesTitle: "在 Qx 中配置插件源",
    sourcesLede:
      "Qx 通过「插件库」拉取 index.json。默认使用 GitHub；国内网络可改用或叠加 CNB 镜像源。",
    sourcesWhereTitle: "在哪里配置",
    sourcesWhereBody:
      "打开 Qx → 设置 → 扩展 → 插件库（Libraries）。可添加多条源，每条包含名称、index_url、是否启用。",
    sourcesGhTitle: "GitHub 官方源",
    sourcesGhBody:
      "默认源。索引与插件包均托管在 GitHub raw。适合国际网络或需要与官方仓库保持一致时使用。",
    sourcesGhName: "名称示例",
    sourcesGhUrl: "index_url",
    sourcesCnbTitle: "CNB 国内源",
    sourcesCnbBody:
      "同一套 qx-plugins 仓库在 CNB 上的 raw 镜像。把 index_url 指到 CNB 后，Qx 会优先从索引旁路径下载 .qx-plugin（即使条目里仍写着 GitHub 地址）。",
    sourcesCnbName: "名称示例",
    sourcesCnbUrl: "index_url",
    sourcesCnbAlt: "也可只填仓库根地址，Qx 会尝试解析 raw/main/index.json：",
    sourcesStepsTitle: "推荐步骤",
    sourcesStep1: "打开 设置 → 扩展 → 插件库。",
    sourcesStep2: "保留或添加 GitHub 源；国内用户再添加一条 CNB 源。",
    sourcesStep3: "需要只走国内镜像时，可禁用 GitHub 源，只保留 CNB。",
    sourcesStep4: "关闭对话框后刷新市场列表；安装时仍会校验校验和与权限。",
    sourcesBothTitle: "双源同时启用",
    sourcesBothBody:
      "可同时启用多个库。列表会合并展示，条目带有来源归属。下载失败时宿主会在允许的候选地址间回退，不会跳过校验。",
    sourcesNoteTitle: "注意",
    sourcesNoteBody:
      "商店网页（本站）只负责浏览；真正安装与源解析在 Qx 应用内完成。私有 Gogs/Gitea 源同样填 index.json 或仓库根地址即可。",
    sourcesCopy: "复制",
    sourcesCopied: "已复制",
    unknown: "—",
  },
  en: {
    brandStore: "Store",
    searchPlaceholder: "Search plugins, authors, permissions…",
    github: "GitHub",
    themeToggle: "Toggle theme",
    lightTheme: "Light",
    darkTheme: "Dark",
    title: "Extensions for Qx",
    lede: "Browse first-party and community plugins, versions, and release notes. Install from Qx → Settings → Extensions.",
    statPlugins: "Plugins",
    statUpdated: "Latest update",
    statSource: "Catalog",
    statSourceValue: "index.json",
    showing: "Showing",
    of: "of",
    sort: "Sort",
    sortUpdated: "Recently updated",
    sortName: "Name",
    sortVersion: "Version",
    emptyTitle: "No matching plugins",
    emptyBody: "Try a shorter query, or clear the search field.",
    loadErrorTitle: "Could not load catalog",
    loadErrorBody: "Run prepare to bake catalog.json, or check your network.",
    loading: "Loading catalog…",
    back: "All plugins",
    download: "Download package",
    openInQx: "Install in Qx",
    copyChecksum: "Copy checksum",
    copied: "Copied",
    install: "How to install",
    installSteps:
      "Click “Install in Qx” to open the app via the qx:// scheme (Qx must be installed). Or use Qx → Settings → Extensions, or Import a downloaded .qx-plugin.",
    meta: "Details",
    version: "Version",
    author: "Author",
    updated: "Updated",
    minApp: "Min Qx",
    size: "Size",
    checksum: "SHA-256",
    permissions: "Permissions",
    releases: "Release notes",
    screenshots: "Screenshots",
    noScreenshots: "No screenshots yet.",
    noReleases: "No release notes yet.",
    noPermissions: "No extra permissions declared.",
    shotPrev: "Previous",
    shotNext: "Next",
    footerNote: "Catalog syncs from qx-plugins. Package integrity and permissions are enforced by the Qx host.",
    source: "Source",
    navSources: "Sources",
    sourcesTitle: "Configure plugin sources in Qx",
    sourcesLede:
      "Qx loads plugins from library entries that point at an index.json. GitHub is the default; add a CNB mirror when GitHub is slow or blocked.",
    sourcesWhereTitle: "Where to configure",
    sourcesWhereBody:
      "Open Qx → Settings → Extensions → Plugin libraries. Each entry has a name, index_url, and enabled flag. Multiple libraries can stay on.",
    sourcesGhTitle: "GitHub (official)",
    sourcesGhBody:
      "Default catalog. Index and packages are served from GitHub raw. Use this for the canonical public registry.",
    sourcesGhName: "Name example",
    sourcesGhUrl: "index_url",
    sourcesCnbTitle: "CNB (China mirror)",
    sourcesCnbBody:
      "The same qx-plugins tree mirrored on CNB. Point index_url at the CNB raw index; Qx then prefers package files next to that index even if download_url still lists GitHub.",
    sourcesCnbName: "Name example",
    sourcesCnbUrl: "index_url",
    sourcesCnbAlt: "A repo root also works; Qx tries raw/main/index.json:",
    sourcesStepsTitle: "Suggested steps",
    sourcesStep1: "Open Settings → Extensions → Plugin libraries.",
    sourcesStep2: "Keep or add the GitHub entry; add a CNB entry for domestic access.",
    sourcesStep3: "To use only the mirror, disable GitHub and leave CNB enabled.",
    sourcesStep4: "Close the dialog and refresh the marketplace. Install still verifies checksums and permissions.",
    sourcesBothTitle: "Using both sources",
    sourcesBothBody:
      "Enabled libraries are merged. Each plugin keeps source attribution. Download fallbacks only change transport, never skip validation.",
    sourcesNoteTitle: "Notes",
    sourcesNoteBody:
      "This store website is browse-only. Install and source resolution run inside Qx. Private Gogs/Gitea catalogs use the same index_url field.",
    sourcesCopy: "Copy",
    sourcesCopied: "Copied",
    unknown: "—",
  },
} as const;

export type MessageKey = keyof (typeof dict)["en"];

export type Theme = "dark" | "light";

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem("qx-store-locale");
    if (saved === "zh-CN" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = navigator.language || "";
  return nav.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function t(locale: Locale, key: MessageKey): string {
  return dict[locale][key] ?? dict.en[key] ?? key;
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem("qx-store-locale", locale);
  } catch {
    /* ignore */
  }
}

export function detectTheme(): Theme {
  try {
    const saved = localStorage.getItem("qx-store-theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem("qx-store-theme", theme);
  } catch {
    /* ignore */
  }
}
