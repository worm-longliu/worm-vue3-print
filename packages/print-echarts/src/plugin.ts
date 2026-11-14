// ECharts 图表元素插件描述符（P4）
//
// 本文件是「图表」这一元素类型在主体之外的唯一知识来源：种类声明、专属属性元数据、
// 数据绑定、出图与兼容别名全部在这里。主体只保留通用机制（注册表 / 校验 / 渲染分派）。
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
  ElementRenderSpec,
  PluginExecutorBundle,
  PrintElementPlugin,
} from '@worm-vue3-print/core/designer'
import { evaluateTemplate } from '@worm-vue3-print/core'
import type { ChartSpec } from '@worm-vue3-print/core'
import { renderChartToSvg } from './renderer.js'
import { CHART_PLUGIN_ID } from './constants.js'
import { chartFactoryDefaults } from './config.js'
import { CHART_EXECUTOR_VERSION } from './version.js'

export { CHART_PLUGIN_ID } from './constants.js'
export const CHART_PLUGIN_TYPE = 'chart'

/** 兼容别名映射：以数据形式提供，主体源码只做通用查表转发（设计文档 §3.9） */
export const CHART_LEGACY_ALIASES: Readonly<Record<string, string>> = {
  chartRenderer: 'renderers',
  renderCharts: 'renderAssets',
  chartBundle: 'bundles[0]',
  loadChartExecutorBundle: 'executorBundles',
}

// ─── 数据绑定：与旧 core bindChartData 逐行等价（结果写运行时选项，不落模板） ───

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function evaluateChartOption(node: unknown, data: Record<string, unknown>): unknown {
  if (typeof node === 'string') {
    // `$data` 是数据占位，不能被求值抹平（含 `$data.xxx` 形式）
    if (node.startsWith('$data')) return node
    return node.includes('{') ? evaluateTemplate(node, data) : node
  }
  if (Array.isArray(node)) return node.map(item => evaluateChartOption(item, data))
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = evaluateChartOption(value, data)
    }
    return out
  }
  return node
}

function chartNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function hasDataPlaceholder(series: Record<string, any>): boolean {
  return Array.isArray(series.data) && series.data.includes('$data')
}

function applyChartCategories(option: Record<string, any>, categories: unknown[]): void {
  const axes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis]
  for (const axis of axes) {
    if (!axis || typeof axis !== 'object') continue
    if (Array.isArray(axis.data) && axis.data.includes('$data')) axis.data = categories
  }
}

function applyChartData(
  option: Record<string, any>,
  rows: Record<string, any>[],
  categoryField: string | undefined,
  valueFields: string[],
  seriesField: string | undefined,
): void {
  const rawSeries: Record<string, any>[] = Array.isArray(option.series) ? option.series : []
  if (rawSeries.length === 0 || !rawSeries.some(hasDataPlaceholder)) return
  const categories = rows.map((row, index) => (categoryField ? row[categoryField] : index + 1))
  const fieldAt = (index: number): string => valueFields[Math.min(index, valueFields.length - 1)]!

  if (seriesField) {
    const template = rawSeries[0]!
    const groups = new Map<string, Map<string, number>>()
    for (const row of rows) {
      const name = String(row[seriesField] ?? '')
      const bucket = groups.get(name) ?? new Map<string, number>()
      const value = chartNumber(row[fieldAt(0)])
      // 同一类目重复时按累加处理，避免静默丢点
      bucket.set(String(row[categoryField ?? '']), (bucket.get(String(row[categoryField ?? ''])) ?? 0) + value)
      groups.set(name, bucket)
    }
    const distinctCategories = [...new Set(categories)]
    option.series = [...groups.entries()].map(([name, bucket]) => ({
      ...template,
      name,
      data: distinctCategories.map(category => bucket.get(String(category)) ?? null),
    }))
    applyChartCategories(option, distinctCategories)
    return
  }

  option.series = rawSeries.map((series, index) => {
    if (!hasDataPlaceholder(series)) return series
    const field = fieldAt(index)
    if (series.type === 'pie') {
      return {
        ...series,
        data: rows.map(row => ({ name: categoryField ? row[categoryField] : '', value: chartNumber(row[field]) })),
      }
    }
    if (series.type === 'scatter') {
      const xField = categoryField ?? valueFields[0]!
      return {
        ...series,
        data: rows.map(row => [chartNumber(row[xField]), chartNumber(row[field])]),
      }
    }
    return { ...series, data: rows.map(row => chartNumber(row[field])) }
  })
  applyChartCategories(option, categories)
}

/** 与表格/流式列表同口径的数据源解析：显式 dataSource → 顶层第一个数组 */
function resolveListSource(
  opts: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, any>[] {
  const fields = Array.isArray(opts.fields) ? opts.fields as Array<Record<string, unknown>> : []
  const explicitKey = (opts.dataSource ?? fields[0]?.dataSource ?? fields[0]?.field) as string | undefined
  if (explicitKey && Array.isArray(data[explicitKey])) return data[explicitKey] as Record<string, any>[]
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) return value as Record<string, any>[]
  }
  return []
}

/**
 * 绑定钩子：返回要合并进元素 options 的补丁。旧 core 分支写 `opts._chartOption = option`，
 * 主体 P2 的通用分派用 Object.assign 合并返回值，两者语义一致。
 */
