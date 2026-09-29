// 表格元素：逐段移植 print-canvas 的 elements/TableElement.vue + TableContextMenu.vue
// （渲染 + 交互），DOM 类名与 canvas 逐字一致 —— 样式由 scripts/gen-styles.mjs 从 canvas
// 构建 CSS 剥离 [data-v-*] 派生，类名对不上样式就会掉。
//
// ─── fire(action, arg) 动作清单 ───
// 矩阵变更、历史、重绘都在本文件内完成（store 为唯一数据源）；除首条外均为通知型。
//   'table-cell-dblclick'     { elementId, r, c, cellId }   必须接线：外层打开该单元格的表达式编辑器（对照 canvas onDblClickCell）
//   'table-selection-change'  { elementId, selection: TableSelection | null }  通知：单元格选区变化（已写入 store.tableSelection）
//   'table-cell-contextmenu'  { elementId, r, c, clientX, clientY }  通知：表格右键菜单已打开（传入的 menu 对象已被置 visible）
//   'table-menu-close'        { elementId }                 通知：表格右键菜单关闭
//   'table-insert-row-above'  { elementId }                 通知：在选区首行上方插入行
//   'table-insert-row-below'  { elementId }                 通知：在选区末行下方插入行
//   'table-delete-row'        { elementId }                 通知：删除选区首行
//   'table-insert-col-left'   { elementId }                 通知：在选区首列左侧插入列
//   'table-insert-col-right'  { elementId }                 通知：在选区末列右侧插入列
//   'table-delete-col'        { elementId }                 通知：删除选区首列
//   'table-merge'             { elementId }                 通知：合并选区单元格
//   'table-split'             { elementId }                 通知：拆分选区内合并单元格
//   'table-set-row-type'      { elementId, type: TableRowType }  通知：设置选区首行行类型
//   'table-col-resize-end'    { elementId }                 通知：一次列宽拖拽结束并已记历史
//
// 全局监听口径：本文件不常驻 window 监听。仅两处按需绑定、用完即解 ——
// 单元格拖拽选区用 document mouseup（{ once: true } 自清理），
// 列宽拖拽在 mousedown 时成对绑定 document mousemove/mouseup、mouseup 解除（与 canvas 同实现），
// 另导出 abortTableColResize() 供宿主卸载时强制解除。
//
// ─── 外壳接线要求（menu 状态） ───
// menu（{ visible, x, y }）由每个设计器实例自持一份；每帧绘制都要调用一次
// renderTableContextMenu(store, fire, menu)（不可见时它返回 '' 但仍会登记 menu 引用，
// 之后单元格右键直接改写这份状态，外层无需再接开启/关闭动作），
// 返回值非空时渲染进 shadow 内即可（.table-ctx-menu 为 position: fixed，按视口定位）。
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type {
  ElementOptions, TableCell, TableRow, TableRowType, TableSelection, RuntimeElement, TextFit,
} from '@worm-vue3-print/core/designer'
import {
  BARCODE_BAR_HEIGHT_MODULES, BARCODE_MARGIN_BOTTOM_MODULES, BARCODE_QUIET_ZONE_MODULES,
  BARCODE_TEXT_FONT_SIZE_MODULES, DEFAULT_DEMO_DATA, barcodeAvailableBoxMm, barcodeUnitsPerModule,
  canMergeReason, cellFitCapMm, cellFitWidthMm, clampResizedColumnWidth, deleteCol, deleteRow,
  evaluateTemplate, insertCol, insertRow, mergeCells, normalizeSelection,
  resolveBarcodeDesignValue, resolveBarcodeSize, resolveCellBorderCss, resolveCellTextFit,
  resolveShrinkMinFontSize, setRowType, splitCells, syncTableElementSize,
} from '@worm-vue3-print/core/designer'
import type { DesignerStore } from '../core/store'
import { SVG_NS_CONST, h } from '../core/h'
import type { El } from '../core/h'

export interface TableFire { (action: string, arg?: unknown): void }

/** 表格右键菜单可见状态：由外层持有并逐帧传给 renderTableContextMenu */
export interface TableMenuState { visible: boolean; x: number; y: number }

const ROW_TYPE_BADGE: Record<TableRowType, string> = {
  header: '题', data: '数', subtotal: '小', summary: '汇',
}

const ROW_TYPES: { value: TableRowType; label: string }[] = [
  { value: 'header', label: '标题行' },
  { value: 'data', label: '数据行' },
  { value: 'subtotal', label: '小计行' },
  { value: 'summary', label: '汇总行' },
]

/** 96dpi 下 1mm ≈ 3.78px（与 canvas TableElement / 渲染端测量遍同一常量） */
const PX_PER_MM = 3.7795275591
/** 实测高度与模型高度差小于该值（mm）时不回写，避免无意义抖动 */
const HEIGHT_EPSILON_MM = 0.1

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 每个设计器实例的表格局部状态（不进 store，避免污染模板数据） */
interface TableLocalState {
  /** 外层传入的菜单状态引用（renderTableContextMenu 每帧注册） */
  menu: TableMenuState | null
  /** 当前菜单归属的表格元素 id */
  menuElId: string | null
  /** 选区拖拽锚点（canvas 的 dragAnchor） */
  anchor: { r: number; c: number } | null
  /** 各行实测布局（mm），缺失时徽标回退行高累加 */
  layouts: Map<string, { top: number; height: number }[]>
}

