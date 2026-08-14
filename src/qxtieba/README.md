# QxTieba 贴吧

QxTieba 是 Qx 的百度贴吧社区插件。它读取游客可见的公开页面，不需要百度账号，也不依赖 Python 或 MCP 运行时。

## 功能

- 默认提供“图拉丁吧”和“笔记本吧”，通过顶部标签切换
- 在插件设置中配置一个或多个贴吧，支持逗号/换行分隔及“Python”“Python吧”两种写法
- “混合”标签并发读取所有配置贴吧，并交错合并帖子；单个贴吧失败不影响其他贴吧
- 浏览吧内帖子 Feed，并继续加载下一页
- 在 Qx 主从视图中阅读主楼正文、图片和可分支折叠的楼层/楼中楼回复树
- 识别正文、楼层和楼中楼评论中的 `image_emoticon*` 代码，并通过 Workbench 通用的
  `content[]` 行内协议使用安装包内的紧凑贴吧表情原位显示
- 本地搜索已加载帖子，标记已读/未读
- stale-while-revalidate 缓存与 3/7 天自动清理
- 网络或贴吧风控异常时保留并展示已有缓存
- 在浏览器中打开原帖查看完整楼层

## 数据来源

插件按照 `astron-tieba-mcp 0.1.7` 的游客态协议重新实现：Feed 使用贴吧移动端公开吧页，帖子、楼层与楼中楼评论使用 `tiebac.baidu.com` 的 app-compatible Protobuf 接口。插件不再用容易返回 HTTP 403 的桌面 Feed 和帖子 HTML 作为评论数据源。

## 权限

- `http`：请求贴吧公开页面
- `open-url`：打开百度贴吧原帖

## 第三方表情资源

`assets/emotions/` 来自
[Tieba_mobile_emotions](https://github.com/microlong666/Tieba_mobile_emotions)，
由其作者从百度贴吧移动端提取。上游声明资源仅供学习交流与个人非营利使用；相关图片版权
归原权利人所有，QxTieba 不将其声明为 Qx 自有或开放授权素材。详见包内
`THIRD_PARTY_NOTICES.md`。
