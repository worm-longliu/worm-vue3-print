// 布局配方 preset：把 skills 布局配方文档里的确定性数值编码成结构化数据，
// print_draft_template 传 preset 即得版式骨架，模型只做业务映射不再算坐标。
// 展开只做纵向切条与左右分栏，元素仍走 core 元素工厂补默认值，几何显式键优先。
import type { PaperSize } from '@worm-vue3-print/core/designer'
import { getPaperDimensions, isContinuousPaperSize } from '@worm-vue3-print/core'
import type { DraftElement, DraftSpec } from './draft.js'
import { DRAFT_PRESETS } from './presets-data.js'

export { DRAFT_PRESETS }

export interface PresetCol {
  /** 占内容宽的比例，末栏取剩余宽避免浮点误差越界 */
  ratio: number
  /** 栏内元素；left/width/height 缺省由展开代码计算，显式给的优先 */
  element: DraftElement
}

export interface PresetBlock {
  /** 语义槽位：title / meta / divider / table / barcode / footer 等，供 print_element_kinds 展示 */
  slot: string
  /** 区块高度 mm，纵向坐标由展开代码按此累加 */
  height: number
  /** 区块主元素；cols 给出时可省。几何缺省时占满内容宽，显式键优先 */
  element?: DraftElement
  /** 同一横条左右并排的栏（仅支持一层）；给出后主 element 不参与展开 */
  cols?: PresetCol[]
}

export interface DraftPreset {
  id: string
  /** 一句话适用场景，供 print_element_kinds 的 presets 清单展示 */
  scene: string
  paper: NonNullable<DraftSpec['paper']>
  blocks: PresetBlock[]
}

export interface PresetSummary {
  id: string
  scene: string
  slots: string[]
}

export interface ExpandedPreset {
  /** 合并覆盖项并补缺省后的最终纸张设置 */
  paper: NonNullable<DraftSpec['paper']>
  elements: DraftElement[]
  /** 结构性问题（安全线被挤破等），交给 draftTemplate 汇入总 issues */
  issues: { path: string; level: 'error' | 'warning'; message: string }[]
}

/** 固定纸内容底边安全余量（mm）：配方文档避坑清单第 1 条 */
const CONTENT_BOTTOM_SAFETY_MM = 2

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * 表格列宽按元素最终宽度等比缩放，末列吸收舍入误差（保证两位小数下合计 = 元素宽）。
 * 只改展开产物的新 options/数组，不触碰 preset 源数据；源数据没有列宽时跳过。
 */
function scaleTableColWidths(el: DraftElement): DraftElement {
  const o = el.options
  if (!o) return el
  const widths = o.tableColWidths
  const width = o.width
  if (!Array.isArray(widths) || widths.length === 0 || typeof width !== 'number' || width <= 0) return el
  const sum = widths.reduce((s, w) => s + w, 0)
  if (!(sum > 0)) return el
  const scaled = widths.map(w => round2(w * width / sum))
  // 末列吸收累计舍入误差，避免列宽合计与元素宽差 0.01 触发体检告警
  const start = scaled.slice(0, -1).reduce((s, w) => s + w, 0)
  scaled[scaled.length - 1] = round2(width - start)
  return { ...el, options: { ...o, tableColWidths: scaled } }
}

/** 展开几何：数据显式给的键优先，其余按区块计算补齐 */
function withGeometry(
  el: DraftElement,
  geo: { left: number; top: number; width: number; height: number },
): DraftElement {
  return {
    ...el,
    options: { left: geo.left, top: geo.top, width: geo.width, height: geo.height, ...el.options },
  }
}

/** 过滤 undefined 键：spread 直接覆盖会把 preset 里已填的键抹掉 */
function definedOverrides(o: DraftSpec['paper']): Partial<NonNullable<DraftSpec['paper']>> {
  if (!o) return {}
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<NonNullable<DraftSpec['paper']>>
}

export function listPresetSummaries(): PresetSummary[] {
  return DRAFT_PRESETS.map(p => ({
    id: p.id,
    scene: p.scene,
    slots: p.blocks.map(b => (b.cols?.length ? `${b.slot}(左右两栏)` : b.slot)),
  }))
}

/**
 * 展开 preset 为版式骨架：纵向切条累加 top，带 cols 的横条按比例左右分栏。
 * overrides 是调用方（spec.paper）的覆盖项，合并后再算内容宽，保证几何始终贴合最终纸张。
 */
export function expandPreset(id: string, overrides?: DraftSpec['paper']): ExpandedPreset | undefined {
  const preset = DRAFT_PRESETS.find(p => p.id === id)
  if (!preset) return undefined

  const paper: NonNullable<DraftSpec['paper']> = {
    ...preset.paper,
    ...definedOverrides(overrides),
  }
  const paperSize: PaperSize = paper.paperSize ?? 'A4'
  const orientation = paper.orientation ?? 'portrait'
  const margins = paper.margins ?? { top: 10, right: 10, bottom: 10, left: 10 }
  const dims = getPaperDimensions({
    paperSize,
    orientation,
    ...(paper.customWidth !== undefined ? { customWidth: paper.customWidth } : {}),
    ...(paper.customHeight !== undefined ? { customHeight: paper.customHeight } : {}),
  })
  const contentW = dims.width - margins.left - margins.right
  const contentH = dims.height - margins.top - margins.bottom

  const elements: DraftElement[] = []
  let y = 0
  for (const block of preset.blocks) {
    if (block.cols?.length) {
      let x = 0
      block.cols.forEach((col, ci) => {
        const isLast = ci === block.cols!.length - 1
        const w = isLast ? round2(contentW - x) : round2(col.ratio * contentW)
        elements.push(withGeometry(col.element, { left: round2(x), top: round2(y), width: w, height: block.height }))
        x += w
      })
    } else if (block.element) {
      elements.push(withGeometry(block.element, { left: 0, top: round2(y), width: round2(contentW), height: block.height }))
    }
    y += block.height
  }

  // 列宽跟随最终内容宽：纸张/边距被覆盖后，preset 源数据的列宽只当比例用
  const scaledElements = elements.map(el => (el.type === 'table' ? scaleTableColWidths(el) : el))

  const issues: ExpandedPreset['issues'] = []
  // 连续纸高度按内容推导，没有版心安全线概念；固定纸末条底边必须留 2mm
  if (!isContinuousPaperSize(paperSize) && y > contentH - CONTENT_BOTTOM_SAFETY_MM + 1e-9) {
    issues.push({
      path: 'preset',
      level: 'error',
      message: `preset ${id} 内容总高 ${y.toFixed(1)}mm 超出版心安全线`
        + `（内容高 ${contentH.toFixed(1)}mm − ${CONTENT_BOTTOM_SAFETY_MM}mm 余量），请压缩区块高度`,
    })
  }

  return {
    paper: { paperSize, orientation, margins, ...paper },
    elements: scaledElements,
    issues,
  }
}