const stateByStore = new WeakMap<DesignerStore, TableLocalState>()

function tableState(store: DesignerStore): TableLocalState {
  let st = stateByStore.get(store)
  if (!st) {
    st = { menu: null, menuElId: null, anchor: null, layouts: new Map() }
    stateByStore.set(store, st)
  }
  return st
}

/** 渲染上下文：一次绘制内共享的派生值（canvas 的 computed → 这里的普通字段/函数） */
interface TableCtx {
  store: DesignerStore
  fire: TableFire
  /** 渲染来源（可能带拖拽 live 覆盖） */
  el: RuntimeElement
  /** 数据写入目标（真实元素对象） */
  real: RuntimeElement
  options: ElementOptions
  rows: TableRow[]
  colWidths: number[]
  isSelected: boolean
  selection: TableSelection | null
  /** 页面打印范围宽度（mm）= 纸宽 - 左右边距，表格总列宽不得超过 */
  maxTableWidth: number
}

function findRealElement(store: DesignerStore, id: string): RuntimeElement | null {
  return (store.templateData.elements as RuntimeElement[]).find(e => e.id === id) ?? null
}

/**
 * 当前元素的有效选区。
 * canvas 由 PrintDesigner 的 watch(selectedElement) 清掉非表格元素的选区，
 * 这里 store 侧无该 watch，故按同一口径在渲染时门控并静默清除（不走 emit，避免绘制中递归）。
 */
function effectiveSelection(store: DesignerStore, el: RuntimeElement): TableSelection | null {
  const s = store.tableSelection
  if (!s || s.elementId !== el.id) return null
  if (store.selectedElement?.id !== el.id) { store.tableSelection = null; return null }
  return s
}

function makeCtx(store: DesignerStore, fire: TableFire, el: RuntimeElement): TableCtx | null {
  const real = findRealElement(store, el.id)
  if (!real) return null
  const options = el.options
  return {
    store, fire, el, real, options,
    rows: options.tableRows ?? [],
    colWidths: options.tableColWidths ?? [],
    isSelected: store.selectedIds.has(el.id),
    selection: effectiveSelection(store, el),
    maxTableWidth: maxTableWidthOf(store),
  }
}

/** 页面打印范围宽度（mm）：表格总列宽上限（canvas 由 PrintDesigner provide maxTableWidth） */
function maxTableWidthOf(store: DesignerStore): number {
  return store.paperSize.width - store.templateData.margins.left - store.templateData.margins.right
}

function defaultFontSize(ctx: TableCtx): number {
  return ctx.options.tableDefaultFontSize ?? 10
}

function defaultColor(ctx: TableCtx): string {
  return ctx.options.tableDefaultColor ?? '#333333'
}

function rowTopMm(ctx: TableCtx, ri: number): number {
  let t = 0
  for (let i = 0; i < ri; i++) t += ctx.rows[i]!.height
  return t
}

/** 行徽标顶距：优先实测位置，未测量时回退行高累加 */
function badgeTopMm(ctx: TableCtx, ri: number): number {
  return tableState(ctx.store).layouts.get(ctx.el.id)?.[ri]?.top ?? rowTopMm(ctx, ri)
}

/** 行徽标高：优先实测高度，未测量时回退配置行高 */
function badgeHeightMm(ctx: TableCtx, ri: number): number {
  return tableState(ctx.store).layouts.get(ctx.el.id)?.[ri]?.height ?? ctx.rows[ri]?.height ?? 0
}

/** demo 数据中 data 行迭代用的列表（与服务端 resolveListSource 优先级一致） */
function demoList(ctx: TableCtx): Record<string, any>[] | undefined {
  const ds = ctx.options.dataSource
  if (ds && Array.isArray(DEFAULT_DEMO_DATA[ds])) return DEFAULT_DEMO_DATA[ds] as Record<string, any>[]
  for (const v of Object.values(DEFAULT_DEMO_DATA)) {
    if (Array.isArray(v)) return v as Record<string, any>[]
  }
  return undefined
}

function isCodeCell(cell: TableCell): boolean {
  return cell.cellType === 'barcode' || cell.cellType === 'qrcode'
}

function cellDisplay(ctx: TableCtx, cell: TableCell): string {
  if (isCodeCell(cell)) return resolveBarcodeDesignValue(cell.formatter, demoList(ctx))
  return cell.formatter || ''
}

