// 类型声明合并：装了本包的宿主无需改任何 `Record<ElementType, T>` 穷尽映射，
// import 包入口即把 10 个图表类型与专属属性注入主体预留的空扩展点。
import type { ElementOptions, ElementType } from '@worm-vue3-print/core/designer'

export {}

// 编译期自校验：任一声明合并失效时下面的赋值直接编译红
type _ChartTypesInjected =
  'barChart' extends ElementType
    ? 'barHChart' extends ElementType
      ? 'lineChart' extends ElementType
        ? 'areaChart' extends ElementType
          ? 'pieChart' extends ElementType
            ? 'doughnutChart' extends ElementType
              ? 'scatterChart' extends ElementType
                ? 'radarChart' extends ElementType
                  ? 'funnelChart' extends ElementType
                    ? 'gaugeChart' extends ElementType
                      ? true
                      : never
                    : never
                  : never
                : never
              : never
            : never
          : never
        : never
      : never
    : never
type _ChartOptionsInjected = 'chartOption' extends keyof ElementOptions ? true : never
const _typesInjected: _ChartTypesInjected & _ChartOptionsInjected = true
void _typesInjected

declare module '@worm-vue3-print/core/designer' {
  interface PluginElementTypeMap {
    barChart: true
    barHChart: true
    lineChart: true
    areaChart: true
    pieChart: true
    doughnutChart: true
    scatterChart: true
    radarChart: true
    funnelChart: true
    gaugeChart: true
  }

  interface ElementOptions {
    /** ECharts option 模板（纯 JSON，可含 `{字段}` 表达式；series/xAxis 的 data 可写 `$data` 占位） */
    chartOption?: Record<string, unknown>
    /** 数据源路径（与表格 dataSource 同口径：顶层数组键，缺省取数据里第一个数组） */
    chartDataSource?: string
    /** 类目字段名（bar/line/pie 等的 name 维度） */
    chartCategoryField?: string
    /** 数值字段名列表：每项对应一个维度/系列（多值多系列） */
    chartValueFields?: string[]
    /** 系列拆分字段：按该字段取值分组，每组一个 series */
    chartSeriesField?: string
    /** 散点图气泡开关：开启时 chartValueFields[1] 作点大小 */
    chartBubble?: boolean
  }
}

declare global {
  // 页面执行器 IIFE 与 core DOM 执行器共用同一个全局对象（三端注入链路）
  // eslint-disable-next-line no-var
  var __wormDom: Record<string, unknown> | undefined
}
