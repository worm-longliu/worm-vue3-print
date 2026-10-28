# Contributing

感谢你对 `worm-vue3-print` 的关注。欢迎提交 Issue、PR 与代码评审意见。

## 开发环境

- Node.js 20+（推荐使用 nvm）
- npm 10+

```bash
npm install
npm run build
npm test
```

## 分支与提交

- 遵循 Conventional Commits：`fix:`、`feat:`、`refactor:`、`docs:`、`chore:`、`test:` 等。
- 改动请在提交前运行 `npm run build` 与 `npm test`（根测试覆盖 core + canvas）。
- 涉及渲染管线的改动可在同仓库验证 `services/print-render`（两遍渲染逻辑在 core，render 经 workspace 软链消费 `@worm-vue3-print/core`）：先 `npx playwright install chromium`，再 `npm run test -w @worm-vue3-print/render`。

## 发布流程

### 方式一：GitHub Actions 自动发布（推荐）

推送 `v` 开头的标签即触发 `.github/workflows/release.yml`，自动执行：
构建 → 测试 → 校验标签与两个包版本一致 → 先发布 core 再发布 canvas → 创建 GitHub Release。

**前置条件（仅首次配置）：**

1. 在 npmjs.com 生成 **Automation** 类型访问令牌（开启 2FA 时只有该类型可在 CI 免 OTP 发布）；
2. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加 secret：`NPM_TOKEN`。

**发版 checklist：**

```bash
# 1. 更新四个包的版本号（必须一致：根包、print-core、print-canvas、demo）
#    print-common 与主线同号，也在此同步（发布走方式三的 publish:common）
#    可用命令，例如发布 1.2.3：
npm version 1.2.3 -w @worm-vue3-print/core
npm version 1.2.3 -w @worm-vue3-print/canvas
# 根包与 demo/package.json 版本号同步手动修改

# 2. 同步更新记录（三处缺一不可）
#    - docs/中文/CHANGELOG.md
#    - docs/en/CHANGELOG.en.md
#    - packages/print-canvas/src/help-content/changelog.ts（设计器帮助弹窗「更新记录」）
#    - README.md 的「当前版本」
#    版本标题格式统一为 `## V1.3.5(2026-10-01)`（大写 V、半角括号紧贴日期），
#    changelog.ts 内为 `<h2>V1.3.5<small>(2026-10-01)</small></h2>`；
#    本仓库标题形态为本地口径，勿改回 Keep a Changelog 的 `## [1.3.5] - 2026-10-01`。

# 3. 更新 GitHub Release 正文模板
#    .github/release/notes.md   ← 工作流会将其作为 Release 正文，
#    不更新则发行版会沿用上一个版本的说明

# 4. 提交并推送
git add -A
git commit -m "chore: 版本号升级至 x.y.z"
git push github master
git push origin master

# 5. 打标签并推送（推 tag 即触发自动发布；标签必须推送到 GitHub）
git tag -a vx.y.z -m "vx.y.z"
git push github vx.y.z
git push origin vx.y.z
```

注意：

- 标签号必须与 core、canvas 的 `version` 完全一致，工作流会强制校验并在不一致时失败（`common` 不参与 release.yml 的标签校验，它由 `publish-common.yml` 单独发布，但版本应与主线同号）；
- canvas 依赖 core，工作流固定按 **core → canvas** 顺序发布；
- 只有推送到 **GitHub** 的标签会触发发布（Gitee 无 Actions），Gitee 发行版需手工创建；
- 在仓库 Actions 页面可查看发布进度与日志；npm registry 有缓存延迟，发布成功后版本号可能需 1～2 分钟才可查询。

### 方式二：本地手工发布

```bash
npm login --registry=https://registry.npmjs.org
npm run publish:npm
```

等价于先 `build + test`，再按 core → canvas 顺序发布。也可分步执行：

```bash
# 1. 版本号（遵循语义化版本，core 与 canvas 保持一致）
npm version patch -w @worm-vue3-print/core
npm version patch -w @worm-vue3-print/canvas

# 2. 构建产物（必须先 core 后 canvas，保证全新环境可解析到 core 的 dist）
npm run build