function cellStyle(ctx: TableCtx, cell: TableCell): Record<string, string> {
  // 设计态下无边框边补虚拟虚线（仅设计稿展示，预览/打印输出不受影响）
  const borderOpts = { designMode: true, showGhostBorder: ctx.store.showTableGhostBorder }
  return {
    fontFamily: cell.fontFamily || 'inherit',
    textAlign: cell.align ?? 'left',
    verticalAlign: cell.valign ?? 'middle',
    fontSize: (cell.fontSize ?? defaultFontSize(ctx)) + 'pt',
    fontWeight: cell.fontWeight ?? 'normal',
    color: cell.color ?? defaultColor(ctx),
    backgroundColor: cell.backgroundColor ?? 'transparent',
    borderTop: resolveCellBorderCss(cell.borders?.top, borderOpts),
    borderRight: resolveCellBorderCss(cell.borders?.right, borderOpts),
    borderBottom: resolveCellBorderCss(cell.borders?.bottom, borderOpts),
    borderLeft: resolveCellBorderCss(cell.borders?.left, borderOpts),
    padding: (cell.padding ?? ctx.options.tableDefaultPadding ?? 1) + 'mm',
    whiteSpace: (cell.wordWrap ?? true) ? 'normal' : 'nowrap',
    overflow: (cell.wordWrap ?? true) ? 'visible' : 'hidden',
  }
}

function cellClass(ctx: TableCtx, ri: number, ci: number): string {
  const s = ctx.selection
  const inSel = !!s && ri >= s.r1 && ri <= s.r2 && ci >= s.c1 && ci <= s.c2
  return [inSel ? 'cell-selected' : '', ctx.rows[ri]?.type === 'data' ? 'row-data-bg' : '']
    .filter(Boolean).join(' ')
}

/** 单元格溢出形式；与打印端 resolveCellTextFit 同一判定 */
function cellTextFit(cell: TableCell): TextFit {
  return resolveCellTextFit(cell)
}

/** 截断与自动缩小都需要定高容器；自适应行高由单元格自身撑高 */
function needsFitBox(cell: TableCell): boolean {
  return cellTextFit(cell) !== 'autoHeight'
}

/** 单元格基准字号：自动缩小的起点（与打印端 data-fit-base 同口径） */
function cellBaseFontSize(ctx: TableCtx, cell: TableCell): number {
  return cell.fontSize ?? defaultFontSize(ctx)
}

/** 可用内容高度（mm）：所跨行高之和扣除内边距与边框，与打印端同一函数 */
function cellCapMm(ctx: TableCtx, ri: number, cell: TableCell): number {
  return cellFitCapMm(ctx.rows, ri, cell, ctx.options.tableDefaultPadding ?? 1)
}

/** 可用内容宽度（mm）：所跨列宽之和扣除内边距与边框；列宽缺失时为 0 */
function cellBoxWidthMm(ctx: TableCtx, ci: number, cell: TableCell): number {
  return cellFitWidthMm(ctx.colWidths, ci, cell, ctx.options.tableDefaultPadding ?? 1)
}

function cellFitStyle(ctx: TableCtx, cell: TableCell, ri: number): Record<string, string> {
  return {
    maxHeight: cellCapMm(ctx, ri, cell) + 'mm',
    overflow: 'hidden',
    ...(cell.wordWrap === false ? { whiteSpace: 'nowrap', textOverflow: 'ellipsis' } : {}),
  }
}

function cellFitDataset(ctx: TableCtx, cell: TableCell, ri: number): Record<string, string> {
  const ds: Record<string, string> = {
    fitBase: String(cellBaseFontSize(ctx, cell)),
    fitMin: String(resolveShrinkMinFontSize(cell.shrinkMinFontSize)),
    fitMm: String(cellCapMm(ctx, ri, cell)),
  }
  if (cellTextFit(cell) === 'shrink') ds.fit = 'shrink'
  return ds
}

// ─── 单元格内嵌条码 / 二维码 / 图片 ───
// canvas 用子组件 + onMounted 绘制；这里没有挂载钩子，改为同步构造真实节点再作为 children 嵌入
// （render() 允许 Node 作为子节点），参数口径与 CellBarcode.vue / CellImage.vue 完全一致。

/** jsbarcode 把 viewBox 写成 "0 0 W H"；解析失败返回 null（不启用点对齐） */
function readViewBox(svg: SVGSVGElement): { width: number; height: number } | null {
  const parts = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return null
  return { width: parts[2]!, height: parts[3]! }
}

const FIT_TO_PAR: Record<string, string> = {
  contain: 'xMidYMid meet',
  cover: 'xMidYMid slice',
  fill: 'none',
  none: 'xMidYMid meet',
  'scale-down': 'xMidYMid meet',
}

