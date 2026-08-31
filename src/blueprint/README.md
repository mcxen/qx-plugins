# BluePrint

Qx community plugin for BluePrint Xianji notes.

Configure the BluePrint MCP endpoint and a PAT with `content:read` plus
`content:write`. The plugin discovers the live identity and capabilities, then
provides cached-first note browsing, authenticated image previews, new-note
creation, and complete-model edits with `baseVersion` conflict protection.

The PAT is used only as a Bearer header and is never copied into note content,
URLs, Workbench snapshots, plugin storage, or logs.