export function bindChartOptions(
  options: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const rawOption = options.chartOption
  if (!rawOption || typeof rawOption !== 'object' || Array.isArray(rawOption)) return {}
  const option = evaluateChartOption(rawOption, data) as Record<string, any>
  const valueFields = Array.isArray(options.chartValueFields)
    ? options.chartValueFields.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : []
  const categoryField = typeof options.chartCategoryField === 'string' ? options.chartCategoryField : undefined
  const seriesField = typeof options.chartSeriesField === 'string' ? options.chartSeriesField : undefined
  const list = resolveListSource(
    { ...options, dataSource: options.chartDataSource ?? options.dataSource },
    data,
  )
  if (list.length > 0 && valueFields.length > 0) {
    applyChartData(option, list, categoryField, valueFields, seriesField)
  }
  return { _chartOption: option }
}

// ─── 出图：与旧 core case 'chart' 逐字等价 ───

/** 通用渲染规格 → 图表规格（尺寸由主体在 default 分支以通用字段注入） */
function toChartSpec(spec: ElementRenderSpec): ChartSpec | undefined {
  const option = (spec._chartOption ?? spec.chartOption) as Record<string, unknown> | undefined
  if (!option || typeof option !== 'object' || Array.isArray(option)) return undefined
  return {
    key: String(spec.key ?? ''),
    option,
    widthMm: Number(spec.widthMm ?? spec.width ?? 0),
    heightMm: Number(spec.heightMm ?? spec.height ?? 0),
    fontFamily: typeof spec.fontFamily === 'string' ? spec.fontFamily : undefined,
  }
}

/** 无 option / 渲染失败时返回与旧 chart 分支一致的 `<span>标题</span>` 占位 */
export function renderChartElement(spec: ElementRenderSpec): string {
  const chartSpec = toChartSpec(spec)
  if (!chartSpec) return `<span>${escapeHtml(String(spec.title ?? '图表'))}</span>`
  try {
    return renderChartToSvg(chartSpec)
  } catch {
    return `<span>${escapeHtml(String(spec.title ?? '图表'))}</span>`
  }
}

// ─── 描述符 ───

// 出厂默认统一由 config.ts 的 chartFactoryDefaults() 提供：
// core 元素工厂与 canvas 素材卡共用一份，配置键由 configureChartPlugin() 惰性覆盖。

export const CHART_PLUGIN: PrintElementPlugin = defineElementPlugin({
  kind: {
    id: CHART_PLUGIN_ID,
    version: CHART_EXECUTOR_VERSION,
    type: CHART_PLUGIN_TYPE,
    label: '图表',
    icon: '▤',
    fixedHeight: true,
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'chartOption'],
    notes: 'ECharts 图表：series[].data 写 $data 占位，按 chartDataSource + chartCategoryField/chartValueFields/chartSeriesField 绑定数据；固定高，禁止 autoHeight',
    defaultOptions: chartFactoryDefaults as PrintElementPlugin['kind']['defaultOptions'],
    optionMeta: {
      chartOption: { kind: 'object', label: '图表 option' },
      chartDataSource: { kind: 'text', label: '数据源' },
      chartCategoryField: { kind: 'text', label: '类目字段' },
      chartValueFields: { kind: 'object', label: '数值字段' },
      chartSeriesField: { kind: 'text', label: '系列拆分字段' },
    },
  },
  legacyAliases: CHART_LEGACY_ALIASES,
  binding: { bind: bindChartOptions },
  render: {
    html: renderChartElement,
    createRenderer: () => ({ render: renderChartElement }),
  },
})

let disposeHandle: (() => void) | undefined

/**
 * 注册（同 id 幂等覆盖）；返回注销句柄。包入口与 /node 子路径在 import 时各触发一次模块副作用。
 * `extraRender` 供 Node 入口补充只能在文件系统侧取得的页面执行器产物：浏览器入口不读 fs，
 * 但同进程内先注册的能力（designer / executorBundle）在后续合并注册时不会被抹掉。
 */
export function registerChartPlugin(
  designer?: ElementPluginDesigner,
  extraRender?: Partial<ElementPluginRender>,
): () => void {
  const current = getElementPluginById(CHART_PLUGIN_ID)
  const merged: PrintElementPlugin = defineElementPlugin({
    ...CHART_PLUGIN,
    ...(designer ?? current?.designer ? { designer: designer ?? current?.designer } : {}),
    render: { ...CHART_PLUGIN.render, ...current?.render, ...extraRender },
  })
  const dispose = registerElementPlugin(merged)
  disposeHandle = dispose
  return dispose
}

/** 设计器侧补充注册 Vue 组件；保留 core 侧已注册描述符的其余字段 */
export function registerChartDesigner(designer: ElementPluginDesigner): () => void {
  return registerChartPlugin(designer)
}

/**
 * Node 宿主补充：把页面 IIFE 执行器产物挂到描述符（P5 自动装配）。
 * provider 是惰性的 —— 只有 collectExecutorBundles() 收集时才会读磁盘产物。
 */
export function registerChartExecutorBundle(provider: () => PluginExecutorBundle): () => void {
  return registerChartPlugin(undefined, { executorBundle: provider })
}

/** 兼容 API：注销本插件（返回注销句柄由调用方自行保存时用不到本函数） */
export function uninstallChartPlugin(): void {
  disposeHandle?.()
  disposeHandle = undefined
}

// 包入口 / Node 子路径 import 即自动注册（D7）。注册表挂 globalThis 固定 Symbol，
// 同 id 覆盖是幂等的；模块只执行一次，不会重复注册。
registerChartPlugin()
