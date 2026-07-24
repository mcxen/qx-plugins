# QxWeibo 微博

QxWeibo 是使用 Qx 原生 Workbench 的只读微博模块，支持：

- 指定主用户 UID，读取该用户公开帖子。
- 配置多个关注用户 UID，或从主 UID 的公开关注列表中限量聚合帖子。
- 选择帖子后按需加载完整正文、首屏评论和全部图片。
- 评论接入 Workbench 通用底部回复区，统一显示真实楼号（缺失时按接口顺序编号）、
  作者、时间、楼主标记和回复关系。
- 多游客 Cookie 轮换、低并发请求和随机间隔。
- 微博图床图片经 Qx HTTP 端口代理为会话预览，不直接交给图片浏览器。
- Feed、评论和已读状态缓存优先显示；离线时继续阅读旧缓存。

## 设置

1. 在 Qx → Settings → Extensions → Installed → QxWeibo 中填写主用户 UID。
2. 如需精确控制关注流，在“关注用户 UID”中每行填写一个数字 UID。
3. 可在“游客 Cookie 池”中每行填写一组 `SUB=...; SUBP=...`。留空时插件会在
   当前会话自动申请游客 Cookie；Cookie 不进入帖子缓存。
4. 随机请求间隔默认 `500-1200` 毫秒。建议保持温和范围，不要设置为零。

本插件仅提供公开内容的只读浏览，不支持登录写操作、发帖、点赞、评论或关注。

## 源码结构

- `index.source.js`：命令和 Panel 组合入口。
- `source/weibo.js`：微博请求、Cookie 池、缓存、限流及 Workbench 工作流。
- `source/media.js`：图片代理与安全预览转换。
- `index.js`：构建生成的自包含运行时入口；不要直接编辑。

运行 `npm run build:qxweibo` 生成入口，`npm run package:plugins` 会先构建再打包。
