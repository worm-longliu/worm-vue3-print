# @worm-vue3-print/echarts

打印模板的 **ECharts 图表元素可选包**：图表 SVG 渲染器（echarts SSR）、页面执行器 IIFE、
设计器画布 / 属性组件，以及 `chart` 元素的完整插件描述符。
主包 `@worm-vue3-print/core` 与 `@worm-vue3-print/canvas` 不依赖任何图表库，只有本包引入 `echarts`。

**「import 即注册」**：宿主不需要写任何注册代码，也不需要手写渲染器传参。

## 安装

```bash
npm i @worm-vue3-print/echarts
```

`echarts`（^6.1.0，Apache-2.0）由本包作为 dependency 安装；`@worm-vue3-print/core`、
`@worm-vue3-print/canvas`、`vue` 为 peerDependencies。

## 用法

### 设计器 / 浏览器宿主

```ts
// 一行副作用 import：素材卡、画布组件、「自定义属性」tab、校验、绑定、出图全部生效
import '@worm-vue3-print/echarts'

// 预览与打印都不需要传 chartRenderer / renderers：打印管线按注册表自动收集
```

### 服务端 PDF / Electron 主进程

```ts
// ① 部署白名单：显式 import 才允许该插件进入注册表（模板字符串无法触发 import()）
import '@worm-vue3-print/echarts/node'

// ② runtime 装配：扩展元素执行器由注册表自动收集，新增插件无需改这行代码
//    factory 是宿主自己的 driver 工厂；loadExecutorBundle() 负责读取 core 的 DOM 执行器产物
import { collectExecutorBundles, createDomHostRuntime } from '@worm-vue3-print/core'
createDomHostRuntime(factory, loadExecutorBundle(), undefined, collectExecutorBundles())
```

`/node` 子路径会为描述符补上 `render.executorBundle()`（惰性读取 IIFE 产物），
`collectExecutorBundles()` 因此能按注册态收集；插件同时提供 `createRenderer()`，
正常路径走**进程内 SSR 出图**，页面执行器只在宿主没有进程内能力时才需要。

### 兼容 API（§4.3，无限期保留）

```ts
import { createChartRenderer, installEchartsDesignerExtension } from '@worm-vue3-print/echarts'
import { loadChartExecutorBundle } from '@worm-vue3-print/echarts/node'
```

`createChartRenderer()` / `loadChartExecutorBundle()` / `installEchartsDesignerExtension()`
仍可用，旧三参数 `createDomHostRuntime(factory, coreBundle, chartBundle)` 也仍可出图；
新代码不必再使用它们。执行器注入后挂在 `globalThis.__wormDom.renderCharts(specs)`。

## 配置（`configureChartPlugin`）

配置是**惰性**的：可在注册前调用、按键合并，不需要注销重注册；缺省时行为与旧版逐字一致。

```ts
import { configureChartPlugin } from '@worm-vue3-print/echarts'

configureChartPlugin({
  defaultWidth: 120,
  defaultHeight: 70,
  defaultChartType: 'pie',
  palettes: {
    default: { label: '企业蓝', colors: ['#165DFF', '#36B37E'] }, // 覆盖同名预设
    brand: { label: '品牌色', colors: ['#F2704E', '#F7A35C'] },   // 追加新配色
  },
  sampleCategories: ['一季度', '二季度', '三季度'],
  components: [GaugeChart],   // 追加 echarts.use 的图表/组件构造器
})
```

| 键 | 作用 |
| --- | --- |
| `defaultWidth` / `defaultHeight` | 新建图表元素的 mm 尺寸（默认 100 / 60） |
| `defaultChartType` | 出厂图表类型；非法值回落出厂态 |
| `defaultChartOption` | 直接覆盖出厂 option（优先于 `defaultChartType`） |
| `palettes` | 覆盖同名预设配色或新增配色，属性台下拉即时可见 |
| `sampleCategories` | 设计态无绑定数据时 `$data` 占位的示例类目 |
| `components` | 追加 `echarts.use` 图表/组件；按引用去重，改配置后下次出图生效 |

## 导出

| 子路径 | 内容 |
| --- | --- |
| `.` | `CHART_PLUGIN` / `CHART_PLUGIN_ID` / `CHART_PLUGIN_TYPE` / `CHART_LEGACY_ALIASES`、`registerChartPlugin` / `registerChartDesigner` / `registerChartExecutorBundle` / `uninstallChartPlugin`、`installEchartsDesignerExtension` / `uninstallEchartsDesignerExtension`、`configureChartPlugin` / `getChartPluginConfig` / `getChartPalettes` / `getSampleCategories` / `chartFactoryDefaults`、`createChartRenderer` / `renderChartToSvg` / `fitSvgRoot` / `mmToChartPx`、`bindChartOptions` / `renderChartElement`、`CHART_TYPES` / `CHART_TYPE_LABELS` / `CHART_PALETTES` / `createDefaultChartOption` |
| `./node` | `loadChartExecutorBundle()` + 注册副作用（纯 TS，不含 Vue） |
| `./browser/executor.iife` | 页面注入用 IIFE（echarts 已打入，自包含）；带 `types` 条件，TS 副作用导入不再报缺声明 |

`type-augmentation.ts` 用声明合并把 `chart` 与五个 `chart*` 字段注入 core 的类型扩展点，
并带编译期自校验 —— 已装包宿主的 `Record<ElementType, T>` 穷尽映射无需改动。

## SVG 根节点处理

echarts SSR 产出「固定 px 宽高 + viewBox」的独立 SVG。`renderChartToSvg` 归一为可内联铺满 mm 盒子的矢量图：

- `width` / `height` → `100%`；
- `viewBox="0 0 宽 高"`（96dpi：`px = mm * 96 / 25.4` 取整）；
- 根节点样式固定 `display:block;width:100%;height:100%`。

> 注意：ECharts SSR 的 zrender class 前缀是进程级递增计数器（`zr0-cls-0`…）。
> 同一进程内做 HTML 逐字基线比较时必须固定用例顺序，或归一化 class 名。

## 设计器属性组件约定

`ChartPropertyGroup.vue` 的 props 与 canvas 内置元素一致：

```ts
{ element: RuntimeElement; data?: Record<string, any>[] }
```

提交通道：`emit('change')`（记历史）、`emit('update:options', partial)`（受控合并），
图形化 / JSON 两种模式互斥，JSON 非法时只在组件内提示、不写回画布。
「自定义属性」tab 由实例级 `hasProperties(element)` 判据决定显示。

## 构建

```bash
npm run build -w @worm-vue3-print/echarts
npm run test  -w @worm-vue3-print/echarts
```

- `vite build`：主入口 `dist/index.{js,cjs}`（Vue SFC 由 `@vitejs/plugin-vue` 编译，外部依赖不打包）；
- `tsup`：`dist/node.{js,cjs}` 与 `dist/executor.iife.global.js`；并把 `src/browser/executor.iife.d.ts`
  复制为 `dist/executor.iife.global.d.ts` 供 exports 的 `types` 条件使用；
- `vue-tsc`：d.ts 类型声明；`inject-license-banner`：版权头。

## 想做自己的扩展元素？

见 `docs/中文/指南/自定义元素插件开发.md`（分步教程 + 契约签名表 + 常见坑）与
可直接复制的脚手架 `examples/custom-element-plugin/`。
