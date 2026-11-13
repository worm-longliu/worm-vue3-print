# 升版载体与派生面

版本号由用户定。载体漏改是历史事故高发区，逐项核，不靠记忆。

## 同号范围（2026-11-12 实测 1.4.8）

八个 `package.json` 同主线号：根、`print-core`、`print-canvas`、`print-common`、`print-skills`、`print-contract`、`print-mcp`、`clients/print-client`。

- `services/print-render` **自身留 `1.0.0`**，只抬它对 core 的依赖范围。
- `print-client` 对 core 是 `*`，无需改范围；`print-mcp` 要同时抬 `core` 与 `contract` 两个范围。
- `print-common` 与主线同号发正式版（dist-tag `latest`），但 npm 主页面与 README 必须保留实验性声明。
- `packages/print-mcp/src/version.ts` 是版本单点常量，随号改；它只改号时**不触发客户端重打**。

**自检脚本只校验其中六包**（根、core、canvas、client、common、skills，见 `scripts/check-release-carriers.mjs:35-48`），
`contract` 与 `mcp` 不在它的同号断言里 —— 这两包漏升号不会报错，要手工核。

## 升版笔的文件集（先例 `d3dfbb2`，28 文件）

| 类别 | 文件 |
|---|---|
| 版本号 | 上列八份 `package.json` + `services/print-render/package.json`（只改依赖范围）+ `mcp/src/version.ts` |
| lock | 根、`demo/`、`demo-common/apps/{jquery,react,vue2,vue3}/` 共 6 份 |
| 更新日志 | `docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md` |
| 内置更新记录 | `packages/print-canvas/src/help-content/changelog.ts`、`packages/print-common/src/shell/help-content/changelog.ts` |
| Release 正文 | `.github/release/notes.md`（整篇换成本版双语正文） |
| 直链与说明 | `README.md`、`packages/print-common/README.md`、`packages/print-skills/README.md`、`skills/README.md`、`examples/*/README.md` |

## lock 只按第一方白名单改

**禁盲替换版本号文本**：`1.4.0` 这类字面量与第三方包同号，全局替换会改坏 `expect-type` / `once` / `@noble/hashes` 的 `version` 字段（`resolved` 仍指旧版）。

做法：解析 JSON，只改 `key === ""` 或 `name` 以 `@worm-vue3-print/` 开头的条目，`file:` 与 `*` 不动。
判据：改完 `npm ci --dry-run` 必须 `up to date`；再断言三方包版本未被波及。

## 更新日志与正文

- 标题形态固定 `## V1.4.8(2026-11-11)`（大写 V + 半角括号），中英两份同步，不用 Keep a Changelog 的 `[x.y.z] - date`。
- 发版时把「未发布」段折进新版本段，折完该段应为空。
- `notes.md` 只装**当前待发版本**的双语正文，上一版不留存；旧版口径以 CHANGELOG 为权威。
- **正文里不写「自 v上版以来 N 次提交」**：写进 tag 落点那笔后 N 会变，必然少算自己。改写「实改动 N 笔」并列提交号。

## README 直链表（7 条）

`README.md`「下载客户端安装包」一节是 7 条完整 URL（链接文本就是地址本身）。

- **重打版**：tag 与文件名一起切到本版。
- **沿用上版**：整条表留上版不动，并在表上方注明「可下载的最新安装包来自 `v<上版>`」。改成同号反而 404。
- 三段口径必须保留：下载不动时用迅雷/IDM/qBittorrent 续传；Linux 三包 sandbox/fuse 坑；未经 Linux 真机验证与未签名声明。
- 核对：`gh api repos/worm-longliu/worm-vue3-print/releases/tags/<tag> --jq '.assets[].name'`。

## 派生面必须重跑

```bash
node demo-common/apps/jquery/scripts/sync-assets.mjs   # public/vendor/worm-print-common.js 是未入库产物
node demo-common/scripts/verify-demo.mjs [url]         # 默认 http://localhost:9331/，需先起宿主
```

不重跑 `sync-assets`，jQuery 直挂宿主的内置「更新记录」还带上一版文案。

## 自检

```bash
node scripts/check-release-carriers.mjs --pre  --base=v<上版>   # 发版前
node scripts/check-release-carriers.mjs --post --base=v<上版>   # 发版后
npm run lint:print-architecture                                 # 新增 src/main 平台适配文件要同步 ALLOW 白名单
```

**`--base` 必须带**：缺省是 `HEAD`，`git diff HEAD..` 为空 → `needsRepack` 为 null → 沿用上版安装包形态下 README 那条会假红。
退出码 0 通过（允许 WARN）/ 1 有 FAIL / 2 读不到载体。