# 3. 发布（需 npm 登录且拥有 @worm-vue3-print scope）
npm publish -w @worm-vue3-print/core
npm publish -w @worm-vue3-print/canvas
```

> 范围说明：渲染微服务为本仓库私有 workspace 包 `services/print-render`（`@worm-vue3-print/render`），不发布 npm。`packages/print-common` 也发布 npm：与主线同号发正式版，但保留实验性声明，见方式三。

### 方式三：发布 `@worm-vue3-print/common`（正式版本号，保留实验性声明）

`common` 已按主线号发布正式版（dist-tag `latest`），但仍属实验性质：npm 主页面顶部必须保留「实验性、不建议用于生产」声明，并提供 Vue 3 / Vue 2 / React 用法示例。发布可由 `.github/workflows/publish-common.yml` 手动触发，也可走本地脚本。

```bash
# 1. 版本号与主线同号：手改 packages/print-common/package.json 与六份 lock 的 common 条目
# 2. 登录并演练（脚本按 core → canvas → common 构建，跑三套测试，再打印 tarball 与实际使用的 tag）
npm login --registry=https://registry.npmjs.org
npm run publish:common:dry-run

# 3. 正式发布（--tag latest）
npm run publish:common

# 4. 发完自查：latest 必须是正式版
npm run publish:common:check
```

要点：

- **构建顺序不能调**：`scripts/gen-styles.mjs` 从 `packages/print-canvas/dist/canvas.css` 派生样式，canvas 没构建时 common 直接报错退出；
- **`publish:common` 带 `--tag latest`**：正式版直接覆盖 `latest`；只有预发布（版本含 `-`）才用 `publish:common:beta`（`--tag next`）；
- **本机默认 registry 是 `registry.npmmirror.com`**（2026-10-26 实测：不带 `--registry` 的 `npm publish --dry-run` 显示 `Publishing to https://registry.npmmirror.com`）——手敲发布必须显式带 `--registry=https://registry.npmjs.org`，`publish:npm` 与 `publish:common` 里已经写死；
- **`publishConfig.tag` 不是兜底**（实测 npm 11.19：不带 `--tag` 的 dry-run 仍报 `with tag latest`，而 `publishConfig.access/registry` 确实生效）——预发布不要手敲 `npm publish`，走 `publish:common:beta`；
- **GitHub Actions 只能 publish，改 dist-tag 需本机 OTP**：正式版直接写 `latest`，不需要改 tag；只有预发布需要摘除 `latest` 时，本机登录后执行 `npm dist-tag rm @worm-vue3-print/common latest --registry=https://registry.npmjs.org --otp=<OTP>`（仓库令牌对 `dist-tag rm` 返回 403）；
- **common 与主线同号**：方式一/二升版时一起在 `packages/print-common/package.json` 与六份 lock 里改版本；`npm run check:release-carriers` 已把 common 纳入五包同号校验；
- npm 账号若开启 2FA，最后一步会交互式索取验证码，照着 Authenticator 填即可。

### 发版载体自检（发版前后各跑一次）

```bash
npm run check:release-carriers            # 自动判态：未发布段非空＝发版前预检
npm run check:release-carriers -- --post   # 发版后核对：未发布段应已清空、两份内置更新记录应含本版
npm run check:release-carriers -- --base=v1.3.10   # 指定基线，判断改动是否命中 core 渲染管线（命中→七件安装包必须重打）
```

查七项：主线五包版本号是否同号（含 `common`）、「未发布」段是否已折叠、两份 `help-content/changelog.ts` 是否含本版、`.github/release/notes.md` 指向、README 安装包直链表版本、`clients/print-client/dist` 是否混入旧包、变更是否命中 `render/*` 或 `functions/format.ts`。
退出码：0 通过（允许 WARN）/ 1 有 FAIL / 2 读不到载体文件。**已知局限**：「未发布段条数」按 bullet 粗算，只用于判断该段是否已清空；README 直链匹配依赖 `WormPrintClient-<版本>-` 命名，改名要同步 `scripts/check-release-carriers.mjs`。
历史事故对应：1.3.8 功能在包里但内置更新记录缺那条（被迫补发 1.3.9）、README 直链表忘改会指向上一版资产、`dist` 混入旧包会被 `pack-client-release.mjs` 一起收进 SHA256SUMS。

## 代码规范

- TypeScript 严格模式，`strict: true`。
- 不引入 Vue/宿主业务依赖到 `core`。
- `canvas` 不依赖 Element Plus 等 UI 框架。