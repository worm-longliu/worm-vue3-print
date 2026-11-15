# @worm-vue3-print/echarts

打印模板的 **ECharts 图表元素可选包**：一个插件注册十个图表元素，提供 SVG 渲染器（echarts SSR）、
页面执行器、设计器画布 / 图形化属性面板与共享数据契约。
主包 `@worm-vue3-print/core` 与 `@worm-vue3-print/canvas` 不依赖任何图表库，只有本包引入 `echarts`。

**「import 即注册」**：宿主不需要写任何注册代码，也不需要手写渲染器传参。

> 状态：本包随工作区主线开发，**尚未发布到 npm**；请以工作区依赖或源码方式引入。

## 安装

```bash
npm i @worm-vue3-print/echarts
```

`echarts`（^6.1.0，Apache-2.0）由本包作为 dependency 安装；`@worm-vue3-print/core`、
`@worm-vue3-print/canvas`、`vue` 为 peerDependencies。

## 十个元素

| type | 元素 | 默认尺寸 | 数据映射要点 |
| --- | --- | --- | --- |
| `barChart` | 柱状图 | 100×60 | 类目 + 多数值字段（多值多系列） |
| `barHChart` | 条形图（横向） | 100×60 | 类目写 yAxis，xAxis 为数值 |
| `lineChart` | 折线图 | 100×60 | 同柱状图，series 为 line |
| `areaChart` | 面积图 | 100×60 | 折线 + areaStyle |
| `pieChart` | 饼图 | 60×60 | 类目 + 首数值 → `{ name, value }` |
| `doughnutChart` | 环形图 | 60×60 | 饼图 + 可配内径 |
| `scatterChart` | 散点图 | 80×60 | 类目作 x、首数值作 y；`chartBubble` 开启时第二数值作点大小 |
| `radarChart` | 雷达图 | 70×60 | 数值字段=维度，每行一个系列 |
| `funnelChart` | 漏斗图 | 60×60 | 类目 + 首数值，按数值降序 |
| `gaugeChart` | 仪表盘 | 60×60 | 取首行首值；min/max 面板可配 |

所有元素共用同一份数据契约：`chartOption` + `chartDataSource` / `chartCategoryField` /
`chartValueFields` / `chartSeriesField`（散点另有 `chartBubble`）。
模板只存 option 模板与字段映射，真实数据由 core 绑定阶段注入；`series[].data` 写 `$data` 占位即可。

## 用法

### 设计器 / 浏览器宿主

```ts
// 一行副作用 import：素材卡、画布组件、「自定义属性」tab、校验、绑定、出图全部生效
import '@worm-vue3-print/echarts'
```

### 服务端 PDF / Electron 主进程

```ts
// ① 部署白名单：显式 import 才允许该插件进入注册表（模板字符串无法触发 import()）
import '@worm-vue3-print/echarts/node'

// ② runtime 装配：扩展元素执行器由注册表自动收集，新增插件无需改这行代码
import { collectExecutorBundles, createDomHostRuntime } from '@worm-vue3-print/core'
createDomHostRuntime(factory, loadExecutorBundle(), collectExecutorBundles())
```

`/node` 子路径会为描述符补上 `render.executorBundle()`（惰性读取 IIFE 产物），
`collectExecutorBundles()` 因此能按注册态收集；插件同时提供 `createRenderer()`，
正常路径走**进程内 SSR 出图**，页面执行器只在宿主没有进程内能力时才需要。
执行器注入后挂在 `globalThis.__wormDom.renderAssets(specs)`（与 core 的 `renderAssets` 协议同名）。

## 配置（`configureChartPlugin`）

配置是**惰性**的：可在注册前调用、按键合并，不需要注销重注册。

```ts
import { configureChartPlugin } from '@worm-vue3-print/echarts'

configureChartPlugin({
  defaultWidth: 120,          // 新建图表元素的全局默认尺寸（kind 自带默认值，配置优先）
  defaultHeight: 70,
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
| `defaultWidth` / `defaultHeight` | 新建图表元素的默认 mm 尺寸（kind 默认尺寸可被覆盖） |
| `palettes` | 覆盖同名预设配色或新增配色，属性台下拉即时可见 |
| `sampleCategories` | 设计态无绑定数据时 `$data` 占位的示例类目 |
| `components` | 追加 `echarts.use` 图表/组件；按引用去重，改配置后下次出图生效 |

## 导出

| 子路径 | 内容 |
| --- | --- |
| `.` | `CHART_PLUGIN` / `CHART_PLUGIN_ID` / `CHART_KINDS` / `CHART_KIND_DEFINITIONS` / `getChartKindDefinition` / `resolveChartPanelFields` / `createDefaultChartOption` / `normalizeChartOption` / `bindChartData` / `renderChartToSvg` / `renderChartElement` / `fitSvgRoot` / `mmToChartPx` / `configureChartPlugin` / `getChartPluginConfig` / `getChartPalettes` / `getSampleCategories` / `chartFactoryDefaults` / `registerChartPlugin` / `uninstallChartPlugin` / `installChartDesigner` / `uninstallChartDesigner` |
| `./node` | 注册副作用 + `render.executorBundle()`（惰性读取 IIFE 产物，纯 TS、不含 Vue） |
| `./browser/executor.iife` | 页面注入用 IIFE（echarts 已打入，自包含）；带 `types` 条件 |

`type-augmentation.ts` 用声明合并把十个图表类型与 `chartOption` 等专属字段注入 core 的类型扩展点，
并带编译期自校验——已装包宿主的 `Record<ElementType, T>` 穷尽映射无需改动。

## 设计器属性面板

- **只提供图形化配置**：数据源 / 类目字段 / 数值字段 / 系列拆分 / 标题 / 图例 / 配色 /
  堆叠 / 气泡 / 内径 / 仪表盘范围，按元素类型裁剪；不提供 JSON 编辑器。
- 模板 JSON 仍允许手写 `chartOption`（开发者与 AI 的出口），面板只改自己掌管的字段。
- 提交通道：`emit('change')`（记历史）、`emit('update:options', partial)`（受控合并）。

## SVG 根节点处理

echarts SSR 产出「固定 px 宽高 + viewBox」的独立 SVG。`renderChartToSvg` 归一为可内联铺满 mm 盒子的矢量图：

- `width` / `height` → `100%`；
- `viewBox="0 0 宽 高"`（96dpi：`px = mm * 96 / 25.4` 取整）；
- 根节点样式固定 `display:block;width:100%;height:100%`。

## 构建

```bash
npm run build -w @worm-vue3-print/echarts
```
