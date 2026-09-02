# worm-vue3-print

Vue 3 可视化打印模板设计器 + 模板表达式引擎 + 同构渲染管线的开源 monorepo（npm workspaces）。

可视化拖拽设计打印模板、数据绑定、表达式求值、分页排版，浏览器预览与后端输出保持一致。
纯 Vue 3 + HTML/CSS/SVG 原生控件实现，不依赖 Element Plus，不内置业务，可独立接入任意宿主。

## 包结构

| 包 | 说明 |
|----|------|
| `@worm-vue3-print/core` | 模板表达式引擎与同构渲染管线（数据绑定 / HTML 生成 / 分页），纯 TypeScript，无 Vue、无宿主依赖，浏览器与 Node 均可运行 |
| `@worm-vue3-print/canvas` | Vue 3 可视化设计器画布（原生控件，无 Element Plus；含 `PrintDesigner`、`PrintHtmlPreview` 组件） |

## 功能特性

- 可视化画布：拖拽、吸附、对齐、参考线、标尺、图层面板、多选与组合、撤销/重做
- 元素丰富：文本、长文本、数据表格、条形码、二维码、图片、线条、形状、HTML、页码、水印
- 数据绑定：`{field.path}` 字段绑定、表达式求值（safelist 安全执行）、格式化函数
- 智能表格：动态分页、跨页重复表头、序号/小计/汇总、单元格合并
- 同构渲染：一套渲染逻辑同时产出浏览器预览与最终 HTML，保证结果一致
- 内置业务模板：采购收货单、批发销售单、出入库单、库存盘点单
- 毫米（mm）单位精确布局，支持 A4 等纸张规格

## 开发

```bash
npm install      # 在仓库根安装并链接各 workspace 包
npm run build    # 构建所有包
npm test         # 运行所有包测试
```

## 快速使用

```ts
import { bindData, paginate, generateHtml } from '@worm-vue3-print/core'

const bound = bindData(templateJson, printData)      // 数据绑定
const pages = paginate(bound, measured, options)     // 分页排版
const html = generateHtml(pages)                     // 生成 HTML
```

`canvas` 提供 `PrintDesigner`（可视化设计）与 `PrintHtmlPreview`（同构预览）组件；
模板保存、字段查询、图片上传、截图等能力通过 props / 事件 / 适配器由宿主注入。

## 渲染服务

本仓库不包含服务端渲染。独立开源仓库 `worm-vue3-print-render` 基于 Playwright 提供
服务端 PDF / 截图渲染微服务（`/render/pdf`、`/render/screenshot`），与本仓库的 `core`
渲染管线配合，保证浏览器预览与服务端输出结果一致。

## 开源

- License：MIT（见 `LICENSE`）。
- 清晰的分层边界：`core`（纯逻辑）→ `canvas`（设计器 UI）。
- 发布与协作流程见 `CONTRIBUTING.md`。