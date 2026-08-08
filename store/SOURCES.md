# Qx 插件源配置（GitHub / CNB）

商店网页只负责浏览。真正拉索引、下载与安装在 **Qx 应用** 内完成。

入口：**Qx → 设置 → 扩展 → 插件库（Libraries）**

在线版：`#/sources`（QxStore 顶栏「源配置」）。

---

## GitHub 官方源（默认）

| 字段 | 值 |
| --- | --- |
| 名称 | `Qx Official` |
| index_url | `https://raw.githubusercontent.com/mcxen/qx-plugins/main/index.json` |

索引与 `.qx-plugin` 包都走 GitHub raw，适合网络可直连 GitHub 的环境。

---

## CNB 国内源

| 字段 | 值 |
| --- | --- |
| 名称 | `Qx CNB` |
| index_url | `https://cnb.cool/v.ip/qx-plugins/-/git/raw/main/index.json` |

也可只填仓库根，Qx 会尝试解析 `raw/main/index.json`：

```text
https://cnb.cool/v.ip/qx-plugins
```

说明：

- 与 GitHub 同一套 `qx-plugins` 目录。
- 索引里的 `download_url` 可能仍写 GitHub 地址；配置 CNB 源后，Qx **优先从索引旁路径**取包（例如 `…/git/raw/main/brew.qx-plugin`），再回退原 URL。
- 校验和、权限、签名规则与官方源相同。

---

## 推荐步骤

1. 打开 **设置 → 扩展 → 插件库**。
2. 保留 GitHub 源；国内再 **添加** 一条 CNB 源。
3. 若只想用国内镜像：禁用 GitHub，只启用 CNB。
4. 关闭对话框后刷新市场列表，再安装。

可同时启用多个源：列表合并展示，安装时按来源归属下载。

---

## 对照

| | GitHub | CNB |
| --- | --- | --- |
| 默认 | 是 | 否（需手动添加） |
| 典型 index_url | `raw.githubusercontent.com/.../index.json` | `cnb.cool/.../git/raw/main/index.json` |
| 包下载 | GitHub raw | 优先 CNB 旁路文件 |
| 校验 | 相同 | 相同 |

私有 Gogs / Gitea 源同样填写 `index.json` 或仓库根地址即可。