function cellCodeNode(ctx: TableCtx, ri: number, ci: number, cell: TableCell): HTMLElement {
  const holder = document.createElement('div')
  holder.className = 'cell-barcode'
  const svg = document.createElementNS(SVG_NS_CONST, 'svg') as SVGSVGElement
  holder.appendChild(svg)
  const value = cellDisplay(ctx, cell)

  if (cell.cellType === 'barcode') {
    svg.setAttribute('preserveAspectRatio', FIT_TO_PAR[cell.fit || 'contain'] ?? 'xMidYMid meet')
    const unitPerModule = barcodeUnitsPerModule(cell.barWidth)
    let ok = true
    try {
      JsBarcode(svg, value, {
        format: cell.barcodeType || 'CODE128',
        width: unitPerModule,
        height: BARCODE_BAR_HEIGHT_MODULES * unitPerModule,
        displayValue: cell.showBarcodeText !== false,
        fontSize: (cell.barFontSize ?? BARCODE_TEXT_FONT_SIZE_MODULES) * unitPerModule,
        // 静区只留左右（与出图端同参）：上下留白会白白吃掉单元格高度
        margin: 0,
        marginLeft: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
        marginRight: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
        marginTop: 0,
        marginBottom: BARCODE_MARGIN_BOTTOM_MODULES * unitPerModule,
      })
    } catch {
      ok = false
    }
    if (!ok) {
      // 码值不符合码制：回退文本占位（与 CellBarcode.vue 的 v-show/v-if 结果一致）
      svg.style.display = 'none'
      const fallback = document.createElement('span')
      fallback.className = 'cell-barcode-fallback'
      fallback.textContent = value || '条码'
      holder.appendChild(fallback)
      return holder
    }
    const viewBox = readViewBox(svg)
    const settled = viewBox
      ? resolveBarcodeSize({
        unitWidth: viewBox.width / unitPerModule,
        unitHeight: viewBox.height / unitPerModule,
        // 最大宽高并入可用框（与出图端同一助手），作为结算上限而非事后 CSS 缩放
        boxWidthMm: barcodeAvailableBoxMm(cellBoxWidthMm(ctx, ci, cell), cell.maxWidth),
        boxHeightMm: barcodeAvailableBoxMm(cellCapMm(ctx, ri, cell), cell.maxHeight),
        dpi: cell.printerDpi,
        barWidth: cell.barWidth,
      })
      : null
    // 结算尺寸就是最终 mm，不再叠加缩放限制，避免二次缩放
    if (settled) {
      svg.style.width = `${settled.widthMm}mm`
      svg.style.height = `${settled.heightMm}mm`
    } else {
      svg.style.maxWidth = cell.maxWidth ? `${cell.maxWidth}mm` : '100%'
      svg.style.maxHeight = cell.maxHeight ? `${cell.maxHeight}mm` : '100%'
    }
    // 抗锯齿会在条边缘生成灰像素，热敏头只有黑白两态 → 与出图端一致地关掉
    svg.setAttribute('shape-rendering', 'crispEdges')
    return holder
  }

  // 二维码：svg 常挂但隐藏（canvas 的 v-show 结果），img 在 dataUrl 解析后补上
  svg.style.display = 'none'
  if (!value) return holder
  void QRCode.toDataURL(value, {
    width: 96,
    margin: 1,
    errorCorrectionLevel: (cell.qrCodeLevel || 'M') as 'L' | 'M' | 'Q' | 'H',
  }).then(url => {
    if (!holder.isConnected) return
    const img = document.createElement('img')
    img.setAttribute('src', url)
    img.setAttribute('alt', 'qrcode')
    img.style.objectFit = cell.fit || 'contain'
    img.style.maxWidth = cell.maxWidth ? `${cell.maxWidth}mm` : '100%'
    img.style.maxHeight = cell.maxHeight ? `${cell.maxHeight}mm` : '100%'
    holder.appendChild(img)
  }).catch(() => { /* 码值非法：留空，与设计态不弹错 */ })
  return holder
}

function cellPlaceholder(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'image-placeholder'
  box.textContent = '图片'
  return box
}

/** 设计态：{字段} 表达式用 demo 数据求值（与 CellImage.vue 的 designMode 分支同口径） */
function cellImageSrc(cell: TableCell): string {
  const raw = cell.formatter || ''
  if (!raw) return ''
  return raw.includes('{') ? evaluateTemplate(raw, DEFAULT_DEMO_DATA) : raw
}

function cellImageNode(cell: TableCell): HTMLElement {
  const holder = document.createElement('div')
  holder.className = 'cell-image'
  const src = cellImageSrc(cell)
  if (!src) {
    holder.appendChild(cellPlaceholder())
    return holder
  }
  const img = document.createElement('img')
  img.setAttribute('src', src)
  img.style.objectFit = cell.fit || 'contain'
  img.style.maxWidth = cell.maxWidth ? `${cell.maxWidth}mm` : '100%'
  img.style.maxHeight = cell.maxHeight ? `${cell.maxHeight}mm` : '100%'
  img.addEventListener('error', () => {
    img.remove()
    holder.appendChild(cellPlaceholder())
  }, { once: true })
  holder.appendChild(img)
  return holder
}

/** td 内容分支（顺序与 TableElement.vue 模板一致：码 → 图 → 定高容器 → 纯文本） */
function cellContent(ctx: TableCtx, row: TableRow, ri: number, ci: number, cell: TableCell): unknown {
  if (isCodeCell(cell)) return cellCodeNode(ctx, ri, ci, cell)
  if (cell.cellType === 'image') return cellImageNode(cell)
  const text = cellDisplay(ctx, cell)
  const inner = () => row.type === 'data'
    ? h('span', { class: 'data-placeholder', text })
    : text
  if (needsFitBox(cell)) {
    return h('div', {
      class: 'cell-fit',
      style: cellFitStyle(ctx, cell, ri),
      dataset: cellFitDataset(ctx, cell, ri),
    }, [inner()])
  }
  return inner()
}

