// 格式工具栏业务逻辑：从 canvas 的 useFormatToolbar / useFormatPainter 语义移植，零 Vue 依赖。
// computed 改为普通 getter（每次现算，天然反映最新 store 状态）；
// Vue 版在函数内 recordHistory 的时机原样保留，并在同一处补 store.emit() 驱动视图重渲染。
import type {
  RuntimeElement, ElementOptions, TableSelection, TableCell,
  TextAlign, VerticalAlign, TableCellBorder, ElementBorderSide,
} from '@worm-vue3-print/core/designer'
import {
  applyBorderPreset, acceptsElementBorder, ELEMENT_BORDER_SIDES, type BorderPreset,
} from '@worm-vue3-print/core/designer'
import type { DesignerStore } from './store'

/** 多选目标间字段值不一致的哨兵 */
export const MIXED: unique symbol = Symbol('mixed')
export type MixedOr<T> = T | typeof MIXED

/** 支持字体/对齐等文本样式的元素类型（与 AppearanceGroup 的 isTextType 口径一致） */
export const TEXT_TYPES = new Set(['text', 'longText'])

export interface FormatStylePatch {
  fontFamily?: string
  fontSize?: number
  color?: string
  backgroundColor?: string
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
}

export interface ElementBorderSpec {
  width: number
  style: string
  color: string
}

type BorderSide = 'top' | 'right' | 'bottom' | 'left'
const BORDER_SIDES: BorderSide[] = ['top', 'right', 'bottom', 'left']

/** 随文本组一起复制的字段（与格式工具栏可写集一致；textFit/行距等属性面板字段不纳入） */
const TEXT_KEYS = [
  'fontFamily', 'fontSize', 'fontWeight', 'color', 'textAlign', 'verticalAlign', 'textDecoration',
] as const

type TextSnapshot = { [K in typeof TEXT_KEYS[number]]: ElementOptions[K] }
interface BorderSnapshot {
  borderWidth?: number
  borderStyle?: string
  borderColor?: string
  borders?: ElementOptions['borders']
}

interface FormatSnapshot {
  /** 源为文本类时才有：应用前还需按目标类型过滤 */
  text: TextSnapshot | null
  backgroundColor?: string
  /** 源类型可携带元素级边框时才有（rect/oval/线/表格排除，与出纸口径一致） */
  border: BorderSnapshot | null
}

export class FormatToolbar {
  // ─── 边框面板草稿（Vue 版为 FormatToolbar.vue 内的 ref，点预设/单边时整体落盘） ───
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'double' = 'solid'
  borderWidth = 0.75
  borderColor = '#333333'

  // ─── 格式刷状态（交互 UI 由 shell 实现，这里只提供状态与操作） ───
  painterActive = false
  painterLocked = false
  painterSource: string | null = null
  private painterSnapshot: FormatSnapshot | null = null

  constructor(private store: DesignerStore) {}

  // ─── 派生上下文 ───
  private get selectedElements(): RuntimeElement[] {
    return this.store.elements.filter(e => this.store.selectedIds.has(e.id) && !e.options.locked)
  }

  private get tableElement(): RuntimeElement | null {
    const s = this.store.tableSelection
    return s ? this.store.elements.find(e => e.id === s.elementId) ?? null : null
  }

  get context(): 'none' | 'cells' | 'elements' {
    if (this.store.tableSelection && this.tableElement) return 'cells'
    if (this.selectedElements.length > 0 || this.store.selectedIds.size > 0) return 'elements'
    return 'none'
  }

  /** 选区内的可写单元格（跳过被合并占位格） */
  private get targetCells(): TableCell[] {
    const s: TableSelection | null = this.store.tableSelection
    const rows = this.tableElement?.options.tableRows
    if (!s || !rows) return []
    const out: TableCell[] = []
    for (let r = s.r1; r <= s.r2; r++) {
      for (let c = s.c1; c <= s.c2; c++) {
        const cell = rows[r]?.cells[c]
        if (cell && !cell.merged) out.push(cell)
      }
    }
    return out
  }

  /** 字体/字号/颜色/对齐仅对文本类元素生效 */
  private get textTargets(): RuntimeElement[] {
    return this.selectedElements.filter(e => TEXT_TYPES.has(e.printElementType.type))
  }

  get fontEditable(): boolean {
    if (this.context === 'cells') return this.targetCells.length > 0
    if (this.context !== 'elements') return false
    return this.selectedElements.length > 0 && this.textTargets.length === this.selectedElements.length
  }

