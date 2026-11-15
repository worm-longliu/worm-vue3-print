# @worm-vue3-print/echarts-common

ECharts 十类图表元素在**零框架设计器**（`@worm-vue3-print/common`）里的宿主适配包：
以 [`@worm-vue3-print/plugin-kit`](../print-plugin-kit) 的框架无关 `ElementUI` 契约，
提供**静态 SVG 画布**与**原生 DOM 图形化属性面板**。

> 状态：1.5.0 起与 core / plugin-kit / common / canvas / echarts **六包同号同批发版**（`publish-npm.yml`），
> 主站 `demo/` 已把它列为运行时依赖。能力边界要清楚：只提供 common 侧的**静态 SVG 画布**
> （无 ECharts 实例、无动画、设计态不消费 `designData`），出纸由 `@worm-vue3-print/echarts` 的页面执行器负责。

## 与 `@worm-vue3-print/echarts` 的关系

- `@worm-vue3-print/echarts` 是图表插件本体：十 kind 的元素语义、默认值、归一、数据绑定、SSR 出图、
  页面执行器与 **Vue 3 设计器组件**（包入口会 import `.vue`）。
- 本包只补 **common 侧的设计器 UI**：`import` 即把一份覆盖十 kind 的 `ElementUI` 注册进 plugin-kit；
  画布与属性台的字段清单、读写口径全部来自 `@worm-vue3-print/echarts/kit` 这个**框架无关纯 TS 子路径**，
  与 Vue 面板共用同一份 `normalizeChartOption` / `previewChartOption` / option 工具，因此两端行为一致。
- 两者互不替代：Vue 3 宿主 import `@worm-vue3-print/echarts` 即可；common 宿主额外 import 本包。
  不要在本包或 `/kit` 之外重写图表逻辑（`core → canvas/common → 宿主` 的单向依赖不得破坏）。

## 能力

| 能力 | 说明 |
| --- | --- |
| 注册 | 十 kind 全部注册到 `@worm-vue3-print/plugin-kit`，`import` 即生效；`install` / `uninstall` 幂等 |
| `renderCanvas` | echarts SSR 出静态 SVG（无实例、无动画、`pointer-events:none`），外层 `.echarts-canvas-element` 铺满元素框；option 非法或渲染失败回落「图表标题 / 类型名」文本占位 |
| `renderProperty` | 原生 DOM 重写 Vue 面板字段：数据源 / 类目字段 / 数值字段（多值增删，按 kind 上限）/ 系列拆分字段 / 气泡开关 / 标题 / 图例 / 配色 / 堆叠 / 内径 / 漏斗内边距 / 雷达半径 / 仪表 min-max / 提示行 |
| `hasProperties` | 与 Vue 面板同口径：只有带图表专属属性（`chartOption` 等）的元素才显示自定义属性页签 |
| `styles` | `.echarts-field-row` 等必要样式，由宿主注入自己的样式作用域（common 注入 Shadow DOM） |

写回统一走 `normalizeChartOption` 后 `ctx.update({ chartOption, ...patch })`，只改面板掌管的键，
`chartOption` 里未知的自定义字段原样保留；历史记录与重绘由宿主负责。

属性控件事件统一用 **`change`**（失焦 / 回车提交）而非 `input`：common 每次 store 变更都会整树重绘，
用 `input` 会让输入框在每次按键后重建、丢焦点。

## 用法

```ts
// 副作用 import：十类图表的 common UI 立刻出现在 plugin-kit 注册表
import '@worm-vue3-print/echarts-common'
```

宿主侧（common）通过 plugin-kit 读取契约即可，无需认识本包：

```ts
import { getElementUI, getElementUIEntries } from '@worm-vue3-print/plugin-kit'

const ui = getElementUI('barChart')
const canvas = ui?.renderCanvas({ element, data: [DEFAULT_DEMO_DATA], designMode: true })
const panel = ui?.renderProperty?.({ element, data: [DEFAULT_DEMO_DATA], update, repaint })
```

手动控制注册时机：

```ts
import { installChartCommonUI, uninstallChartCommonUI } from '@worm-vue3-print/echarts-common'

installChartCommonUI()    // 幂等：重复调用只保留一份注册
uninstallChartCommonUI()  // 幂等：未注册时无副作用
```

## 导出

| 导出 | 内容 |
| --- | --- |
| 副作用 | `import` 包入口即注册十 kind 的 `ElementUI` |
| `CHART_ELEMENT_UI` | 覆盖十 kind 的同一份 `ElementUI`（供宿主自建挂载逻辑或单测） |
| `installChartCommonUI()` | 注册（幂等），返回注销句柄 |
| `uninstallChartCommonUI()` | 注销（幂等） |

## 开发

```bash
npm run build -w @worm-vue3-print/echarts        # 先构建 /kit 子路径产物
npm run build -w @worm-vue3-print/echarts-common
npm run test  -w @worm-vue3-print/echarts-common # vitest + happy-dom
```

测试断言：十 type 全部注册、`renderCanvas` 出 `<svg>`、`renderProperty` 按 kind 裁剪字段、
写回经归一且保留自定义字段、`hasProperties` 判据。
