# 假绿、假红与历史事故

每条都配判据。发版是长时段动作，凭印象宣称完成是这里最贵的错误。

## 一、假绿（看着通过，其实没证据）

| 现象 | 真相 | 判据 |
|---|---|---|
| `gh release upload` 无输出就说传完了 | 无输出不等于落库 | `gh api …/releases/<id>/assets` 的 `digest` 与本地 `SHA256SUMS.txt` 逐条对齐 |
| `curl -sIL <GitHub 直链>` 得 `000` 当成 404 | 本机 `github.com:443` 不通，`000` 是连不上 | GitHub 侧一律 `gh api`；`api.github.com` 可达 |
| `npm view <pkg> version` 显示旧版就说没发出去 | 默认 registry 是 `registry.npmmirror.com`，且有本地缓存 | 直查两个源的 JSON：官方 `registry.npmjs.org/<pkg>` 与 npmmirror，比对 `dist-tags.latest` 与 `versions` |
| 只推了一个远端 / 只建了一个平台 | 双仓库两平台是四条独立通路 | `git ls-remote --tags <remote> refs/tags/v<X>^{}` 两个远端 + 两平台 release 各查一次 |
| 单测跑绿就说判据在管事 | 断言可能根本没被触发 | 临时改错规则看对应用例变红，再逐字节还原 |
| 产物里 grep 不到某能力就说没进包 | `dist/index.js` 只是 re-export barrel，代码在 `dist/chunk-*.js` | `npm pack` 解包后在**整个 dist 树**里 grep |
| `git diff` 为空就说没改动 | 未跟踪文件恒不出现在 diff 里 | `git status` 看未跟踪项 |

## 二、假红（其实没问题，判据自己错了）

- **`check-release-carriers.mjs` 不带 `--base`**：缺省 `HEAD` → `git diff HEAD..` 为空 → `needsRepack` 为 null →
  「沿用上版安装包」形态下 README 那条判 FAIL。**本技能一律显式传 `--base=v<上版>`**，不去改脚本缺省值。
- **重打判据把升版那笔算进去**：`clients/print-client/package.json` 与 `packages/print-mcp/src/version.ts` 只改版本号，
  按文件路径匹配会误判要重打，连带把 README 期望值算成本版。判据必须排除**纯版本号 diff**（`isVersionOnlyDiff`）。
- **dry-run 里跑构建后检查**：还没出包就核 dist 卫生，会把上一版安装包报成「卷又带回旧包」。构建后检查只在 `--apply` 下跑。
- **Gitee 源码包 URL 靠猜**：`/releases/download/<tag>/<tag>.zip` 是 GitHub 形态，Gitee 回 404。
  真实地址从 API 的 `browser_download_url` 读，形如 `/archive/refs/tags/<tag>.zip`。

## 三、历史事故（别再犯）

1. **1.3.8 功能在包里、内置「更新记录」缺文案 → 被迫补发 1.3.9**。
   npm 同号不可覆盖，只能另切补丁版。教训：两份 `help-content/changelog.ts` 是**必改载体**，
   且改完要重跑 `node demo-common/apps/jquery/scripts/sync-assets.mjs`（vendor 产物未入库）。
2. **README 直链表忘改 → 指向上一版资产**。重打版切号、沿用版留上版，两种形态都不能漏判。
3. **dist 混版**：`pack-client-release.mjs` 收 dist 里全部安装包；Linux 命名卷还会把旧包再带回一次。出包前后各核一遍。
4. **正文写「自 v上版以来 N 次提交」**：登记这笔自身写完 N 就变了，必然少算自己。改写「实改动 N 笔」。
5. **同号重发的前提没先证**：把修复并进已发版本号，必须先确认 npm 未占用该号；一旦发出，这条路封死，只能另起版本。

## 四、环境与权限的硬边界

- **npm 写操作**：本机无凭据（`npm whoami --registry=https://registry.npmjs.org` → 401），
  正式发走 GitHub Actions 手动 dispatch（`publish-npm.yml` / `publish-common.yml`，先 `dry_run=true`）。
  `dist-tag rm` 需维护者 OTP，CI token 会 403 —— 交用户，别反复试。
- **`publishConfig.tag` 不被 npm 11 采纳**：不带 `--tag` 仍发 `latest`；同份配置里 `access` 与 `registry` 确实生效。
  防误挂 `latest` 只有脚本里的 `--tag` 与发布后摘 tag 两条防线。
- **手敲 `npm publish` 必须显式 `--registry=https://registry.npmjs.org`**，否则发到镜像。
- **Gitee 写操作只走表单 `access_token=`**，Bearer 头做写操作回「登录失效」；令牌明文永不进报告。
- **`gh auth login` 的设备码只在有 TTY 时输出**，agent 拿不到，必须用户在自己终端跑；动手前 `gh auth status` 复核登录态。
- **未签名 / 未公证**：不要为发布自建 ad-hoc 重签，Gatekeeper 提示会更差。

## 五、长时段动作的并发防护

发版期间可能有别的会话在改同一工作区（历史上出现过上传途中冒出 10 处非本次改动）。

- 提交一律 `git commit --only <显式路径>`，**绝不 `git add -A`**。
- 发现外来改动先 `git diff` 判归属并向用户披露，**不替他回滚**。
- 基线对账取 `HEAD`，别把别人在途的新增当成本次漏接。