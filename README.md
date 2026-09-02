# worm-vue3-print

Vue 3 可视化打印模板设计器 + 表达式引擎 + 同构渲染管线的开源 monorepo（npm workspaces）。
不依赖 Element Plus、不依赖宿主 API/路由/租户；宿主（如管理后台 `web`）以源码或 npm 包方式接入。

渲染微服务独立开源为 `worm-vue3-print-render` 仓库（基于 Playwright 的 PDF/截图服务，本仓库不含），
不在本 monorepo 内。

## 包结构

| 包 | 说明 |
|----|------|
| `@worm-vue3-print/core` | 模板表达式引擎与同构渲染管线（HTML 生成/分页/数据绑定），纯 TS，无 Vue/无宿主依赖 |
| `@worm-vue3-print/canvas` | Vue 3 可视化设计器画布（原生控件，无 Element Plus；宿主以源码方式消费） |

- `build`：构建所有包（`npm run build`）
- `test`：运行所有包测试（`npm test`）
- `publish`：`npm run publish` 发布到 npm

## 开发

```bash
npm install        # 在仓库根安装并链接各 workspace 包
npm run build      # 构建所有包
npm test           # 运行所有包测试
```

## 宿主接入

- `web`（宿主）以 `file:` 依赖 `@worm-vue3-print/core` 与 `@worm-vue3-print/canvas`；后者通过 Vite alias
  指向包源码 `packages/print-canvas/src/index.ts` 直接编译（workspace 源码消费，免预构建）。
- `canvas` 提供 `PrintDesigner` / `PrintHtmlPreview` 组件与字段树/截图/上传/业务字典注入点。
- 服务端 PDF/截图经 HTTP 调用独立渲染服务（`worm-vue3-print-render` 仓库）的 `/render/pdf`、`/render/screenshot`。

## 开源

- License：MIT（见 `LICENSE`）。
- 清晰的分层边界：`core`（纯逻辑）→ `canvas`（设计器 UI）；`render`（服务端渲染）独立迭代部署。
- 发布流程见 `CONTRIBUTING.md`。