  /** 文本类写入目标：单元格上下文为选区单元格，元素上下文为文本类选中元素 */
  private get styleTargets(): Array<Record<string, any>> {
    return this.context === 'cells' ? this.targetCells as unknown as Array<Record<string, any>>
      : this.textTargets.map(e => e.options as unknown as Record<string, any>)
  }

  private pick<T>(vals: T[]): T | typeof MIXED | undefined {
    if (!vals.length) return undefined
    const first = vals[0]
    return vals.every(v => v === first) ? first : MIXED
  }

  private hasToken(decoration: string | undefined, token: string): boolean {
    return (decoration ?? '').split(/\s+/).includes(token)
  }

  get values(): {
    fontFamily?: MixedOr<string>
    fontSize?: MixedOr<number>
    color?: MixedOr<string>
    backgroundColor?: MixedOr<string>
    textAlign?: MixedOr<TextAlign>
    verticalAlign?: MixedOr<VerticalAlign>
    bold: MixedOr<boolean>
    underline: MixedOr<boolean>
    strike: MixedOr<boolean>
  } {
    const t = this.styleTargets
    if (!t.length) {
      return {
        fontFamily: undefined, fontSize: undefined, color: undefined, backgroundColor: undefined,
        textAlign: undefined, verticalAlign: undefined,
        bold: false, underline: false, strike: false,
      }
    }
    const boldFlags = t.map(x => x.fontWeight === 'bold' || x.fontWeight === 'bolder')
    const deco = t.map(x => x.textDecoration as string | undefined)
    return {
      fontFamily: this.pick(t.map(x => x.fontFamily)),
      fontSize: this.pick(t.map(x => x.fontSize)),
      color: this.pick(t.map(x => x.color)),
      backgroundColor: this.pick(t.map(x => x.backgroundColor)),
      textAlign: this.pick(t.map(x => this.context === 'cells' ? x.align : x.textAlign)),
      verticalAlign: this.pick(t.map(x => this.context === 'cells' ? x.valign : x.verticalAlign)),
      bold: boldFlags.every(Boolean) ? true : boldFlags.some(Boolean) ? MIXED : false,
      underline: deco.map(d => this.hasToken(d, 'underline')).every(Boolean) ? true : deco.some(d => this.hasToken(d, 'underline')) ? MIXED : false,
      strike: deco.map(d => this.hasToken(d, 'line-through')).every(Boolean) ? true : deco.some(d => this.hasToken(d, 'line-through')) ? MIXED : false,
    }
  }

  // ─── 写入 ───
  /** 落历史并通知视图（时机与 Vue 版 recordHistory 调用点一一对应） */
  private commit() {
    this.store.recordHistory()
    this.store.emit()
  }

  private writeCells(fn: (c: TableCell) => void) {
    const t = this.targetCells
    if (!t.length) return
    t.forEach(fn)
    this.commit()
  }

  applyStyle(patch: FormatStylePatch) {
    if (this.context === 'cells') {
      this.writeCells(c => {
        if ('fontFamily' in patch) c.fontFamily = patch.fontFamily
        if ('fontSize' in patch) c.fontSize = patch.fontSize
        if ('color' in patch) c.color = patch.color
        if ('backgroundColor' in patch) c.backgroundColor = patch.backgroundColor
        if ('textAlign' in patch) c.align = patch.textAlign
        if ('verticalAlign' in patch) c.valign = patch.verticalAlign
      })
      return
    }
    const texts = this.textTargets
    const all = this.selectedElements
    const textKeys = ['fontFamily', 'fontSize', 'color', 'textAlign', 'verticalAlign'] as const
    const hasTextPatch = textKeys.some(k => k in patch)
    const hasBgPatch = 'backgroundColor' in patch
    // 无支持目标就不记历史（如仅选中图片时改字号）
    if (!(texts.length && hasTextPatch) && !(all.length && hasBgPatch)) return
    texts.forEach(e => {
      const o = e.options
      if ('fontFamily' in patch) o.fontFamily = patch.fontFamily
      if ('fontSize' in patch) o.fontSize = patch.fontSize
      if ('color' in patch) o.color = patch.color
      if ('textAlign' in patch) o.textAlign = patch.textAlign
      if ('verticalAlign' in patch) o.verticalAlign = patch.verticalAlign
    })
    if (hasBgPatch) {
      all.forEach(e => { e.options.backgroundColor = patch.backgroundColor })
    }
    this.commit()
  }

