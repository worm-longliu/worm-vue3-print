// 流式列表元素的内容层（对应 canvas 的 FlowListElement.vue）。
// 设计台按「一列一格」铺，不预演跨列：画布不运行出纸的跨列测量与分页，
// 预演只能靠估算，画布与出纸就会出现两套栏数（口径见 specs 第八节第 7 项）。
import {
  DEFAULT_DEMO_DATA,
  detectFlowListKey,
  evaluateTemplate,
  resolveFlowColumns,
  resolveFlowGapX,
  resolveFlowLayoutMode,
  resolveFlowPadding,
  resolveFlowRowHeight,
} from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import type { DesignerStore } from '../core/store'

/** 与 canvas FlowListElement 的 DESIGN_FALLBACK_ITEMS 逐字一致：新拖入的元素也要看得见形状 */
export const FLOW_LIST_DEMO_ITEMS = [
  '黄芪 20g', '当归尾 15g', '赤芍 10g', '川芎 10g',
  '地龙 10g', '桃仁 10g', '红花 10g',
]

function asList(source: unknown): Record<string, any>[] {
  return Array.isArray(source) && source.length > 0 ? source as Record<string, any>[] : []
}

/** 列表源解析，与出纸侧同一序：模板里出现的数组字段 → 记录里第一个数组 → demo 数据 */
function resolveItems(formatter: string, record?: Record<string, any>): Record<string, any>[] {
  const key = detectFlowListKey(formatter, record)
    ?? (record ? Object.keys(record).find(k => Array.isArray(record[k])) : undefined)
  if (key) return asList(record?.[key])
  const demoKey = detectFlowListKey(formatter, DEFAULT_DEMO_DATA)
  return demoKey ? asList(DEFAULT_DEMO_DATA[demoKey]) : []
}

export function flowListCells(el: RuntimeElement, data?: Record<string, any>[]): string[] {
  const o = el.options
  const template = typeof o.formatter === 'string' ? o.formatter : ''
  const record = asList(data)[0]
  const list = resolveItems(template, record)
  if (list.length === 0) return [...FLOW_LIST_DEMO_ITEMS]
  if (!template) return list.map(item => String(item?.name ?? JSON.stringify(item)))
  const rec = record ?? {}
  const key = detectFlowListKey(template, rec) ?? Object.keys(rec).find(k => Array.isArray(rec[k]))
  return list.map(item => {
    try {
      // 行上下文同时暴露列表前缀与行内字段：前缀必须指向这一项而不是整个数组，
      // 否则 {drugs.name} 会对数组取路径得到空串（与出纸 itemCtx 同形）
      return evaluateTemplate(template, { ...rec, ...item, ...(key ? { [key]: item } : {}) })
    } catch {
      return template
    }
  })
}

/** 96dpi 下 1mm ≈ 3.78px（与表格及出纸测量遍同一常量） */
const PX_PER_MM = 3.7795275591
/** 实测高度与模型高度差小于该值（mm）时不回写，避免无意义抖动 */
const HEIGHT_EPSILON_MM = 0.1

function findRealElement(store: DesignerStore, id: string): RuntimeElement | null {
  return (store.templateData.elements as RuntimeElement[]).find(e => e.id === id) ?? null
}

/** 父级元素边框不在内容根节点上，实测容器高度时需补齐上下边框像素 */
function parentBorderPx(root: HTMLElement): number {
  const parent = root.parentElement
  if (!parent?.classList.contains('print-element')) return 0
  const style = getComputedStyle(parent)
  return (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
}

/** 动态模式高度自愈：内容实际撑开的高度回写模型，选中框与跟随区设计底部才会使用同一尺寸 */
function measureFlowList(store: DesignerStore, elId: string, root: HTMLElement) {
  const heightPx = root.offsetHeight + parentBorderPx(root)
  if (heightPx <= 0) return
  // 异步回调里元素可能已被删除或替换，写回前重新取真实元素，避免写到过期对象
  const real = findRealElement(store, elId)
  if (!real) return
  const heightMm = heightPx / PX_PER_MM
  if (Math.abs(heightMm - (real.options.height ?? 0)) > HEIGHT_EPSILON_MM) {
    real.options.height = Math.round(heightMm * 100) / 100
    store.emit(false)
  }
}

/**
 * 挂载后实测探针：绘制期拿不到 DOM 节点，插入一个注释节点作为「本次绘制的后代」，
 * 下一帧它已连在真实树上（若被更新的绘制替换则 isConnected 为假，直接跳过）。
 */
function measureProbe(store: DesignerStore, elId: string): Node {
  const probe = document.createComment('pd-flowlist-measure')
  requestAnimationFrame(() => {
    if (!probe.isConnected) return
    const root = probe.parentElement
    if (root) measureFlowList(store, elId, root)
  })
  return probe
}

export function renderFlowListElement(
  el: RuntimeElement, data?: Record<string, any>[], store?: DesignerStore,
) {
  const o = el.options
  const columns = resolveFlowColumns(o.flowColumns)
  const gapX = resolveFlowGapX(o.flowGapX)
  const rowHeight = resolveFlowRowHeight(o.flowRowHeight)
  const isDynamic = resolveFlowLayoutMode(o.flowLayoutMode) === 'dynamic'
  const padding = resolveFlowPadding(o as unknown as Record<string, unknown>)
  const style: Record<string, string> = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
    columnGap: `${gapX}mm`,
    gridAutoRows: `minmax(${rowHeight}mm,auto)`,
    width: '100%',
    ...(isDynamic
      ? {
          padding: `${padding.top}mm ${padding.right}mm ${padding.bottom}mm ${padding.left}mm`,
          height: 'auto',
          overflow: 'visible',
        }
      : { height: '100%', overflow: 'hidden' }),
    fontSize: `${o.fontSize || 12}pt`,
    fontWeight: o.fontWeight || 'normal',
    color: o.color || '#333',
    boxSizing: 'border-box',
  }
  if (o.fontFamily) style.fontFamily = String(o.fontFamily)
  if (o.backgroundColor) style.backgroundColor = String(o.backgroundColor)
  const children = flowListCells(el, data).map(text =>
    h('div', { class: 'print-flow-cell', text }),
  ) as unknown[]
  if (isDynamic && store) children.push(measureProbe(store, el.id))
  return h('div', { class: 'print-flowlist', style }, children)
}
