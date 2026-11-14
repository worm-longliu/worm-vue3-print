// 类型声明合并（P4 / D6）
//
// 装了本包的宿主无需改任何 `Record<ElementType, T>` 穷尽映射、也无需改模板字段类型：
// import 包入口即解析到本声明，把 'chart' 与五个专属属性注入主体预留的空扩展点。
// 未装包的宿主看不到这些类型——按设计文档 §4.1，能打印图表的宿主必然已 import 本包。
import type { ElementType, ElementOptions } from '@worm-vue3-print/core/designer'

export {}

// 编译期自校验：声明合并真的生效才会推导为 true，否则下面的赋值直接编译红。
// 这样「装包宿主零改动拿到完整 ElementType 与五个专属属性」有硬闸门，而不是文档约定。
type _ChartTypeInjected = 'chart' extends ElementType ? true : never
type _ChartOptionInjected = 'chartOption' extends keyof ElementOptions ? true : never
const _pluginTypesInjected: _ChartTypeInjected & _ChartOptionInjected = true
void _pluginTypesInjected

declare module '@worm-vue3-print/core/designer' {
  interface PluginElementTypeMap {
    chart: true
  }

  interface ElementOptions {
    /** ECharts option 模板（纯 JSON，可含 `{字段}` 表达式；series/xAxis 的 data 可写 `$data` 占位） */
    chartOption?: Record<string, unknown>
    /** 数据源路径（与表格 dataSource 同口径：顶层数组键，缺省取数据里第一个数组） */
    chartDataSource?: string
    /** 类目字段名（bar/line/pie 的 name 维度） */
    chartCategoryField?: string
    /** 数值字段名列表：每项对应一个 series（多值多系列） */
    chartValueFields?: string[]
    /** 系列拆分字段：按该字段取值分组，每组一个 series */
    chartSeriesField?: string
  }
}

declare global {
  // 页面执行器 IIFE 与 core DOM 执行器共用同一个全局对象（三端注入链路）
  // eslint-disable-next-line no-var
  var __wormDom: Record<string, unknown> | undefined
}
