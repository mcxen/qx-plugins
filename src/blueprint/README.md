# BluePrint

Qx community plugin for BluePrint Xianji notes.

Configure the BluePrint MCP endpoint and a PAT with `content:read` plus
`content:write`. The plugin discovers the live identity and capabilities, then
provides session-only note browsing, content-first cards, authenticated image
previews, new-note creation, and complete-model edits with `baseVersion`
conflict protection. Double-click a writable card body to start the host-owned
inline editor; `Cmd/Ctrl+Enter` saves and `Esc` cancels through Qx's native
editor session.

Connection settings are grouped separately from browsing preferences. Use
“Check BluePrint Connection” after saving the endpoint and PAT; it calls the
real `blueprint_whoami` and `blueprint_list_capabilities` tools and reports the
workspace plus read/write status.

Browsing preferences are saved automatically and use Qx's native Workbench
surface: choose Cards or List, choose comfortable or compact density, and
toggle attached images. Cards publish the complete note body, tags, and
localized update time; the host owns spacing, columns, selection, and editing.

The PAT is used only as a Bearer header and is never copied into note content,
URLs, Workbench snapshots, plugin storage, or logs. Asset previews accept only
the configured BluePrint origin and `/api/v1/assets/*/content` path; the
session cache is bounded to 32 MiB with an 8 MiB per-image limit.