  toggleBold() {
    if (this.context === 'cells') {
      const on = !(this.values.bold === true)
      this.writeCells(c => { c.fontWeight = on ? 'bold' : undefined })
      return
    }
    const on = !(this.values.bold === true)
    const targets = this.textTargets
    if (!targets.length) return
    targets.forEach(e => { e.options.fontWeight = on ? 'bold' : 'normal' })
    this.commit()
  }

  private toggleDecoration(token: 'underline' | 'line-through') {
    if (this.context === 'cells') return // 单元格模型无装饰线字段
    const els = this.textTargets
    if (!els.length) return
    const on = !(this.values[token === 'underline' ? 'underline' : 'strike'] === true)
    els.forEach(e => {
      const tokens = (e.options.textDecoration ?? '').split(/\s+/).filter(Boolean)
      const i = tokens.indexOf(token)
      if (on && i < 0) tokens.push(token)
      if (!on && i >= 0) tokens.splice(i, 1)
      e.options.textDecoration = tokens.length ? tokens.join(' ') : undefined
    })
    this.commit()
  }

  toggleUnderline() { this.toggleDecoration('underline') }
  toggleStrike() { this.toggleDecoration('line-through') }

  // ─── 边框 ───
  /** 当前面板草稿对应的边框规格（Vue 版组件内 borderSpec()） */
  borderSpec(): TableCellBorder {
    return { width: this.borderWidth, style: this.borderStyle, color: this.borderColor }
  }

  private applyElementBorder(mode: 'all' | 'none', border: ElementBorderSpec) {
    const targets = this.selectedElements
    if (!targets.length) return
    targets.forEach(e => {
      // 整圈预设统一边框形态：分边残留一并清除（「所有边框」=四边一致，「无边框」=全清）
      e.options.borders = undefined
      if (mode === 'none') {
        e.options.borderWidth = 0
      } else {
        e.options.borderWidth = border.width
        e.options.borderStyle = border.style
        e.options.borderColor = border.color
      }
    })
    this.commit()
  }

  private applyCellBorderPreset(preset: BorderPreset, border: TableCellBorder) {
    const s = this.store.tableSelection
    const rows = this.tableElement?.options.tableRows
    if (!s || !rows) return
    applyBorderPreset(rows, { r1: s.r1, c1: s.c1, r2: s.r2, c2: s.c2 }, preset, border)
    this.commit()
  }

  private applyCellBorderEdges(
    sides: Array<'top' | 'right' | 'bottom' | 'left'>, border: TableCellBorder, on: boolean,
  ) {
    this.writeCells(c => {
      const nb = { ...(c.borders ?? {}) } as Record<string, TableCellBorder | undefined>
      for (const side of sides) {
        if (on) nb[side] = { ...border }
        else delete nb[side]
      }
      c.borders = nb as TableCell['borders']
    })
  }

  /** 单元格选区四边激活态（WPS 式单边按钮的按下态）；非单元格上下文或选区为空为 null */
  get cellEdges(): Record<BorderSide, MixedOr<boolean>> | null {
    if (this.context !== 'cells') return null
    const t = this.targetCells
    if (!t.length) return null
    const out = {} as Record<BorderSide, MixedOr<boolean>>
    for (const side of BORDER_SIDES) {
      const flags = t.map(c => !!c.borders?.[side])
      out[side] = flags.every(Boolean) ? true : flags.some(Boolean) ? MIXED : false
    }
    return out
  }

  /** 单边切换：未全有则补齐该边，全有再点则移除该边（与 Word/WPS 一致） */
  private toggleCellEdge(side: BorderSide, border: TableCellBorder) {
    const on = this.cellEdges?.[side] !== true
    this.applyCellBorderEdges([side], border, on)
  }

  /** 元素选中集的分边激活态（options.borders）；非元素上下文或无可选元素为 null */
  get elementEdges(): Record<BorderSide, MixedOr<boolean>> | null {
    if (this.context !== 'elements') return null
    const t = this.selectedElements
    if (!t.length) return null
    const out = {} as Record<BorderSide, MixedOr<boolean>>
    for (const side of BORDER_SIDES) {
      const flags = t.map(e => !!e.options.borders?.[side])
      out[side] = flags.every(Boolean) ? true : flags.some(Boolean) ? MIXED : false
    }
    return out
  }

