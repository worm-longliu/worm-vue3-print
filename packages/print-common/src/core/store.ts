// 设计器状态内核：从 canvas 的 useDesignerState 语义移植，零 Vue 依赖。
// 对外只暴露 get/set + 订阅，视图层（自定义元素）订阅变更并重渲染。
import type {
  AlignLine, AlignMode, ElementZone, MultiPageTemplateData, PrintBusinessField, PrintElementData,
  RuntimeElement, TableSelection, TemplateData,
} from '@worm-vue3-print/core/designer'
import {
  clampToZone, createFieldElement, createRuntimeElement, finalizeElementZone, generateGroupId,
  generateId, getPaperDimensions, getZoneRects, MIN_SCALE_PERCENT, normalizeTemplateUnits,
  syncTableElementSize, useAlign, useGroup, ZONE_ALLOWED_TYPES, zoneFromPaperPoint,
} from '@worm-vue3-print/core/designer'
import { createDefaultTemplate } from './default-template'

/** 拼版模板只允许单页：增页入口被拦截时的提示文案（与 canvas 同口径） */
export const TILING_SINGLE_PAGE_TIP = '开启拼版后只能有一个设计页面'

/** 纸面 mm 落点（与 canvas 的 toPaperPoint 同口径，原点为纸张左上角） */
export interface PaperPoint { x: number; y: number }

export interface DesignerOptions {  initialTemplate?: TemplateData | MultiPageTemplateData
  initialElements?: RuntimeElement[]
  initialFields?: PrintBusinessField[]
}

interface HistorySnapshot {
  pages: TemplateData[]
  activePageIndex: number
}

/** 把三区模板摊平为统一运行时元素池（补 id、打 zone 标） */
export function toRuntimePool(data: TemplateData): TemplateData {
  const mk = (els: PrintElementData[], zone: ElementZone): RuntimeElement[] =>
    (els ?? []).map((e) => {
      const options = { ...e.options }
      // 表格尺寸恒由列宽/行高派生（mm），加载时重算以自愈历史污染数据
      if ((e.printElementType?.type ?? (e as { type?: string }).type) === 'table') syncTableElementSize(options)
      return { id: e.id || generateId(), zone, options, printElementType: { ...e.printElementType } }
    })
  return {
    ...data,
    margins: { ...data.margins },
    header: { height: data.header?.height ?? 10, elements: [] },
    footer: { height: data.footer?.height ?? 10, elements: [] },
    guides: [...(data.guides ?? [])],
    elements: [
      ...mk(data.elements ?? [], 'content'),
      ...mk(data.header?.elements ?? [], 'header'),
      ...mk(data.footer?.elements ?? [], 'footer'),
    ],
  }
}

/** 单页运行时池序列化回三区模板 JSON（按 zone 拆回，补 id/type） */
export function serializePage(page: TemplateData): TemplateData {
  const all = page.elements as RuntimeElement[]
  const ser = (zone: ElementZone) => all
    .filter((e) => (e.zone || 'content') === zone)
    .map((e) => ({ id: e.id, type: e.printElementType.type, options: { ...e.options }, printElementType: { ...e.printElementType } }))
  return {
    unit: 'mm' as const,
    ...page,
    header: { ...page.header, elements: ser('header') },
    footer: { ...page.footer, elements: ser('footer') },
    elements: ser('content'),
    guides: [...(page.guides ?? [])],
  }
}

