# @worm-vue3-print/echarts

打印模板的 **ECharts 图表元素可选包**：提供图表 SVG 渲染器（echarts SSR）、三端注入用的页面执行器，以及 canvas 设计器图表扩展。
主包 `@worm-vue3-print/core` 与 `@worm-vue3-print/canvas` 不依赖任何图表库，只有本包引入 `echarts`。

## 安装

```bash
npm i @worm-vue3-print/echarts
```

`echarts`（^6.1.0，Apache-2.0）由本包作为 dependency 自动安装（包内按需注册，不会进入 core/canvas 产物）；`@worm-vue3-print/core`、`@worm-vue3-print/canvas`、`vue` 为 peerDependencies。

## 用法

```ts
// 1) 设计器：注册 chart 元素（创建 PrintDesigner 前调用一次）
import { installEchartsDesignerExtension } from '@worm-vue3-print/echarts'
installEchartsDesignerExtension()

// 2) 宿主渲染管线：图表渲染器（两趟回填：先收集 ChartSpec，再回填 SVG）
import { createChartRenderer } from '@worm-vue3-print/echarts'
const chartRenderer = createChartRenderer()

// 3) 服务端 / Electron：注入图表执行器产物（页面上下文）
import { loadChartExecutorBundle } from '@worm-vue3-print/echarts/node'
const chartBundle = loadChartExecutorBundle() // { source, version }
```

执行器注入后挂载在 `globalThis.__wormDom.renderCharts(specs)`（core 的 `EXECUTOR_TARGETS.renderCharts='none'`）：
入参 `ChartSpec[]`，返回 `Record<key, svg>`；单个图表渲染失败只跳过该 key，由 core 降级为文本占位。

## 导出

| 导出 | 说明 |
| --- | --- |
| `.` | `createChartRenderer` / `renderChartToSvg` / `installEchartsDesignerExtension` / `CHART_TYPES` / `CHART_TYPE_LABELS` / `CHART_PALETTES` / `createDefaultChartOption` |
| `./node` | `loadChartExecutorBundle()`（读取 `dist/executor.iife.global.js`） |
| `./browser/executor.iife` | 页面注入用 IIFE 产物（echarts 已打入，自包含） |

## SVG 根节点处理

echarts SSR 产出「固定 px 宽高 + viewBox」的独立 SVG。`renderChartToSvg` 将其归一为可内联铺满 mm 盒子的矢量图：

- `width` / `height` → `100%`
- 注入 `viewBox="0 0 宽 高"`（宽高按 96dpi：`px = mm * 96 / 25.4` 取整）
- 根节点样式固定 `display:block;width:100%;height:100%`

因此内联进打印元素盒后按比例铺满、随盒子矢量缩放，不产生位图。

## 设计器扩展属性组件约定

`ChartPropertyGroup.vue` 的 props 与 canvas 内置元素一致：

```ts
{ element: RuntimeElement; data?: Record<string, any>[] }
```

提交通道（两条同时走，canvas 侧可按需对接）：

1. 直接写入响应式的 `element.options.chartOption` / `chartDataSource` / `chartCategoryField` / `chartValueFields` / `chartSeriesField`；
2. `emit('change')`（无参，与 canvas `CodeGroup` 等属性组件同口径，可接 `@change="recordHistory()"`）；
3. `emit('update:options', partial)`（受控提交，便于 canvas 合并 options 并记历史）。

图形化模式与 JSON 模式互斥：JSON 编辑器非法时只在组件内提示错误，不写回画布。

## 构建

```bash
npm run build -w @worm-vue3-print/echarts
npm run test  -w @worm-vue3-print/echarts
```

- `vite build`：主入口 `dist/index.{js,cjs}`（ESM + CJS，Vue SFC 由 `@vitejs/plugin-vue` 编译；`echarts`/`vue`/`core`/`canvas` 全部 external）；
- `tsup`：`dist/node.{js,cjs}` 与 `dist/executor.iife.global.js`（IIFE，echarts 打入，自包含）；
- `vue-tsc`：d.ts 类型声明。