  /** 元素分边切换：写入/移除 options.borders[side]，不影响整圈三字段 */
  private toggleElementEdge(side: ElementBorderSide, border: ElementBorderSpec) {
    const targets = this.selectedElements
    if (!targets.length) return
    const on = this.elementEdges?.[side] !== true
    targets.forEach(e => {
      const nb = { ...(e.options.borders ?? {}) }
      if (on) nb[side] = { width: border.width, style: border.style, color: border.color }
      else delete nb[side]
      e.options.borders = nb
    })
    this.commit()
  }

  /** 边框预设（Vue 版组件 onPreset 的路由口径）：单元格上下文走表格预设，否则走元素整圈 */
  applyBorderPreset(preset: BorderPreset) {
    if (this.context === 'cells') this.applyCellBorderPreset(preset, this.borderSpec())
    else this.applyElementBorder(preset === 'none' ? 'none' : 'all', this.borderSpec())
  }

  /** 单边按钮（Vue 版组件 onEdge 的路由口径）：按上下文落到单元格边或元素分边 */
  applyEdge(side: BorderSide) {
    if (this.context === 'cells') this.toggleCellEdge(side, this.borderSpec())
    else this.toggleElementEdge(side, this.borderSpec())
  }

  /** 单边按下态（Vue 版组件 edgeOn 口径） */
  edgeOn(side: BorderSide): boolean {
    const edges = this.context === 'cells' ? this.cellEdges : this.elementEdges
    return edges?.[side] === true
  }

  // ─── 格式刷（状态 + 操作；单击/双击/Esc 的交互绑定由 shell 负责） ───
  /** 仅选中单个未锁定元素时可作为格式源 */
  get painterCapturable(): boolean { return this.selectedElements.length === 1 }

  private clonePainterBorders(borders: ElementOptions['borders']): BorderSnapshot['borders'] {
    if (!borders) return undefined
    const out: NonNullable<BorderSnapshot['borders']> = {}
    for (const side of ELEMENT_BORDER_SIDES) {
      const edge = borders[side]
      if (edge) out[side] = { ...edge }
    }
    return out
  }

  /** 从当前唯一选中元素捕获格式并进入刷取模式；locked=true 为双击连续刷 */
  pickPainterSource(nextLocked = false): boolean {
    const src = this.selectedElements[0]
    if (!src) return false
    const o = src.options
    const type = src.printElementType.type
    this.painterSnapshot = {
      text: TEXT_TYPES.has(type)
        ? Object.fromEntries(TEXT_KEYS.map(k => [k, o[k]])) as TextSnapshot
        : null,
      backgroundColor: o.backgroundColor,
      border: acceptsElementBorder(type)
        ? { borderWidth: o.borderWidth, borderStyle: o.borderStyle, borderColor: o.borderColor, borders: this.clonePainterBorders(o.borders) }
        : null,
    }
    this.painterSource = src.id
    this.painterActive = true
    this.painterLocked = nextLocked
    return true
  }

  cancelPainter() {
    this.painterActive = false
    this.painterLocked = false
    this.painterSource = null
    this.painterSnapshot = null
  }

  /** 按目标类型过滤写入；backgroundColor 全类型通用，与格式工具栏口径一致 */
  applyPainter(el: RuntimeElement): boolean {
    const s = this.painterSnapshot
    if (!s || el.options.locked || el.id === this.painterSource) return false
    const o = el.options
    const type = el.printElementType.type
    if (s.text && TEXT_TYPES.has(type)) Object.assign(o, s.text)
    o.backgroundColor = s.backgroundColor
    if (s.border && acceptsElementBorder(type)) {
      o.borderWidth = s.border.borderWidth
      o.borderStyle = s.border.borderStyle
      o.borderColor = s.border.borderColor
      o.borders = this.clonePainterBorders(s.border.borders)
    }
    return true
  }

  /** Vue 版 watch(selectedIds) 的等价入口：shell 在选中集变化后调用；单击模式刷一次即退出 */
  painterSyncSelection() {
    if (!this.painterActive || !this.painterSnapshot) return
    const targets = this.selectedElements
    if (!targets.length) { this.cancelPainter(); return }
    let applied = false
    targets.forEach(el => { applied = this.applyPainter(el) || applied })
    if (!applied) return
    this.commit()
    if (!this.painterLocked) this.cancelPainter()
  }

  /** Esc 退出连续刷：shell 绑定 keydown 后转发（输入控件聚焦时忽略，与 Vue 版一致） */
  handlePainterKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !this.painterActive) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    this.cancelPainter()
  }
}
