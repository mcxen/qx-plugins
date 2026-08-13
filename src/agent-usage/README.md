# Agent Usage for Qx

Agent Usage is a clean Qx-native rewrite of the business intent behind Raycast's
[Agent Usage](https://github.com/raycast/extensions/tree/22d64eb97c47ca6ddf9d53444e7ee4375a0b2134/extensions/agent-usage).
No Raycast UI, runtime shim, or converter output is included.

The 1.0 release focuses on two provider paths that were verified against their
real services before publication:

- Codex reads the local Codex CLI session and displays the primary and secondary
  rate-limit windows, plan, credits, code-review limits, and additional limits.
- Grok reads the local Grok CLI session and parses the binary gRPC-Web billing
  response, including remaining credits and the next reset.

The panel uses Qx's host-rendered Workbench, so search, selection, detail
navigation, Actions, shortcuts, theme, and Esc behavior remain native to Qx. It
shows a cached snapshot immediately and refreshes stale data in the background.
Only normalized quota results are cached; local tokens and raw responses are
never persisted or logged.

Local sessions:

- Codex: choose **Sign In** or **Reconnect** in the provider Actions. Qx runs
  `codex login --device-auth`, opens only the official OpenAI sign-in URL, and
  refreshes usage after the CLI writes `~/.codex/auth.json`.
- Grok: use the same Action for `grok login --device-auth`; credentials remain
  owned by the official CLI in `~/.grok/auth.json`.
- Settings contains independent Codex and Grok visibility controls. Tokens are
  never copied into Qx preferences or the plugin cache.

## 中文说明

这是一次面向 Qx 的彻底重写，不包含 Raycast 组件、兼容层或转换器产物。1.0 版本只发布
已完成真实接口验证的 Codex 与 Grok：自动读取本机 CLI 登录态，以轻量 Workbench 展示
剩余额度、窗口与重置时间。服务商 Actions 可直接启动官方设备登录并展示进度，登录完成后
自动刷新；设置页可分别控制两个服务商是否显示。面板优先显示缓存，再静默刷新；访问令牌和
原始响应不会写入 Qx 偏好或插件缓存。
