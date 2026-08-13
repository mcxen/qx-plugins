# Art Wallpapers — Another boring piece. Daily.

A Qx-native rewrite of the business intent behind
[another-boring-piece](https://github.com/raycast/extensions/tree/7037b506c3452a48c7edc893c55cd53b16afa8b7/extensions/another-boring-piece),
using the public [anotherboring.day](https://anotherboring.day) service.

Original authorship is retained:

- Author: **yevgen_glukhov**
- Contributors: **alexi.build**, **0xdhrv**
- Upstream license: **MIT**

This port replaces the Raycast UI and runtime with a host-rendered Qx Workbench.
The single panel contains a compact **Today / History** view with native detail,
Actions, keyboard navigation, theme handling, and Esc behavior.

Features:

- Today's hand-picked artwork plus two fresh discoveries
- Set, download, copy, or open each artwork
- Random wallpaper command
- Opt-in background rotation, disabled by default
- Local history for selected, downloaded, and automatically rotated artwork
- Six-hour stale-while-revalidate catalog cache
- Bounded 20-slot local wallpaper file cache with deterministic reuse
- History capped at 200 entries

Only catalog data and normalized history metadata are persisted. Image bytes are
stored in a bounded plugin-owned ring for the host wallpaper setter; downloaded
copies go directly to the user's Downloads directory.

## 中文说明

每日浏览 anotherboring.day 精选艺术作品，可设为壁纸、下载、复制链接或打开作品页。
界面使用 Qx 原生 Workbench，并把今日作品与历史记录收敛到一个简洁面板。自动轮换默认关闭；
目录缓存采用六小时 SWR，本地壁纸文件使用最多 20 个循环槽位，历史最多保留 200 条。
