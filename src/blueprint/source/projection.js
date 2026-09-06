export const BACKGROUNDS = ["default", "sand", "sage", "blue", "rose", "violet"];

const BACKGROUND_LABELS = {
  default: ["Default", "默认"],
  sand: ["Sand", "沙色"],
  sage: ["Sage", "鼠尾草"],
  blue: ["Blue", "蓝色"],
  rose: ["Rose", "玫瑰"],
  violet: ["Violet", "紫罗兰"],
};

export function backgroundLabel(value, text) {
  const labels = BACKGROUND_LABELS[value] || BACKGROUND_LABELS.default;
  return text(labels[0], labels[1]);
}

function backgroundOptions(text) {
  return BACKGROUNDS.map((value) => ({ label: backgroundLabel(value, text), value }));
}

export function formatDate(value, currentLocale) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString(currentLocale, { dateStyle: "medium", timeStyle: "short" });
}

export function tagNames(note) {
  return (note?.tags || []).map((tag) => String(tag?.name || tag || "").trim()).filter(Boolean);
}

export function assetIds(items) {
  return (items || []).map((item) => String(item?.assetId || item || "").trim()).filter(Boolean);
}

export function parseTags(value) {
  return [...new Set(String(value || "").split(/[,，\n]/).map((tag) => tag.trim()).filter(Boolean))];
}

export function noteDraft(note) {
  return {
    id: note?.id || null,
    title: String(note?.title || ""),
    content: String(note?.content || ""),
    tags: tagNames(note).join(", "),
    background: BACKGROUNDS.includes(note?.background) ? note.background : "default",
    reminderAt: note?.reminderAt ? String(note.reminderAt) : "",
    pinned: Boolean(note?.pinned),
    archived: Boolean(note?.archivedAt),
    baseVersion: Number(note?.version) || 0,
    images: assetIds(note?.images),
    files: assetIds(note?.files),
  };
}

export function buildNoteForm({ draft, conflict, saving, advancedOpen, text }) {
  const disabled = saving || conflict;
  const basicControls = [
    { id: "draft:content", label: text("Content", "正文"), value: draft.content, type: "textarea", rows: 14, disabled },
    { id: "draft:title", label: text("Title", "标题"), value: draft.title, type: "text", disabled },
    { id: "draft:tags", label: text("Tags", "标签"), value: draft.tags, type: "text", placeholder: text("Comma-separated tags", "使用逗号分隔标签"), disabled },
  ];
  const advancedControls = advancedOpen ? [
    {
      id: "draft:background",
      label: text("Background", "背景"),
      value: draft.background,
      type: "select",
      disabled,
      options: backgroundOptions(text),
    },
    {
      id: "draft:reminderAt",
      label: text("Reminder", "提醒"),
      value: draft.reminderAt,
      type: "text",
      placeholder: "2026-09-01T09:00:00+08:00",
      disabled,
    },
    {
      id: "draft:pinned",
      label: text("Pinned", "置顶"),
      value: draft.pinned ? "yes" : "no",
      type: "select",
      disabled,
      options: [
        { label: text("Yes", "是"), value: "yes" },
        { label: text("No", "否"), value: "no" },
      ],
    },
    ...(draft.id ? [{
      id: "draft:archived",
      label: text("Archived", "归档"),
      value: draft.archived ? "yes" : "no",
      type: "select",
      disabled,
      options: [
        { label: text("Yes", "是"), value: "yes" },
        { label: text("No", "否"), value: "no" },
      ],
    }] : []),
  ] : [];

  return {
    title: draft.id ? text("Edit Xianji note", "编辑随手记") : text("New Xianji note", "新建随手记"),
    description: conflict
      ? text("A newer server version exists. Your draft is retained; reload the latest version before editing again.", "服务器已有新版本。当前草稿已保留；请先加载最新版再继续编辑。")
      : undefined,
    controls: [...basicControls, ...advancedControls],
    actions: [
      {
        id: "advanced-options",
        label: advancedOpen ? text("Hide advanced options", "收起高级选项") : text("Advanced options", "高级选项"),
        disabled: saving,
      },
      ...(conflict ? [
        { id: "reload-latest", label: text("Load latest version", "加载最新版"), primary: true },
        { id: "cancel-edit", label: text("Keep draft and close", "保留草稿并关闭") },
      ] : [
        { id: "save-note", label: saving ? text("Saving…", "正在保存…") : text("Save note", "保存随手记"), primary: true, disabled: saving },
        { id: "cancel-edit", label: text("Cancel", "取消"), disabled: saving },
      ]),
    ],
  };
}

export function deriveWorkbenchUrl(endpoint, noteId) {
  const url = new URL(endpoint);
  if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.port === "8787") {
    url.port = "3210";
  }
  url.pathname = "/";
  url.search = `?view=xianji&xianji=${encodeURIComponent(noteId)}`;
  url.hash = "";
  return url.toString();
}