// ─── 选区交互 ───

function applySelection(ctx: TableCtx, a: { r: number; c: number }, b: { r: number; c: number }) {
  const selection: TableSelection = { elementId: ctx.el.id, ...normalizeSelection(ctx.rows, a, b) }
  ctx.store.setTableSelection(selection)
  ctx.fire('table-selection-change', { elementId: ctx.el.id, selection })
}

function onCellMouseDown(ctx: TableCtx, r: number, c: number, ev: MouseEvent) {
  if (ev.button !== 0) return // canvas 用 @mousedown.left，右键交给 contextmenu
  if (!ctx.isSelected) return
  ev.stopPropagation() // 阻止画布拖拽元素
  const st = tableState(ctx.store)
  if (ev.shiftKey && ctx.selection) {
    applySelection(ctx, { r: ctx.selection.r1, c: ctx.selection.c1 }, { r, c })
  } else {
    st.anchor = { r, c }
    applySelection(ctx, { r, c }, { r, c })
  }
  // 一次性监听、触发即解绑（canvas 同实现），不会重复绑定
  document.addEventListener('mouseup', () => { tableState(ctx.store).anchor = null }, { once: true })
}

function onCellMouseEnter(ctx: TableCtx, r: number, c: number) {
  const anchor = tableState(ctx.store).anchor
  if (anchor) applySelection(ctx, anchor, { r, c })
}

function onCellDblClick(ctx: TableCtx, r: number, c: number, cellId: string, ev: MouseEvent) {
  ev.stopPropagation() // 单元格编辑优先于元素双击
  if (!ctx.isSelected) ctx.store.selectOne(ctx.el.id)
  ctx.fire('table-cell-dblclick', { elementId: ctx.el.id, r, c, cellId })
}

// ─── 右键菜单 ───

function closeMenu(store: DesignerStore, fire: TableFire) {
  const st = tableState(store)
  if (!st.menu?.visible) return
  st.menu.visible = false
  fire('table-menu-close', { elementId: st.menuElId })
  store.emit(false)
}

function openCellMenu(ctx: TableCtx, r: number, c: number, ev: MouseEvent) {
  ev.preventDefault()
  ev.stopPropagation()
  if (!ctx.isSelected) return
  const s = ctx.selection
  const inSel = !!s && r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2
  if (!inSel) applySelection(ctx, { r, c }, { r, c })
  const st = tableState(ctx.store)
  st.menuElId = ctx.el.id
  if (st.menu) {
    st.menu.x = ev.clientX
    st.menu.y = ev.clientY
    st.menu.visible = true
  }
  ctx.fire('table-cell-contextmenu', { elementId: ctx.el.id, r, c, clientX: ev.clientX, clientY: ev.clientY })
  ctx.store.emit(false)
  // 外点关闭：菜单自身 mousedown 已 stopPropagation，故这里只会被「外部点击」触发
  document.addEventListener('mousedown', () => closeMenu(ctx.store, ctx.fire), { once: true })
}

/** 插入列前检查：新列复制相邻列宽，总列宽不得超过页面打印范围宽度 */
function colWidthLimitError(colWidths: number[], index: number, maxW: number): string | null {
  const totalW = colWidths.reduce((s, w) => s + w, 0) + (colWidths[index] ?? 0)
  if (totalW > maxW) {
    return `插入后表格总宽 ${Math.round(totalW * 10) / 10}mm 超过打印范围宽度 ${maxW}mm，请先缩小列宽`
  }
  return null
}

type MatrixAction =
  | 'insert-row-above' | 'insert-row-below' | 'delete-row'
  | 'insert-col-left' | 'insert-col-right' | 'delete-col'
  | 'merge' | 'split' | 'set-row-type'

/**
 * 结构操作：先在深拷贝上试算拿拒绝原因，通过后才入历史并执行 ——
 * 失败的操作不会在历史里留下空快照（core 的矩阵函数只在合法时才写入）。
 */
function executeMatrix(
  ctx: TableCtx, run: (rows: TableRow[], cols: number[]) => string | null,
): boolean {
  const rows = ctx.real.options.tableRows ?? []
  const cols = ctx.real.options.tableColWidths ?? []
  const err = run(clone(rows), clone(cols))
  if (err) {
    window.alert(err)
    return false
  }
  ctx.store.recordHistory()
  run(rows, cols)
  ctx.store.setTableSelection(null) // 结构变化后选区坐标失效，清空
  syncTableElementSize(ctx.real.options)
  ctx.store.emit()
  return true
}

