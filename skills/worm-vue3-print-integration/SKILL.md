---
name: worm-vue3-print-integration
description: 用于在 Vue 3 项目中集成 @worm-vue3-print/core 或 @worm-vue3-print/canvas；覆盖 NPM 包安装、源码安装、组件接入、业务字段契约、预览打印与常见故障排查。
---

# worm-vue3-print 集成支持

在修改用户项目前，先判断集成目标，再选择安装方式。不要默认所有用户都需要源码安装。

## 1. 先确认集成场景

按以下顺序判断；信息不足时只提出必要的确认问题：

| 场景 | 需要的包 | 推荐安装方式 |
| --- | --- | --- |
| 只做表达式求值、模板数据绑定、服务端 HTML/分页管线 | `@worm-vue3-print/core` | NPM 包 |
| 需要 Vue 3 可视化设计器或浏览器端打印预览 | `@worm-vue3-print/canvas` + `@worm-vue3-print/core` | NPM 包 |
| 需要使用未发布修复、调试库源码、修改/回传补丁 | `core`、按需 `canvas` | 源码安装 |
| 外部宿主要直接消费 monorepo 中的 `.vue/.ts` | 两者按需 | 源码 + Vite 别名 |
| 服务端 PDF / 截图微服务 | 使用 monorepo 内的 `services/print-render`（workspace 软链 core） | 按 `services/print-render/README.md` 安装运行 |

生产项目优先使用 NPM 包；只有用户明确需要改动/调试库源码、消费未发布代码，或项目本身就在该 monorepo 中时，才使用源码安装。

## 2. 快速工作流

1. 读取用户项目构建器、Vue 版本、TypeScript 配置和现有打印/上传能力。
2. 按 [安装方式](references/installation.md) 选择 NPM 或源码方案，并先安装/构建验证。
3. 按 [接入 API](references/integration-api.md) 引入组件与样式，接入业务字段、模板保存、预览和打印。
4. 用一条最小链路验证：设计器保存 JSON → `PrintHtmlPreview` 渲染 → 浏览器打印；若只使用 `core`，验证 `bindData → paginate → generateHtml`。
5. 出现样式、类型、依赖解析或打包问题时，按 [故障排查](references/troubleshooting.md) 定位，不要先改用户业务代码。

## 3. 关键约束

- `core` 是纯 TypeScript，无 Vue 依赖；`canvas` 才依赖 Vue 3，二者边界不能倒置。
- `canvas` 的 peer 依赖是 `vue@^3.5.0`。安装后必须检查 Vue 版本。
- NPM 包安装导入样式使用 `@worm-vue3-print/canvas/style.css`；demo 中的 `native-controls.css` 是源码别名方式，不能原样照搬到 NPM 安装。
- `PrintDesigner` 当前源码声明的事件是 `save` 和 `preview`；不要根据旧文档假设存在 `back` 事件。
- 模板 JSON 不包含模板名称、业务类型、备注等宿主元信息；宿主需自行持久化这些元数据。
- 服务端 PDF / 截图不属于本仓库；`core` 只负责同构渲染管线，最终 Playwright 渲染由独立 render 服务承担。
