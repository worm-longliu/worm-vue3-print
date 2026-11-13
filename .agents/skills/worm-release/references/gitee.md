# Gitee 发行版：端点契约与正文派生

仓库 `liulong_oschina/worm-vue3-print`（`origin`）。Gitee 无 Actions，发行版只能走 API 或网页。

## 令牌与认证

- 变量名 **`GITEE_ACCESS_TOKEN`**，明文存 `~/.zshenv`（agent shell 只加载这个文件，写 `.zshrc` 静默不可见）。形状：32 位小写 hex。
- **写操作只走表单参数 `access_token=`**。同一令牌用 `Authorization: Bearer` 头做写操作会回「登录失效，无权限访问该资源」。
- 读可匿名。报告里一律不出现令牌明文。
- 动手前先测长度与形状；`GITEE_TOKEN` 是错名字，长度为 0。

## 端点（实测）

| 动作 | 端点 | 必带参数 |
|---|---|---|
| 新建 | `POST /api/v5/repos/{owner}/{repo}/releases` | `access_token`、`tag_name`、`name`、`target_commitish`、`body` |
| 改正文 | `PATCH /api/v5/repos/{owner}/{repo}/releases/{id}` | `access_token`、**`tag_name`**、`name`、`body` |
| 列表 | `GET /api/v5/repos/{owner}/{repo}/releases?per_page=100` | 匿名可读 |

坑位：

- 新建**必须走仓库级**路径；误用 issue 那套 owner 级 `/repos/{owner}/releases` 回 **405**，极易误判成权限问题。
- 新建漏 `target_commitish` 回 `400 target_commitish is missing`；PATCH 不必带，且 `target_commitish` 会随 tag 落点自动重算。
- 中文多行正文用 `--data-urlencode "body@文件"`；`-F "body=@文件"` 会被当文件上传，回 `400 body is invalid`。
- 列表**默认旧→新**，`per_page=5` 只拿到最早 5 条，会误判「没有新版」。
- `GET /releases/tags/{tag}` 匿名返回非 JSON，别用它定位。
- 同一 tag 可能并存多条发行版，读写一律用 **release id** 定位，不用 tag。

## 正文派生规则（脚本 `deriveGiteeBody` 已实现）

权威来源是 `.github/release/notes.md`，**不另写一份**：

1. 切出中文半篇：截到 `# … — English` 标题行之前。找不到该标记就抛错，不静默返回整篇。
2. 更新日志链接换域：`github.com/worm-longliu/…/blob/master/docs/中文/CHANGELOG.md` → `gitee.com/liulong_oschina/…` 同路径。
3. 删掉 `## 安装包` 段，换成 `---` 之后的指向块：说明 Gitee 附件单文件上限 100MB，六件安装包与 `SHA256SUMS.txt` 在 GitHub 的对应发行版；沿用上版时额外写明「不重打安装包，沿用 `v<上版>`」。

标题沿用 `# Worm Print V<版本> (<日期>)`，`name` 字段用纯 tag 名（`v1.4.8`），与 GitHub 侧一致。

## 复核（写完必做）

- 用**匿名 GET** 列表筛 `tag_name`，比对正文与派生稿**逐字一致**、字符数相符。
- `assets` 恒为 2（自动生成的源码包），历史上从未有自定义附件。
- 源码包真实直链是 `https://gitee.com/{owner}/{repo}/archive/refs/tags/<tag>.zip`（`.tar.gz` 同理）。
  **`/releases/download/<tag>/<tag>.zip` 是猜的形态，会 404**；`/releases/tag/<tag>` 与 `/releases/<id>` 都 302 到 archive，不是人看的页面。
- 人看的入口是列表页 `https://gitee.com/{owner}/{repo}/releases`，核它含本版 tag。

## 附件口径

Electron 产物 dmg 127–142MB、exe 115MB，全部超 Gitee 单文件 100MB 上限 ⇒ **安装包只挂 GitHub，Gitee 正文放指向**。这是用户 2026-10-06 拍板的口径，不要试图往 Gitee 传安装包。