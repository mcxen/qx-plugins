# QX Gold 金价追踪

使用京东金融公开接口 `api.jdjygold.com` 获取民生银行积存金价格，缓存真实采样并在 Workbench 详情中显示价格曲线。

插件设置提供 `显示在灵动岛 / Show in Island`：开启时将当前金价发布到 Qx Island，关闭时发布 `null` 并释放该插件的信息位。灵动岛的优先级、布局和抢占策略由 Qx 宿主统一管理，插件只声明 `island` 权限和内容。

The plugin includes a bilingual Island preference. Island priority and placement remain host-managed so this community plugin cannot reserve or override the Qx shell.

数据仅供信息参考，不构成投资建议。
