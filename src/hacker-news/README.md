# Hacker News (Qx plugin)

通过 Hacker News 官方 Firebase API 浏览最新帖子。列表使用 `newstories.json`，选中帖子后显示正文、作者、分数、时间和评论数；评论区按需从 `item/{id}.json` 递归加载，并在宿主 Workbench 的详情底部呈现。

## Features

- 最新帖子列表，可配置首屏加载数量
- 帖子正文与 Hacker News 原帖链接
- 选中后加载嵌套评论，并保留作者、时间和楼层路径
- 持久化 stale-while-revalidate 缓存，网络失败时保留可用内容
- 打开原帖与复制链接

## Data source

- `https://hacker-news.firebaseio.com/v0/newstories.json`
- `https://hacker-news.firebaseio.com/v0/item/{id}.json`

The first release intentionally has no translation provider or AI API setting. Translation is tracked as a follow-up task so a future version can define a safe provider/model configuration and bilingual output contract.

## Host compatibility

Requires Qx **0.6.13+** with the Workbench, HTTP, open-url, clipboard, and plugin persistence ports.

The plugin publishes only Workbench data. Qx owns the shell, keyboard navigation, detail entry/return, Actions menu, Context Panel, and Esc cascade.
