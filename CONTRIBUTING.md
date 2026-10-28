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
#    print-common 不在其中——它走独立的预览号（主线号-beta.N），见方式三
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

- 标签号必须与 core、canvas 的 `version` 完全一致，工作流会强制校验并在不一致时失败（`common` 不参与该校验，它按方式三单独发预览版）；
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

> 范围说明：渲染微服务为本仓库私有 workspace 包 `services/print-render`（`@worm-vue3-print/render`），不发布 npm。`packages/print-common` 是唯一例外——只发**预览版**，见方式三。

### 方式三：发布 `@worm-vue3-print/common` 预览版（本地手工）

`common`（零框架宿主适配设计器）尚未完成稳定性测试，因此**不进 `latest`**：版本号取 `主线号-beta.N`，dist-tag 固定 `next`，不接 GitHub Actions（避免和正式 tag 的节奏绑在一起）。

```bash
# 1. 切预览号：手改两处（与主线发版同口径，npm version 不保证同步 lock）
#    - packages/print-common/package.json 的 "version"
#    - package-lock.json 里 "packages/print-common" 条目的 "version"
#    例：主线 1.4.0 的第 2 轮预览 → 1.4.0-beta.1

## 发版载体自检（发版前后各跑一次）

```bash
npm run check:release-carriers            # 自动判态：未发布段非空＝发版前预检
npm run check:release-carriers -- --post   # 发版后核对：未发布段应已清空、两份内置更新记录应含本版
npm run check:release-carriers -- --base=v1.3.10   # 指定基线，判断改动是否命中 core 渲染管线（命中→七件安装包必须重打）
```

查七项：主线四包版本号是否同号（`common` 走预览号不计入）、「未发布」段是否已折叠、两份 `help-content/changelog.ts` 是否含本版、`.github/release/notes.md` 指向、README 安装包直链表版本、`clients/print-client/dist` 是否混入旧包、变更是否命中 `render/*` 或 `functions/format.ts`。
退出码：0 通过（允许 WARN）/ 1 有 FAIL / 2 读不到载体文件。**已知局限**：「未发布段条数」按 bullet 粗算，只用于判断该段是否已清空；README 直链匹配依赖 `WormPrintClient-<版本>-` 命名，改名要同步 `scripts/check-release-carriers.mjs`。
历史事故对应：1.3.8 功能在包里但内置更新记录缺那条（被迫补发 1.3.9）、README 直链表忘改会指向上一版资产、`dist` 混入旧包会被 `pack-client-release.mjs` 一起收进 SHA256SUMS。

# 2. 登录并演练（脚本按 core → canvas → common 构建，跑三套测试，再打印 tarball 与实际使用的 tag）
npm login --registry=https://registry.npmjs.org
npm run publish:common:dry-run

# 3. 正式发布（同一条链，去掉 --dry-run）
npm run publish:common:beta

# 4. 发完自查：预览版只应挂在 next 上（红灯 exit 1 = latest 仍指向预览版）
npm run publish:common:check
# 红灯时摘除 latest（脚本内已给出等价命令）
node scripts/check-common-dist-tag.mjs --fix
```

要点：

- **构建顺序不能调**：`scripts/gen-styles.mjs` 从 `packages/print-canvas/dist/canvas.css` 派生样式，canvas 没构建时 common 直接报错退出；
- **`--tag next` 是脚本内的硬约束**：手敲 `npm publish` 漏掉它会把实验包挂上 `latest`，非 Vue3 宿主一句 `npm i @worm-vue3-print/common` 就吃到预览版；
- **本机默认 registry 是 `registry.npmmirror.com`**（2026-10-26 实测：不带 `--registry` 的 `npm publish --dry-run` 显示 `Publishing to https://registry.npmmirror.com`）——手敲发布必须显式带 `--registry=https://registry.npmjs.org`，`publish:npm` 与 `publish:common:beta` 里已经写死；
- **`publishConfig.tag` 不是兜底**（实测 npm 11.19：不带 `--tag` 的 dry-run 仍报 `with tag latest`，而 `publishConfig.access/registry` 确实生效）——别指望它防住手敲发布，防线只有两条：脚本里的 `--tag next`，以及发布后 `--fix` 摘掉自动挂上的 `latest`；
- **但 `--tag next` 只约束本次发布写入的 tag，挡不住 npm 给新包首发自动打的 `latest`**：首次发布后 `latest` 与 `next` 同指那个预览版，裸装不会报错而是静默装上实验包。`publish:common:beta` 已在发布后自动跑 `scripts/check-common-dist-tag.mjs --fix` 摘除 `latest`，单独复查用 `npm run publish:common:check`（exit 0 健康 / 1 红灯 / 2 读不到）；
- 主线发版（方式一/二）不动 `common` 的 `version`，避免它被 `1.3.7` 这类正式号带上 `latest`；
- npm 账号若开启 2FA，最后一步会交互式索取验证码（新包首次发布同样需要），照着 Authenticator 填即可；
- 转正条件满足后：`version` 去掉 `-beta.N`，改用 `npm publish -w @worm-vue3-print/common --access public`（不带 `--tag`，落 `latest`），并把该包补进 `publish:npm`、`release.yml` 的标签校验与 README / AGENTS.md 的发布口径。

## 代码规范

- TypeScript 严格模式，`strict: true`。
- 不引入 Vue/宿主业务依赖到 `core`。
- `canvas` 不依赖 Element Plus 等 UI 框架。