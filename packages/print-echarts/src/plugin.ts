// ECharts 图表元素插件描述符（一个插件 · 十个 kind）
//
// 本文件是「图表」这组元素在主体之外的唯一知识来源：种类声明、专属属性元数据、
// 数据绑定、出图与设计器组件全部在这里。主体只保留通用机制（注册表 / 校验 / 渲染分派）。
//
// 重要：本文件不得 import 任何 Vue SFC —— src/node.ts 由 tsup 单独打包成 Node 入口，
// 走纯 TS 链路。设计器组件由 src/index.ts 调 registerChartDesigner 补充注册。
import {
  defineElementPlugin,
  getElementPluginById,
  registerElementPlugin,
} from '@worm-vue3-print/core/designer'
import type {
  ElementPluginDesigner,
  ElementPluginRender,
  PrintElementPlugin,
} from '@worm-vue3-print/core/designer'
import { bindChartData } from './bind.js'
import { chartFactoryDefaults } from './config.js'
import { CHART_PLUGIN_ID } from './constants.js'
import { CHART_KIND_DEFINITIONS } from './kinds.js'
import { renderChartElement } from './renderer.js'
import { CHART_EXECUTOR_VERSION } from './version.js'

export { CHART_PLUGIN_ID } from './constants.js'

/** 十类图表元素共享的数据契约（strict 校验与 AI 提示词共用） */
const CHART_OPTION_META = {
  chartOption: { kind: 'object' as const, label: '图表 option' },
  chartDataSource: { kind: 'text' as const, label: '数据源' },
  chartCategoryField: { kind: 'text' as const, label: '类目字段' },
  chartValueFields: { kind: 'object' as const, label: '数值字段' },
  chartSeriesField: { kind: 'text' as const, label: '系列拆分字段' },
}

const SCATTER_OPTION_META = {
  ...CHART_OPTION_META,
  chartBubble: { kind: 'bool' as const, label: '气泡大小' },
}

export const CHART_PLUGIN: PrintElementPlugin = defineElementPlugin({
  id: CHART_PLUGIN_ID,
  version: CHART_EXECUTOR_VERSION,
  kinds: CHART_KIND_DEFINITIONS.map(def => ({
    type: def.type,
    label: def.label,
    icon: def.icon,
    fixedHeight: true,
    requiredOptionKeys: def.requiredOptionKeys,
    notes: def.notes,
    optionMeta: def.type === 'scatterChart' ? SCATTER_OPTION_META : CHART_OPTION_META,
    defaultOptions: partial => chartFactoryDefaults(def.type, partial as Record<string, unknown> | undefined),
    binding: { bind: (options, data) => bindChartData(def.type, options, data) },
  })),
  render: {
    html: renderChartElement,
    createRenderer: () => ({ render: renderChartElement }),
  },
})

let disposeHandle: (() => void) | undefined

/**
 * 注册（同 id 幂等覆盖）；返回注销句柄。浏览器入口补 designer，Node 入口补 executorBundle，
 * 两次注册按 id 合并，合并后仍共享同一份 kinds 描述符。
 */
export function registerChartPlugin(
  designer?: ElementPluginDesigner,
  extraRender?: Partial<ElementPluginRender>,
): () => void {
  const current = getElementPluginById(CHART_PLUGIN_ID)
  if (!designer && !extraRender) {
    const dispose = registerElementPlugin(CHART_PLUGIN)
    disposeHandle = dispose
    return dispose
  }
  const merged: PrintElementPlugin = {
    ...CHART_PLUGIN,
    designer: designer ?? current?.designer ?? CHART_PLUGIN.designer,
    render: { ...CHART_PLUGIN.render, ...current?.render, ...extraRender },
  }
  const dispose = registerElementPlugin(merged)
  disposeHandle = dispose
  return dispose
}

/** 兼容入口：设计器侧补充 Vue 组件 */
export function registerChartDesigner(designer: ElementPluginDesigner): () => void {
  return registerChartPlugin(designer)
}

/** Node 宿主补页面执行器产物：provider 惰性，只有 collectExecutorBundles() 收集时才读磁盘 */
export function registerChartExecutorBundle(provider: () => { name: string; version: string; code: string }): () => void {
  return registerChartPlugin(undefined, { executorBundle: provider })
}

/** 注销本插件 */
export function uninstallChartPlugin(): void {
  disposeHandle?.()
  disposeHandle = undefined
}

// 包入口 / Node 子路径 import 即自动注册
registerChartPlugin()