function onMenuAction(ctx: TableCtx, name: MatrixAction, type?: TableRowType) {
  closeMenu(ctx.store, ctx.fire)
  const s = ctx.selection
  if (!s) return
  let run: ((rows: TableRow[], cols: number[]) => string | null) | null = null
  switch (name) {
    case 'insert-row-above': run = rs => { insertRow(rs, s.r1, 'above'); return null }; break
    case 'insert-row-below': run = rs => { insertRow(rs, s.r2, 'below'); return null }; break
    case 'delete-row': run = rs => deleteRow(rs, s.r1); break
    case 'insert-col-left':
      run = (rs, cw) => {
        const err = colWidthLimitError(cw, s.c1, ctx.maxTableWidth)
        if (err) return err
        insertCol(rs, cw, s.c1, 'left')
        return null
      }
      break
    case 'insert-col-right':
      run = (rs, cw) => {
        const err = colWidthLimitError(cw, s.c2, ctx.maxTableWidth)
        if (err) return err
        insertCol(rs, cw, s.c2, 'right')
        return null
      }
      break
    case 'delete-col': run = (rs, cw) => deleteCol(rs, cw, s.c1); break
    case 'merge': run = rs => { mergeCells(rs, s); return null }; break
    case 'split': run = rs => { splitCells(rs, s); return null }; break
    case 'set-row-type':
      run = rs => (type ? setRowType(rs, s.r1, type) : '未指定行类型')
      break
  }
  if (run && executeMatrix(ctx, run)) {
    ctx.fire(`table-${name}`, { elementId: ctx.el.id, ...(type ? { type } : {}) })
  }
}

function canSplitSelection(ctx: TableCtx): boolean {
  const s = ctx.selection
  if (!s) return false
  for (let r = s.r1; r <= s.r2; r++) {
    for (let c = s.c1; c <= s.c2; c++) {
      const cell = ctx.rows[r]?.cells[c]
      if (cell && !cell.merged && ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1)) return true
    }
  }
  return false
}

/** 行类型禁用原因：在深拷贝上试算（canvas 同口径，避免污染真实数据） */
function rowTypeReason(ctx: TableCtx, t: TableRowType): string | null {
  const s = ctx.selection
  if (!s) return '未选择单元格'
  if (s.r1 !== s.r2) return '行类型仅支持单行设置'
  return setRowType(clone(ctx.rows), s.r1, t)
}

function menuItem(label: string, onClick: () => void, opts: {
  disabled?: boolean; title?: string; active?: boolean
} = {}) {
  return h('div', {
    class: `menu-item${opts.disabled ? ' disabled' : ''}${opts.active ? ' active' : ''}`,
    title: opts.title || '',
    text: label,
    onClick: () => { if (!opts.disabled) onClick() },
  })
}

const MENU_DIVIDER = () => h('div', { class: 'menu-divider' })

export function renderTableContextMenu(
  store: DesignerStore, fire: TableFire, menu: TableMenuState,
): El | '' {
  // 每帧登记菜单状态引用：单元格右键据此开/关同一份状态，外层无需再回传
  const st = tableState(store)
  st.menu = menu
  if (!menu.visible || !st.menuElId) return ''
  const el = findRealElement(store, st.menuElId)
  if (!el || el.printElementType.type !== 'table') return ''
  const ctx = makeCtx(store, fire, el)
  if (!ctx) return ''
  const mergeReason = ctx.selection ? canMergeReason(ctx.rows, ctx.selection) : '未选择单元格'
  const currentRowType = ctx.selection ? ctx.rows[ctx.selection.r1]?.type ?? null : null
  return h('div', {
    class: 'table-ctx-menu',
    style: { left: menu.x + 'px', top: menu.y + 'px' },
    onMousedown: (ev: Event) => ev.stopPropagation(),
  }, [
    menuItem('在上方插入行', () => onMenuAction(ctx, 'insert-row-above')),
    menuItem('在下方插入行', () => onMenuAction(ctx, 'insert-row-below')),
    menuItem('删除行', () => onMenuAction(ctx, 'delete-row'), { disabled: ctx.rows.length <= 1 }),
    MENU_DIVIDER(),
    menuItem('在左侧插入列', () => onMenuAction(ctx, 'insert-col-left')),
    menuItem('在右侧插入列', () => onMenuAction(ctx, 'insert-col-right')),
    menuItem('删除列', () => onMenuAction(ctx, 'delete-col'), { disabled: ctx.colWidths.length <= 1 }),
    MENU_DIVIDER(),
    menuItem('合并单元格', () => onMenuAction(ctx, 'merge'), { disabled: !!mergeReason, title: mergeReason || '' }),
    menuItem('拆分单元格', () => onMenuAction(ctx, 'split'), { disabled: !canSplitSelection(ctx) }),
    MENU_DIVIDER(),
    h('div', { class: 'menu-group-title', text: '行类型' }),
    ...ROW_TYPES.map(t => menuItem(t.label, () => onMenuAction(ctx, 'set-row-type', t.value), {
      disabled: !!rowTypeReason(ctx, t.value),
      title: rowTypeReason(ctx, t.value) || '',
      active: currentRowType === t.value,
    })),
  ])
}

// ─── 列宽拖拽 ───
// 边界 i（1..n）：i<n 为内部列边界，拖拽调整其左侧第 i-1 列宽使边界跟随光标；
// i=n 为末列右边界，拖拽调整末列宽。拖拽中只做定点 DOM 重绘，mouseup 时同步尺寸并记一次历史。

