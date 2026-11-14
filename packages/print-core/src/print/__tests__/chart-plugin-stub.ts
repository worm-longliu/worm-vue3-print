// P4 测试夹具：core 包内不引入任何图表实现，三端基线用一个「无渲染库依赖」的
// 图表插件替身走通用通道，验证「主体只留机制」后历史模板仍能端到端出图。
// 真实的绑定/出图等价性由 print-echarts 包的 P0 基线负责。
import {
  defineElementPlugin,
  registerElementPlugin,
} from '../../designer/element-plugin-registry.js'

export const CHART_STUB_ID = 'test.chart-stub'

export function registerChartPluginStub(): () => void {
  return registerElementPlugin(defineElementPlugin({
    kind: {
      id: CHART_STUB_ID,
      version: '1',
      type: 'chart',
      label: '图表',
      optionMeta: {
        chartOption: { kind: 'object' },
        chartDataSource: { kind: 'text' },
        chartCategoryField: { kind: 'text' },
        chartValueFields: { kind: 'object' },
        chartSeriesField: { kind: 'text' },
      },
    },
    // 别名桥：让通用 renderAssets 落到旧执行器方法名 renderCharts（§3.9）
    legacyAliases: { renderCharts: 'renderAssets' },
    binding: {
      bind: (options) => ({ _chartOption: options.chartOption ?? {} }),
    },
    render: {
      html: () => '<svg data-chart="fake" viewBox="0 0 100 60"></svg>',
      // 只登记页面执行器、不提供 createRenderer：强制走「收集 → 会话通用通道」两趟流程
      executorBundle: () => ({ name: CHART_STUB_ID, version: 'chart-stub-executor', code: '/* stub */' }),
    },
  }))
}
