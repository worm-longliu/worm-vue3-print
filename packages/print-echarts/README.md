# @worm-vue3-print/echarts

> [!IMPORTANT]
> **【迁移公告】** `worm-vue3-print` 已进入维护状态，稳定主版本 1.5.x 已迁至 **worm-print-platform**（[Gitee](https://gitee.com/liulong_oschina/worm-print-platform) ｜ [GitHub](https://github.com/worm-longliu/worm-print-platform)）；npm scope `@worm-vue3-print/*` → `@worm-print-platform/*`。
> **本包迁移去向**：[`@worm-print-platform/echarts`](https://www.npmjs.com/package/@worm-print-platform/echarts)，升级为 npm 正式包，`/kit` 子路径保留，新增 `/ui`（`import '@worm-print-platform/echarts/ui'` 一行即注册）。完整步骤见[新仓迁移指南](https://github.com/worm-longliu/worm-print-platform/blob/master/docs/migration-worm-vue3-print.md)。

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

### 零框架宿主 / 自建设计器 UI（`/kit`）

`/kit` 是**框架无关的纯 TS 出口**：不包含任何 `.vue` 组件、不读磁盘，import 即把十个 kind 注册到
core 插件注册表，但**不**注册设计器组件与执行器产物。零框架宿主用它自建画布与属性台：

```ts
import {
  CHART_KIND_DEFINITIONS, createDefaultChartOption, normalizeChartOption,
  previewChartOption, renderChartToSvg,
} from '@worm-vue3-print/echarts/kit'
```

`@worm-vue3-print/echarts-common` 就是基于 `/kit` + `@worm-vue3-print/plugin-kit` 的 common 适配包
（静态 SVG 画布 + 原生 DOM 属性面板）；框架无关宿主不必重复实现面板读取/写回逻辑。

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
| `./kit` | 框架无关纯 TS 出口（无 Vue、无 `node:fs`）：注册副作用 + 上表纯逻辑能力 + 常量（`CHART_PALETTES` / `FUNNEL_PADDING_DEFAULTS` / `RADAR_RADIUS_DEFAULT` 等）与面板读写工具（`previewChartOption` / `readPaletteKey` / `syncSeriesCount` / `readFunnelPadding` / `writeFunnelPadding` / `readRadarRadius` / `writeRadarRadius`） |
| `./node` | 注册副作用 + `render.executorBundle()`（惰性读取 IIFE 产物，纯 TS、不含 Vue） |
| `./browser/executor.iife` | 页面注入用 IIFE（echarts 已打入，自包含）；带 `types` 条件 |

`type-augmentation.ts` 用声明合并把十个图表类型与 `chartOption` 等专属字段注入 core 的类型扩展点，
并带编译期自校验——已装包宿主的 `Record<ElementType, T>` 穷尽映射无需改动。

## 设计器属性面板

- **只提供图形化配置**：数据源 / 类目字段 / 数值字段 / 系列拆分 / 标题 / 图例 / 配色 /
  堆叠 / 气泡 / 内径 / 仪表盘范围 / 漏斗内边距 / 雷达半径，按元素类型裁剪；不提供 JSON 编辑器。
- 模板 JSON 仍允许手写 `chartOption`（开发者与 AI 的出口），面板只改自己掌管的字段。
- 提交通道：`emit('change')`（记历史）、`emit('update:options', partial)`（受控合并）。

## 留白（内边距 / 半径）

ECharts 的图表内边距是 option 自身的布局参数，插件负责给出适合打印小框的出厂值，并把这几个值放进属性台。

| 元素 | 面板控件 | 落到 chartOption | 出厂默认 |
| --- | --- | --- | --- |
| `funnelChart` | 内边距 上/右/下/左 (%) | `series[].top/right/bottom/left` | `6% / 25% / 6% / 5%` |
| `radarChart` | 半径 (%) | `radar.radius` | `75%` |

- **漏斗图**不写内边距时会吃 ECharts 的 px 默认（左右 80、上 60、下 65），60×60mm 的元素框里图形只剩一半不到；
  现阶段默认把四边压到 5~6%，右侧保留 25% 给**外置标签与引导线**（标签超出元素框会被 `overflow:hidden` 裁掉，
  不要为了铺满把右边距调到 10% 以下；标签想更靠边可以手写 `series.label.position: 'inside'`）。
- **雷达图**的 ECharts 6 默认 `radar.radius` 是 `50%`（5.x 是 `75%`），70×60mm 框里图形直径只有短边一半，
  默认值已恢复为 `75%`；想更大可调到 `80%` 左右，再大轴名会顶到框边。
- 面板显示统一为百分比：手写 `chartOption` 里的 px 数字会按当前元素框折算成百分比回读。
- 出厂默认只作用于**新建元素**；存量模板的 `chartOption` 已落盘，出图不变，需要时在属性台或模板 JSON 里改。

## SVG 根节点处理

echarts SSR 产出「固定 px 宽高 + viewBox」的独立 SVG。`renderChartToSvg` 归一为可内联铺满 mm 盒子的矢量图：

- `width` / `height` → `100%`；
- `viewBox="0 0 宽 高"`（96dpi：`px = mm * 96 / 25.4` 取整）；
- 根节点样式固定 `display:block;width:100%;height:100%`。

## 构建

```bash
npm run build -w @worm-vue3-print/echarts
```