interface ColResizeState {
  store: DesignerStore
  fire: TableFire
  elId: string
  boundary: number
  startX: number
  startWidth: number
  scale: number
  root: HTMLElement
  wrapper: HTMLElement | null
  handle: HTMLElement
}

let colResize: ColResizeState | null = null

/** 强制解除列宽拖拽监听（宿主 disconnectedCallback 可用） */
export function abortTableColResize() {
  if (!colResize) return
  document.removeEventListener('mousemove', onColResizeMove)
  document.removeEventListener('mouseup', onColResizeEnd)
  colResize.handle.classList.remove('dragging')
  colResize = null
}

/** 画布实际缩放倍率：纸张元素的实得宽 / 布局宽（transform: scale 后两者之比即倍率） */
function paperScale(root: HTMLElement, store: DesignerStore): number {
  const paper = root.closest('.hiprint-printPaper') as HTMLElement | null
  const measured = paper && paper.offsetWidth > 0
    ? paper.getBoundingClientRect().width / paper.offsetWidth
    : 0
  return measured || (store.scale || 100) / 100
}

function onColResizeStart(ctx: TableCtx, i: number, ev: MouseEvent) {
  if (ev.button !== 0) return // 仅响应左键，右键不拖动列宽
  const handle = ev.currentTarget as HTMLElement
  const root = handle.closest('.print-table') as HTMLElement | null
  if (!root) return
  abortTableColResize()
  const widths = ctx.real.options.tableColWidths ?? []
  colResize = {
    store: ctx.store, fire: ctx.fire, elId: ctx.real.id, boundary: i,
    startX: ev.clientX, startWidth: widths[i - 1] ?? 0, scale: paperScale(root, ctx.store),
    root, wrapper: handle.closest('.print-element') as HTMLElement | null, handle,
  }
  handle.classList.add('dragging')
  // 拖拽开始前入历史：此刻列宽仍是本次交互前的值（canvas 在收尾处 record 会让撤销错位一步）
  ctx.store.recordHistory()
  document.addEventListener('mousemove', onColResizeMove)
  document.addEventListener('mouseup', onColResizeEnd)
}

function onColResizeMove(e: MouseEvent) {
  const st = colResize
  if (!st) return
  const real = findRealElement(st.store, st.elId)
  const widths = real?.options.tableColWidths
  if (!real || !widths) return
  // 鼠标位移 px → mm：画布 transform:scale 下 1mm ≈ PX_PER_MM*scale px
  const deltaMm = (e.clientX - st.startX) / (st.scale * PX_PER_MM)
  const colIndex = st.boundary - 1
  widths[colIndex] = clampResizedColumnWidth(
    widths, colIndex, st.startWidth + deltaMm, maxTableWidthOf(st.store),
  )
  // 实时同步元素 width = 列宽和：避免 table-layout:fixed 下表格 CSS width(100%)
  // 与列宽和失配导致浏览器按比例拉伸列，进而使边界线与右侧内容偏离光标。
  syncTableElementSize(real.options)
  // 定点重绘：只改受影响列宽、手柄位置与元素框，不重建 DOM（否则会打断拖拽输入态）
  widths.forEach((w, i) => {
    const col = st.root.querySelector(`colgroup col:nth-child(${i + 1})`) as HTMLElement | null
    if (col) col.style.width = `${w}mm`
  })
  st.root.querySelectorAll<HTMLElement>('.col-resize-handle').forEach((handle, k) => {
    handle.style.left = `${widths.slice(0, k + 1).reduce((s, w) => s + w, 0)}mm`
  })
  if (st.wrapper) {
    st.wrapper.style.width = `${real.options.width}mm`
    st.wrapper.style.height = `${real.options.height}mm`
  }
}

function onColResizeEnd() {
  document.removeEventListener('mousemove', onColResizeMove)
  document.removeEventListener('mouseup', onColResizeEnd)
  const st = colResize
  if (!st) return
  colResize = null
  st.handle.classList.remove('dragging')
  const real = findRealElement(st.store, st.elId)
  if (real) syncTableElementSize(real.options)
  st.store.emit()
  st.fire('table-col-resize-end', { elementId: st.elId })
}

// ─── 设计态实测尺寸自愈 ───
// HTML 表格行高只是「最小高度」：换行、大字号/大 padding 都会把行撑高，实际渲染高度可能大于行高和。
// 设计框体（选中框/位置标签/吸附对齐）与行类型徽标需跟随 <table> 实测高度，否则虚线与真实占用不一致。

