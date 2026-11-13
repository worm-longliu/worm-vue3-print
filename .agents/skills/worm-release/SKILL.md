---
name: worm-release
description: Use when 要在 worm-vue3-print 发版、补发某个平台的发行版、打 tag、发 npm 包、重打并上传桌面客户端安装包，或排查两平台发行版缺口、版本号不同号、README 直链指向旧资产、附件校验和不符、npm 同号被占用。普通代码改动与不发版的日常提交不适用。
---

# worm-vue3-print 发版

## 目标与边界

一条链把版本发出去：升版载体 → tag 双推 → 两平台发行版 → npm 四包 → 客户端安装包（按需）→ 收尾核对。
判据交脚本跑，不靠记忆。本技能只管发版，不改业务代码；发现业务缺陷先停下来报告。

编排脚本：`.agents/skills/worm-release/scripts/release.mjs`（零新增依赖，下称 `REL`）。
`REL=<本技能目录>/scripts/release.mjs`，六个子命令都支持 `--version=X`、`--base=<上个有资产的 tag>`。

## 门禁（先读这条）

- **四个渠道逐个要用户明示**：GitHub 发行版 / Gitee 发行版 / npm / 安装包上传。一个渠道的授权不覆盖另一个。
- **`--apply` 只是脚本开关，不是授权**。没有用户明示时只跑 dry-run，把将执行的命令交出去。
- 破坏性动作（重指 tag、force-push、删发行版、覆盖已发正文）不在自动化范围，单独请示。
- 版本号由用户定。SemVer 与既有惯例冲突时并列说一次即可，不自作主张升 major。

## 主流程

| 阶段 | 命令 | 关键判据 |
|---|---|---|
| 0 预检 | `node $REL preflight --base=v<上版>` | 载体自检 + 两平台缺口 + npm 同号占用 + 重打判据 |
| 1 升版载体 | 手工，见 `references/carriers.md` | 八包同号、CHANGELOG 折叠、两份内置更新记录、notes、README 直链 |
| 2 打 tag | `node $REL tag --version=X --date=YYYY-MM-DD [--apply]` | 落点＝最后改动本版 CHANGELOG 段那笔；双推后三方对账 |
| 3 发行版 | `node $REL release --version=X [--apply]` | GitHub 走 `release.yml`；Gitee 正文由 notes 派生并匿名逐字复核 |
| 4 npm | `node $REL npm --version=X [--apply]` | 先 `dry_run=true` 绿了才 `false`；发后双源直查 |
| 5 客户端 | `node $REL client --version=X --base=v<上版> [--apply]` | 命中依赖闭包才重打；上传后 digest 逐条对账 |
| 6 核对 | `node $REL verify --version=X --base=v<上版>` | 只读全链，FAIL 0 才算收口 |

顺序约束：tag 先于 release 与 npm（两个工作流都按 tag 检出）；client 上传后于 release（没有发行版无处挂附件）。
`--platform=gh|gitee` 可只发一个平台；`--reuse` / `--no-reuse` 可覆盖自动判出的安装包沿用口径。

## 判据速查

- **tag 落点**不是 HEAD，也不是升版那笔，而是最后一个把自身改动登记进本版 CHANGELOG 段的提交。
- **重打判据**＝`core` / `contract` / `mcp` / `clients` 的 `src`（排除 `*.test.ts` / `*.spec.ts`）＋客户端打包配置。
  `skills` 不算（客户端只把它拼成 npx 命令字符串）；**纯版本号 bump 不算**（升版那笔会改客户端 `package.json` 与 `mcp/src/version.ts`）。
- **Gitee 正文**＝`notes.md` 中文半篇 + 换 Gitee 更新日志链接 + 安装包指向块，不含英文半篇。
- **附件**以 GitHub 侧 `digest` 与本地 `SHA256SUMS.txt` 逐条对齐为准，拿不到 digest 算证据缺失、不算通过。
- **npm** 以官方源与 npmmirror 直查为准，本机 `npm view` 有缓存会骗人。

## 红旗（看到就停）

- 只推了一个远端、或只建了一个平台的发行版就宣称发完。
- 把 `curl` 直链的 `000` 当 404 —— 本机 `github.com:443` 不通，GitHub 侧一律走 `gh api`。
- `check-release-carriers.mjs` 不带 `--base`：沿用上版安装包形态会假红（`needsRepack` 为 null）。
- `clients/print-client/dist` 里混着上一版安装包就出包 —— 会被一起收进 `SHA256SUMS.txt`。
- 没跑 `dry_run=true` 就正式发 npm；或 npm 已占同号还想覆盖（版本号不可复用）。
- 把 `--apply` 当成用户已授权。

## 参考

- `references/carriers.md`：升版文件集、lock 改法、派生面重跑
- `references/gitee.md`：Gitee API 契约、令牌、正文派生与复核
- `references/client-pack.md`：重打判据、镜像变量、Docker 卷坑、上传与对账
- `references/pitfalls.md`：历史事故与假绿假红清单

## 自测

```bash
node --test .agents/skills/worm-release/scripts/release.test.mjs
```

改判据函数必须先改测试看它变红，再改实现。跑绿不算证据：临时改错规则确认对应用例变红，才算判据真的在管事。