function resolveInitialPages(initial?: TemplateData | MultiPageTemplateData): TemplateData[] {
  // 无名页面补固定默认名：页签显示若依赖位置回退，页面重排后索引变化会让名漂移
  const withDefaultName = (p: TemplateData, i: number): TemplateData => {
    const rt = toRuntimePool(normalizeTemplateUnits(p))
    if (!rt.name) rt.name = `页面 ${i + 1}`
    return rt
  }
  if (!initial) return [withDefaultName(createDefaultTemplate(), 0)]
  const list = Array.isArray((initial as MultiPageTemplateData).pages)
    ? (initial as MultiPageTemplateData).pages as TemplateData[]
    : [initial as TemplateData]
  return list.length ? list.map(withDefaultName) : [withDefaultName(createDefaultTemplate(), 0)]
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/**
 * 设计器状态容器。
 * 视图层通过 subscribe 收到「结构性变更」通知；高频拖拽走 livePatch 直改 + 定点重绘，
 * 避免每个 mousemove 都全量重渲染（canvas 侧靠 Vue 细粒度响应式，这里显式区分）。
 */
export class DesignerStore {
  scale = 100
  showRuler = true
  showGrid = true
  snapToGrid = false
  showTableGhostBorder = true
  dirty = false

  pages: TemplateData[]
  activePageIndex = 0
  fields: PrintBusinessField[]
  selectedIds = new Set<string>()
  previewIds = new Set<string>()
  tableSelection: TableSelection | null = null
  /** 正在拖拽的元素 id：对应 canvas BaseElement 的 useDrag isDragging，驱动 `.drag-ghost` + `.drag-preview` */
  draggingIds = new Set<string>()

  /** 拖拽吸附生成的临时引导线，仅存在于一次拖拽期间（与 canvas 的 guideLines 同语义） */
  adsorbGuides: AlignLine[] = []

  /** 拖拽/缩放进行中的实时元素覆盖，不落历史 */
  private live = new Map<string, RuntimeElement>()
  private clipboard: RuntimeElement[] = []
  private moveSessionActive = false
  private moveTimer: ReturnType<typeof setTimeout> | null = null
  private dragBefore: Map<string, string> | null = null
  private undoStack: HistorySnapshot[] = []
  private redoStack: HistorySnapshot[] = []
  private listeners = new Set<() => void>()
  private readonly align = useAlign()
  private readonly group = useGroup()

  constructor(opts: DesignerOptions = {}) {
    this.pages = resolveInitialPages(opts.initialTemplate)
    this.fields = opts.initialFields ?? []
    if (opts.initialElements?.length) {
      const page = this.pages[0]!
      page.elements = [...(page.elements as RuntimeElement[]), ...opts.initialElements]
    }
  }

  // ─── 订阅 ───
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** 结构性变更后调用：通知视图重渲染并置 dirty */
  emit(markDirty = true) {
    if (markDirty) this.dirty = true
    for (const fn of [...this.listeners]) fn()
  }

  // ─── 页面 ───
  get templateData(): TemplateData { return this.pages[this.activePageIndex]! }
  set templateData(v: TemplateData) { this.pages[this.activePageIndex] = v }

  get elements(): RuntimeElement[] {
    return (this.templateData.elements as RuntimeElement[]).map((e) => this.live.get(e.id) ?? e)
  }

  get tilingEnabled(): boolean { return this.pages.some((p) => p.tiling?.enabled === true) }

  switchPage(i: number) {
    if (i < 0 || i >= this.pages.length) return
    this.activePageIndex = i
    this.resetSelection()
    this.emit(false)
  }

  addPage() {
    if (this.tilingEnabled) { window.alert(TILING_SINGLE_PAGE_TIP); return }
    this.recordHistory()
    // 新增页继承当前页纸张（canvas 同口径）：否则横版模板加出竖版页，
    // 保存时会被「各页纸张尺寸必须一致」校验整份拦下
    const base = this.pages[this.activePageIndex] ?? createDefaultTemplate()
    this.pages.push(toRuntimePool({
      ...createDefaultTemplate(),
      paperSize: base.paperSize, orientation: base.orientation,
      customWidth: base.customWidth, customHeight: base.customHeight,
      name: this.nextDefaultPageName(),
    }))
    this.switchPage(this.pages.length - 1)
    this.emit()
  }

  /** 默认页名跳过已占用的编号（对应 canvas nextDefaultPageName） */
  private nextDefaultPageName() {
    const used = new Set(this.pages.map(p => p.name))
    let n = this.pages.length + 1
    while (used.has(`页面 ${n}`)) n++
    return `页面 ${n}`
  }

  duplicatePage(i: number) {
    if (this.tilingEnabled) { window.alert(TILING_SINGLE_PAGE_TIP); return }
    this.recordHistory()
    const copy = clone(this.pages[i]!)
    copy.name = `${copy.name ?? `页面 ${i + 1}`} 副本`
    copy.elements = (copy.elements as RuntimeElement[]).map((e) => ({ ...e, id: generateId() }))
    this.pages.splice(i + 1, 0, copy)
    this.switchPage(i + 1)
    this.emit()
  }

  deletePage(i: number) {
    if (this.pages.length <= 1) return
    this.recordHistory()
    this.pages.splice(i, 1)
    this.activePageIndex = Math.max(0, Math.min(this.activePageIndex, this.pages.length - 1))
    this.resetSelection()
    this.emit()
  }

  renamePage(i: number, name: string) {
    this.recordHistory()
    this.pages[i]!.name = name
    this.emit()
  }

  movePage(from: number, to: number) {
    if (to < 0 || to >= this.pages.length || from === to) return
    this.recordHistory()
    const [moved] = this.pages.splice(from, 1)
    this.pages.splice(to, 0, moved!)
    this.activePageIndex = to
    this.emit()
  }

  // ─── 选中 ───
  /**
   * 选中集变化的副作用钩子（shell 在初始化时挂上）：
   * 对应 canvas `useFormatPainter` 里的 `watch(selectedIds)` —— 格式刷是以「选中集变化」为触发点的，
   * 点击选中、框选、图层面板选中都走这一条路径，不能只在拖拽收尾时同步。
   */
  onSelectionChanged?: () => void
  private setSelection(ids: Set<string>) {
    this.selectedIds = ids
    this.onSelectionChanged?.()
    this.emit(false)
  }
  select(ids: Set<string>) { this.setSelection(new Set(ids)) }
  selectOne(id: string, additive = false) {
    if (additive) {
      const next = new Set(this.selectedIds)
      next.has(id) ? next.delete(id) : next.add(id)
      this.setSelection(next)
    } else this.setSelection(new Set([id]))
  }
  clearSelection() { this.setSelection(new Set()) }
  /**
   * 画布/图层「单击选中」：对应 canvas useDesignerState 的 selectElement。
   * · Ctrl/Cmd 点击 = 增删单个成员（canvas 的 select(id, true)）
   * · 普通点击 = 整组选中（canvas 的 getGroupedIds），组内成员被点中即选中全组
   */
  selectElement(id: string, multiple = false) {
    if (multiple) { this.selectOne(id, true); return }
    this.setSelection(new Set(this.group.getGroupedIds(this.elements, id)))
  }
  selectAll() { this.setSelection(new Set(this.elements.map((e) => e.id))) }
  get selectedElements(): RuntimeElement[] { return this.elements.filter((e) => this.selectedIds.has(e.id)) }
  get selectedElement(): RuntimeElement | null {
    const id = this.selectedIds.values().next().value
    return id ? this.elements.find((e) => e.id === id) ?? null : null
  }
  resetSelection() { this.selectedIds = new Set(); this.tableSelection = null; this.onSelectionChanged?.() }
  setTableSelection(s: TableSelection | null) { this.tableSelection = s; this.emit(false) }
  setPreview(ids: Set<string>) { this.previewIds = ids; this.emit(false) }
  commitPreview() { this.previewIds = new Set(); this.emit(false) }

  // ─── 参考线（常驻，存于当前页 templateData.guides）───
  addGuide(type: 'vertical' | 'horizontal', positionMm: number) {
    const list = this.templateData.guides ?? []
    this.templateData.guides = [...list, { id: generateId(), type, position: Math.round(positionMm * 10) / 10 }]
    this.emit()
  }
  moveGuide(id: string, positionMm: number) {
    const list = this.templateData.guides ?? []
    this.templateData.guides = list.map(g => g.id === id
      ? { ...g, position: Math.round(positionMm * 10) / 10 } : g)
    this.emit(false)
  }
  removeGuide(id: string) {
    this.templateData.guides = (this.templateData.guides ?? []).filter(g => g.id !== id)
    this.emit()
  }

  // ─── 元素增删改 ───
  addElement(type: Parameters<typeof createRuntimeElement>[0], options: Partial<RuntimeElement['options']> = {}, dropPoint?: PaperPoint) {
    const el = createRuntimeElement(type, options)
    // 落点归区（对应 canvas placeAtDropPoint）：类型不允许进页眉/页脚时拒绝添加并提示
    if (dropPoint && !this.placeAtDropPoint(el, dropPoint)) return el
    this.recordHistory()
    ;(this.templateData.elements as RuntimeElement[]).push(el)
    this.select(new Set([el.id]))
    this.emit()
    return el
  }

  addFieldElement(field: PrintBusinessField, options: Partial<RuntimeElement['options']> = {}, dropPoint?: PaperPoint) {
    // core 的 createFieldElement 只接收字段本身，位置/尺寸由调用方补写
    const el = createFieldElement(field)
    Object.assign(el.options, options)
    if (dropPoint && !this.placeAtDropPoint(el, dropPoint)) return el
    this.recordHistory()
    ;(this.templateData.elements as RuntimeElement[]).push(el)
    this.select(new Set([el.id]))
    this.emit()
    return el
  }

  /**
   * 按落点把新元素放进对应区域（canvas 的 placeAtDropPoint）：
   * dropPoint 为纸面 mm；页眉/页脚不允许的类型返回 false（调用方不加入元素）。
   */
  private placeAtDropPoint(el: RuntimeElement, dropPoint: PaperPoint): boolean {
    const t = this.templateData
    const zone = zoneFromPaperPoint(t, dropPoint.x, dropPoint.y)
    if (zone !== 'content' && !ZONE_ALLOWED_TYPES.includes(el.printElementType.type)) {
      alert('该元素类型不能放入页眉/页脚')
      return false
    }
    const rect = getZoneRects(t)[zone]
    el.zone = zone
    el.options.left = dropPoint.x - rect.left
    el.options.top = dropPoint.y - rect.top
    if (zone !== 'content') clampToZone(el, rect)
    return true
  }

  deleteSelected() {
    if (!this.selectedIds.size) return
    this.recordHistory()
    this.templateData.elements = (this.templateData.elements as RuntimeElement[])
      .filter((e) => !this.selectedIds.has(e.id))
    this.selectedIds = new Set()
    this.emit()
  }

  /** 拖拽/缩放过程中的实时值：只进 live 层，不落历史也不触发全量重渲染 */
  livePatch(id: string, patch: Partial<RuntimeElement['options']>) {
    const base = (this.templateData.elements as RuntimeElement[]).find((e) => e.id === id)
    if (!base) return
    const prev = this.live.get(id) ?? base
    this.live.set(id, { ...prev, options: { ...prev.options, ...patch } })
  }

  /** 交互结束：把 live 层落回元素并记一条历史（与 canvas 的「一次拖拽一条记录」同口径） */
  commitLive() {
    if (!this.live.size) return
    this.recordHistory()
    const els = this.templateData.elements as RuntimeElement[]
    for (const [id, el] of this.live) {
      const target = els.find((e) => e.id === id)
      if (target) Object.assign(target.options, el.options)
    }
    this.live.clear()
    this.emit()
  }

  /** 拖拽跟手集合（对应 canvas BaseElement：主元素 + 同组元素，不含其它选中项） */
  dragIds(id: string): string[] {
    const el = (this.templateData.elements as RuntimeElement[]).find(e => e.id === id)
    if (!el || el.options.locked) return []
    return Array.from(this.group.getGroupedIds(this.elements, id))
  }

  /** 丢弃 live 层（Alt+拖拽：canvas 拖拽期间从不写响应式坐标，副本落在落点、原元素回原位） */
  discardLive() { this.live.clear() }

  /**
   * 拖拽/缩放开始快照（对应 canvas 的 dragStart）：dragStop 用它挑出几何变化的元素做归区收尾。
   */
  dragStart() {
    this.dragBefore = new Map(this.elements.map(e => [e.id, this.geoSig(e)]))
  }

  /**
   * 拖拽/缩放结束归区（对应 canvas 的 dragStop）：按元素中心点重判所在区，
   * 跨区换算坐标并改写 zone、页眉页脚内 clamp；类型不允许跨入则退回内容区并提示。
   */
  dragStop() {
    const before = this.dragBefore
    if (!before) return
    this.dragBefore = null
    let rejected = false
    for (const el of this.elements) {
      const prev = before.get(el.id)
      if (!prev || prev === this.geoSig(el)) continue
      if (finalizeElementZone(el, this.templateData).rejected) rejected = true
    }
    if (rejected) alert('该元素类型不能放入页眉/页脚')
    this.emit()
  }

  private geoSig(e: RuntimeElement) {
    return `${e.zone || 'content'}:${e.options.left},${e.options.top},${e.options.width},${e.options.height}`
  }

  updateElement(id: string, patch: Partial<RuntimeElement['options']>, record = true) {
    if (record) this.recordHistory()
    const el = (this.templateData.elements as RuntimeElement[]).find((e) => e.id === id)
    if (!el) return
    Object.assign(el.options, patch)
    if (el.printElementType.type === 'table') syncTableElementSize(el.options)
    this.emit()
  }

  updateTemplateData(patch: Partial<TemplateData>) {
    this.recordHistory()
    Object.assign(this.templateData, patch)
    this.emit()
  }

  moveLayer(mode: 'top' | 'bottom' | 'up' | 'down') {
    if (!this.selectedIds.size) return
    this.recordHistory()
    const els = this.templateData.elements as RuntimeElement[]
    const picked = els.filter((e) => this.selectedIds.has(e.id))
    const rest = els.filter((e) => !this.selectedIds.has(e.id))
    if (mode === 'top') this.templateData.elements = [...rest, ...picked]
    else if (mode === 'bottom') this.templateData.elements = [...picked, ...rest]
    else {
      // 上移/下移：与相邻非选中元素交换位置
      const idx = els.findIndex((e) => this.selectedIds.has(e.id))
      const swap = mode === 'up' ? idx + 1 : idx - 1
      if (swap < 0 || swap >= els.length) return
      const next = [...els]
      ;[next[idx], next[swap]] = [next[swap]!, next[idx]!]
      this.templateData.elements = next
    }
    this.emit()
  }

  // ─── 对齐 / 编组 ───
  alignSelected(mode: AlignMode) {
    if (this.selectedIds.size < 2) return
    this.recordHistory()
    // core 的 align 直接原地改 options，传入的必须是真实元素对象
    this.align.align(this.elements.filter((e) => this.selectedIds.has(e.id)), mode)
    this.emit()
  }

  groupSelected() {
    if (this.selectedIds.size < 2) return
    this.recordHistory()
    this.templateData.elements = this.group.group(this.elements, this.selectedIds)
    this.emit()
  }

  ungroupSelected() {
    if (!this.selectedIds.size) return
    this.recordHistory()
    this.templateData.elements = this.group.ungroup(this.elements, this.selectedIds)
    this.emit()
  }

  // ─── 剪贴板 ───
  copy() {
    // canvas 无「有选中才复制」守卫：空选中会把剪贴板置空，覆盖上一次内容
    this.clipboard = clone(this.selectedElements)
    this.emit(false)
  }

  cutSelected() { this.copy(); this.deleteSelected() }

  paste(offset = 10) {
    if (!this.clipboard.length) return
    this.recordHistory()
    // 组 ID 重映射（与 canvas useClipboard.paste 同口径）：粘贴副本绝不能与原组共用 groupId；
    // 同组 ≥2 个成员一起粘贴才保留成组（换新 ID），只粘单个成员则剥离组身份
    const groupCounts = new Map<string, number>()
    for (const item of this.clipboard) {
      const gid = item.options.groupId
      if (gid) groupCounts.set(gid, (groupCounts.get(gid) ?? 0) + 1)
    }
    const groupIdMap = new Map<string, string | undefined>()
    for (const [gid, count] of groupCounts) {
      groupIdMap.set(gid, count >= 2 ? generateGroupId() : undefined)
    }
    const els = this.templateData.elements as RuntimeElement[]
    for (const src of this.clipboard) {
      const el = clone(src)
      el.id = generateId()
      el.options.left += offset
      el.options.top += offset
      el.options.groupId = el.options.groupId ? groupIdMap.get(el.options.groupId) : undefined
      els.push(el)
    }
    // canvas 的 paste() 不改动选中项（副本落在偏移处但不选中）
    this.emit()
  }

  /** Ctrl+D 原地复制（对应 canvas duplicateSelected）：复用剪贴板，偏移 10+5 */
  duplicateSelected() {
    this.copy()
    if (!this.clipboard.length) return
    this.paste(15)
    const els = this.templateData.elements as RuntimeElement[]
    this.selectOne(els[els.length - this.clipboard.length]!.id)
  }

  get hasClipboard() { return this.clipboard.length > 0 }

  /**
   * 方向键微移（对应 canvas moveSelected）：跳过锁定元素、不做 0 钳制（可移出纸面），
   * 300ms 内的连按算一次历史会话。
   */
  moveSelected(dx: number, dy: number) {
    const movable = this.selectedElements.filter(e => !e.options.locked)
    if (!movable.length) return
    if (!this.moveSessionActive) {
      this.moveSessionActive = true
      this.recordHistory()
    }
    for (const el of movable) {
      el.options.left += dx
      el.options.top += dy
    }
    if (this.moveTimer) clearTimeout(this.moveTimer)
    this.moveTimer = setTimeout(() => { this.moveSessionActive = false; this.moveTimer = null }, 300)
    this.emit()
  }

  /** Alt+拖拽落点插入副本（对应 canvas PrintDesigner.onCloneElement）：push + 选中副本 + 一条历史 */
  cloneElement(el: RuntimeElement) {
    this.recordHistory()
    ;(this.templateData.elements as RuntimeElement[]).push(el)
    this.selectedIds = new Set([el.id])
    this.emit()
  }

  // ─── 历史 ───
  recordHistory() {
    this.undoStack.push({ pages: clone(this.pages), activePageIndex: this.activePageIndex })
    if (this.undoStack.length > 100) this.undoStack.shift()
    this.redoStack = []
  }

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }

  undo() {
    const snap = this.undoStack.pop()
    if (!snap) return
    this.redoStack.push({ pages: clone(this.pages), activePageIndex: this.activePageIndex })
    this.pages = snap.pages
    this.activePageIndex = Math.min(snap.activePageIndex, snap.pages.length - 1)
    this.resetSelection()
    this.emit()
  }

  redo() {
    const snap = this.redoStack.pop()
    if (!snap) return
    this.undoStack.push({ pages: clone(this.pages), activePageIndex: this.activePageIndex })
    this.pages = snap.pages
    this.activePageIndex = Math.min(snap.activePageIndex, snap.pages.length - 1)
    this.resetSelection()
    this.emit()
  }

  // ─── 视图 ───
  /** Ctrl+1 重置缩放至 100%（对应 canvas resetZoom） */
  resetZoom() { this.setScale(100) }

  /**
   * 设置缩放百分比。canvas 只在「交互缩放」入口钳到 25%，适应窗口可到 5%，放大不设上限。
   */
  setScale(v: number, minPercent = MIN_SCALE_PERCENT) {
    this.scale = Math.max(minPercent, Math.round(v))
    this.emit(false)
  }

  // ─── 序列化 ───
  getTemplateJson(): string {
    const pages = this.pages.map(serializePage)
    // 多页 wrapper 与 canvas 同形：`{ version: 1, pages }`，单页直接导出页对象
    const single = pages.length === 1 ? pages[0] : { version: 1, pages }
    return JSON.stringify(single)
  }

  loadTemplate(input: TemplateData | MultiPageTemplateData) {
    this.pages = resolveInitialPages(input)
    this.activePageIndex = 0
    this.resetSelection()
    // canvas 的 loadTemplate 只在装载后压一个检查点（装载前的模板不可撤销），
    // 于是「装载后第一次 Ctrl+Z」不产生可见变化 —— 本包同序对齐
    this.recordHistory()
    this.emit()
  }

  /** 当前纸张尺寸（mm），视图层算坐标要用 */
  get paperSize() { return getPaperDimensions(this.templateData) }
}
