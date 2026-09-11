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
- 改动请在提交前运行 `npm run build` 与 `npm test`（core + canvas 全量）。
- 涉及渲染管线的改动需同步 `worm-vue3-print-render` 的验证（两遍渲染逻辑在 core，render 消费 `@worm-vue3-print/core`）。

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
#    可用命令，例如发布 1.2.3：
npm version 1.2.3 -w @worm-vue3-print/core
npm version 1.2.3 -w @worm-vue3-print/canvas
# 根包与 demo/package.json 版本号同步手动修改

# 2. 同步更新记录（三处缺一不可）
#    - docs/中文/CHANGELOG.md
#    - docs/en/CHANGELOG.en.md
#    - packages/print-canvas/src/help-content/changelog.ts（设计器帮助弹窗「更新记录」）
#    - README.md 的「当前版本」

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

- 标签号必须与 core、canvas 的 `version` 完全一致，工作流会强制校验并在不一致时失败；
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

> 范围说明：渲染微服务不在本仓库发布，见 `worm-vue3-print-render`。

## 代码规范

- TypeScript 严格模式，`strict: true`。
- 不引入 Vue/宿主业务依赖到 `core`。
- `canvas` 不依赖 Element Plus 等 UI 框架。