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

需要执行以下脚本进行登录和发布

```
npm login --registry=https://registry.npmjs.org
npm run publish:npm
```

发布为 npm 包（core 先于 canvas）：

```bash
# 1. 版本号（遵循语义化版本）
npm version patch -w @worm-vue3-print/core
npm version patch -w @worm-vue3-print/canvas

# 2. 构建产物
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