/** 各行实测布局（mm）：写入 TableLocalState.layouts，渲染徽标时优先取用 */
function measureTableDom(store: DesignerStore, elId: string, root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>('table')
  if (!table) return
  const tableHpx = table.offsetHeight
  if (tableHpx <= 0) return // 画布未挂载/隐藏（无布局）时跳过
  const real = findRealElement(store, elId)
  if (!real) return
  let changed = false
  const tableHmm = tableHpx / PX_PER_MM
  if (Math.abs(tableHmm - (real.options.height ?? 0)) > HEIGHT_EPSILON_MM) {
    real.options.height = Math.round(tableHmm * 100) / 100
    changed = true
  }
  // tr.offsetTop 与 table.offsetTop 同属一个 offsetParent（.print-table 为 relative）
  const baseTop = table.offsetTop
  const layout = Array.from(table.rows).map(tr => ({
    top: (tr.offsetTop - baseTop) / PX_PER_MM,
    height: tr.offsetHeight / PX_PER_MM,
  }))
  const st = tableState(store)
  if (!sameLayout(st.layouts.get(elId), layout)) {
    st.layouts.set(elId, layout)
    changed = true
  }
  // 量化到 0.1mm 后不再变化即停，避免「实测→重绘→再实测」抖动
  if (changed) store.emit(false)
}

function sameLayout(
  prev: { top: number; height: number }[] | undefined, next: { top: number; height: number }[],
): boolean {
  if (!prev || prev.length !== next.length) return false
  return next.every((v, i) => {
    const p = prev[i]!
    return Math.round(v.top * 10) === Math.round(p.top * 10)
      && Math.round(v.height * 10) === Math.round(p.height * 10)
  })
}

/**
 * 挂载后实测探针：绘制期拿不到 DOM 节点，插入一个注释节点作为「本次绘制的后代」，
 * 下一帧它已连在真实树上（若被更新的绘制替换则 isConnected 为假，直接跳过）。
 */
function measureProbe(store: DesignerStore, elId: string): Node {
  const probe = document.createComment('pd-table-measure')
  requestAnimationFrame(() => {
    if (!probe.isConnected) return
    const root = probe.parentElement
    if (root) measureTableDom(store, elId, root)
  })
  return probe
}

// ─── 渲染 ───

function colResizeEnabled(ctx: TableCtx): boolean {
  return ctx.isSelected && !ctx.real.options.locked && ctx.colWidths.length >= 1
}

/** 列边界索引（1..n），n 为最后一列右边界 */
function colResizeBoundaries(ctx: TableCtx): number[] {
  return Array.from({ length: ctx.colWidths.length }, (_, k) => k + 1)
}

/** 边界 i 的水平位置（mm）= 前 i 列宽度和；i=n 时即表格右边界 */
function colBoundaryLeftMm(ctx: TableCtx, i: number): number {
  return ctx.colWidths.slice(0, i).reduce((s, w) => s + w, 0)
}

export function renderTable(el: RuntimeElement, store: DesignerStore, fire: TableFire): El {
  const ctx = makeCtx(store, fire, el)
  if (!ctx) return h('div', { class: 'print-table' })
  const children: unknown[] = [
    h('table', { style: { fontSize: `${defaultFontSize(ctx)}pt`, color: defaultColor(ctx) } }, [
      h('colgroup', {}, ctx.colWidths.map(w => h('col', { style: { width: w + 'mm' } }))),
      h('tbody', {}, ctx.rows.map((row, ri) => h('tr', { style: { height: row.height + 'mm' } },
        row.cells
          .map((cell, ci) => cell.merged ? '' : h('td', {
            rowspan: cell.rowspan || 1,
            colspan: cell.colspan || 1,
            class: cellClass(ctx, ri, ci),
            style: cellStyle(ctx, cell),
            onMousedown: (ev: Event) => onCellMouseDown(ctx, ri, ci, ev as MouseEvent),
            onMouseenter: () => onCellMouseEnter(ctx, ri, ci),
            onDblclick: (ev: Event) => onCellDblClick(ctx, ri, ci, cell.id, ev as MouseEvent),
            onContextmenu: (ev: Event) => openCellMenu(ctx, ri, ci, ev as MouseEvent),
          }, [cellContent(ctx, row, ri, ci, cell)]))
          .filter(Boolean)))),
    ]),
  ]
  if (colResizeEnabled(ctx)) {
    children.push(h('div', { class: 'col-resize-layer' }, colResizeBoundaries(ctx).map(i => h('div', {
      class: 'col-resize-handle',
      role: 'separator',
      'aria-label': `列宽手柄${i}`,
      style: { left: colBoundaryLeftMm(ctx, i) + 'mm' },
      onMousedown: (ev: Event) => {
        ev.stopPropagation()
        ev.preventDefault()
        onColResizeStart(ctx, i, ev as MouseEvent)
      },
    }))))
  }
  if (ctx.isSelected) {
    children.push(h('div', { class: 'row-badges' }, ctx.rows.map((row, ri) => h('span', {
      class: 'row-badge',
      style: { top: badgeTopMm(ctx, ri) + 'mm', height: badgeHeightMm(ctx, ri) + 'mm' },
      text: ROW_TYPE_BADGE[row.type],
    }))))
  }
  children.push(measureProbe(store, el.id))
  // design-mode：本壳层只用于设计器画布（预览/出纸走 core 的同构渲染管线）
  return h('div', {
    class: 'print-table design-mode',
    dataset: { tableId: el.id },
    onContextmenu: (ev: Event) => ev.preventDefault(),
  }, children)
}
