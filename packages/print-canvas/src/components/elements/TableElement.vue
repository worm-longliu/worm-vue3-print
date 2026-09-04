<!-- Excel 风格表格元素：单元格矩阵编辑器（选区/右键菜单/双击编辑） -->
<template>
  <div class="print-table" :class="{ 'design-mode': designMode }" @contextmenu.prevent>
    <table ref="tableRef" :style="{ fontSize: defaultFontSize + 'pt', color: defaultColor }">
      <colgroup>
        <col v-for="(w, i) in colWidths" :key="i" :style="{ width: w + 'mm' }" />
      </colgroup>
      <tbody>
        <tr v-for="(row, ri) in rows" :key="row.id" :style="{ height: row.height + 'mm' }">
          <template v-for="(cell, ci) in row.cells" :key="cell.id">
            <td
              v-if="!cell.merged"
              :rowspan="cell.rowspan || 1"
              :colspan="cell.colspan || 1"
              :class="cellClass(ri, ci)"
              :style="cellStyle(row, cell)"
              @mousedown.left="onCellMouseDown(ri, ci, $event)"
              @mouseenter="onCellMouseEnter(ri, ci)"
              @dblclick.stop="onCellDblClick(ri, ci)"
              @contextmenu.prevent.stop="onCellContextMenu(ri, ci, $event)"
            >
              <CellBarcode
                v-if="isCodeCell(cell)"
                :cell-type="cell.cellType as 'barcode' | 'qrcode'"
                :value="cellDisplay(row, cell)"
                :barcode-type="cell.barcodeType"
                :qr-code-level="cell.qrCodeLevel"
                :show-text="cell.showBarcodeText"
                :fit="cell.fit"
                :max-width="cell.maxWidth"
                :max-height="cell.maxHeight"
              />
              <CellImage
                v-else-if="cell.cellType === 'image'"
                :value="cell.formatter || ''"
                :fit="cell.fit"
                :max-width="cell.maxWidth"
                :max-height="cell.maxHeight"
                :design-mode="designMode"
                :data="imageData"
              />
              <span v-else-if="row.type === 'data'" class="data-placeholder">
                {{ cellDisplay(row, cell) }}
              </span>
              <template v-else>{{ cellDisplay(row, cell) }}</template>
            </td>
          </template>
        </tr>
      </tbody>
    </table>
    <!-- 列宽拖拽手柄（仅设计态选中且未锁定时） -->
    <div v-if="colResizeEnabled" class="col-resize-layer">
      <div
        v-for="i in colResizeBoundaries"
        :key="i"
        class="col-resize-handle"
        :class="{ dragging: colResizeBoundary === i }"
        :style="{ left: colBoundaryLeftMm(i) + 'mm' }"
        @mousedown.stop.prevent="onColResizeStart(i, $event)"
      />
    </div>
    <!-- 行类型徽标（仅设计态且元素被选中） -->
    <div v-if="designMode && isSelected" class="row-badges">
      <span
        v-for="(row, ri) in rows"
        :key="row.id"
        class="row-badge"
        :style="{ top: badgeTopMm(ri) + 'mm', height: badgeHeightMm(ri) + 'mm' }"
      >
        {{ ROW_TYPE_BADGE[row.type] }}
      </span>
    </div>
    <TableContextMenu
      :visible="menu.visible"
      :x="menu.x"
      :y="menu.y"
      :can-delete-row="rows.length > 1"
      :can-delete-col="colWidths.length > 1"
      :merge-disabled-reason="mergeReason"
      :can-split="canSplit"
      :current-row-type="selection ? rows[selection.r1]?.type ?? null : null"
      :row-type-disabled-reason="rowTypeReason"
      @action="onMenuAction"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { RuntimeElement, TableRow, TableCell, TableRowType } from '../../types'
import {
  normalizeSelection, canMergeReason, mergeCells, splitCells,
  insertRow, deleteRow, insertCol, deleteCol, setRowType, syncTableElementSize,
  resolveCellBorderCss, clampResizedColumnWidth,
} from '../../utils/table-matrix'
import { TABLE_EDIT_KEY, type TableEditContext } from '../../composables/useTableSelection'
import TableContextMenu from './TableContextMenu.vue'
import CellBarcode from './CellBarcode.vue'
import CellImage from './CellImage.vue'
import { resolveBarcodeDesignValue } from '../../utils/binding'
import { DEFAULT_DEMO_DATA } from '../../utils/demo-data'

const ROW_TYPE_BADGE: Record<TableRowType, string> = {
  header: '题', data: '数', subtotal: '小', summary: '汇',
}

const props = defineProps<{
  element: RuntimeElement
  designMode?: boolean
  isSelected?: boolean
  /** 设计态下无边框单元格是否显示虚拟虚线（默认 true） */
  showTableGhostBorder?: boolean
  /** 画布缩放倍率（用于列宽拖拽 px→mm 换算） */
  scale?: number
  /** 打印数据（用于运行态图片等动态内容） */
  data?: Record<string, any>[]
}>()

const emit = defineEmits<{
  'dblclick-element': [id: string]
  'dblclick-cell': [elementId: string, r: number, c: number]
}>()

// PrintDesigner 注入：选区共享 + 历史提交（非设计态如 PDF 预览无注入，提供空实现）
const editCtx = inject<TableEditContext>(TABLE_EDIT_KEY, {
  tableSelection: ref(null),
  setTableSelection: () => {},
  recordHistory: () => {},
  maxTableWidth: ref(Infinity),
})

const rows = computed<TableRow[]>(() => props.element.options.tableRows ?? [])
const colWidths = computed<number[]>(() => props.element.options.tableColWidths ?? [])
const defaultFontSize = computed(() => props.element.options.tableDefaultFontSize ?? 10)
const defaultColor = computed(() => props.element.options.tableDefaultColor ?? '#333333')

/** 当前元素的选区（全局选区属于本元素时才生效） */
const selection = computed(() => {
  const s = editCtx.tableSelection.value
  return s && s.elementId === props.element.id ? s : null
})

function rowTopMm(ri: number): number {
  let t = 0
  for (let i = 0; i < ri; i++) t += rows.value[i]!.height
  return t
}

// ─── 设计态实测尺寸自愈 ───
// HTML 表格行高只是「最小高度」：单元格内容换行、大字号/大 padding 都会把行撑高，
// 实际渲染高度可能大于行高和（打印端 overflow:visible 并按实测高度分页，行为一致）。
// 设计框体（虚线选框/选中框/位置标签/吸附对齐）需跟随 <table> 实测高度，
// 否则选中时示意虚线框与表格真实占用高度不一致。
const tableRef = ref<HTMLTableElement | null>(null)

/** 96dpi 下 1mm ≈ 3.78px（与 render/browser-pagination 测量遍同一常量） */
const PX_PER_MM = 3.7795275591
/** 实测高度与模型高度差小于该值（mm）时不回写，避免无意义抖动 */
const HEIGHT_EPSILON_MM = 0.1

/** 各行实测布局（mm）：行被内容撑高时，行类型徽标按实测位置/高度对齐 */
const rowLayoutMm = ref<{ top: number; height: number }[]>([])

function measureTable() {
  if (!props.designMode) return
  const table = tableRef.value
  if (!table) return
  const tableHpx = table.offsetHeight
  if (tableHpx <= 0) return // 画布未挂载/隐藏（无布局）时跳过
  const o = props.element.options
  const tableHmm = tableHpx / PX_PER_MM
  if (Math.abs(tableHmm - (o.height ?? 0)) > HEIGHT_EPSILON_MM) {
    o.height = Math.round(tableHmm * 100) / 100
  }
  // tr.offsetTop 与 table.offsetTop 同属一个 offsetParent（.print-table 为 relative）
  const baseTop = table.offsetTop
  rowLayoutMm.value = Array.from(table.rows).map(tr => ({
    top: (tr.offsetTop - baseTop) / PX_PER_MM,
    height: tr.offsetHeight / PX_PER_MM,
  }))
}

/** 行徽标顶距：优先实测位置，未测量时回退行高累加 */
function badgeTopMm(ri: number): number {
  return rowLayoutMm.value[ri]?.top ?? rowTopMm(ri)
}

/** 行徽标高：优先实测高度，未测量时回退配置行高 */
function badgeHeightMm(ri: number): number {
  return rowLayoutMm.value[ri]?.height ?? rows.value[ri]?.height ?? 0
}

// 表格结构/内容/样式任意变化后，在 DOM 更新完毕时实测（post 钩子保证读到新布局）
watch(
  () => [props.element.options, props.designMode],
  () => measureTable(),
  { deep: true, flush: 'post' },
)

onMounted(() => {
  measureTable()
  // Web 字体加载完成后字宽可能变化导致换行变化，补测一次
  document.fonts?.ready.then(() => measureTable())
})

// ─── 单元格显示与样式 ───

/** demo 数据中 data 行迭代用的列表（与服务端 resolveListSource 优先级一致） */
const demoList = computed<Record<string, any>[] | undefined>(() => {
  const ds = props.element.options.dataSource
  if (ds && Array.isArray(DEFAULT_DEMO_DATA[ds])) return DEFAULT_DEMO_DATA[ds]
  for (const v of Object.values(DEFAULT_DEMO_DATA)) {
    if (Array.isArray(v)) return v as Record<string, any>[]
  }
  return undefined
})

// 添加图片数据处理
const imageData = computed(() => {
  // 运行态：使用打印数据
  if (props.data) {
    return props.data
  }
  // 设计态：使用 demo 数据
  return undefined
})

function isCodeCell(cell: TableCell): boolean {
  return cell.cellType === 'barcode' || cell.cellType === 'qrcode'
}

function cellDisplay(_row: TableRow, cell: TableCell): string {
  if (isCodeCell(cell)) {
    return resolveBarcodeDesignValue(cell.formatter, demoList.value)
  }
  return cell.formatter || ''
}

function cellStyle(_row: TableRow, cell: TableCell): Record<string, string> {
  const o = props.element.options
  // 设计态下无边框边补虚拟虚线（仅设计稿展示，预览/打印输出不受影响）
  const borderOpts = { designMode: props.designMode, showGhostBorder: props.showTableGhostBorder }
  return {
    fontFamily: cell.fontFamily || 'inherit',
    textAlign: cell.align ?? 'left',
    verticalAlign: cell.valign ?? 'middle',
    fontSize: (cell.fontSize ?? defaultFontSize.value) + 'pt',
    fontWeight: cell.fontWeight ?? 'normal',
    color: cell.color ?? defaultColor.value,
    backgroundColor: cell.backgroundColor ?? 'transparent',
    borderTop: resolveCellBorderCss(cell.borders?.top, borderOpts),
    borderRight: resolveCellBorderCss(cell.borders?.right, borderOpts),
    borderBottom: resolveCellBorderCss(cell.borders?.bottom, borderOpts),
    borderLeft: resolveCellBorderCss(cell.borders?.left, borderOpts),
    padding: (cell.padding ?? o.tableDefaultPadding ?? 1) + 'mm',
    whiteSpace: (cell.wordWrap ?? true) ? 'normal' : 'nowrap',
    overflow: (cell.wordWrap ?? true) ? 'visible' : 'hidden',
  }
}

function cellClass(ri: number, ci: number): Record<string, boolean> {
  const s = selection.value
  const inSel = !!s && ri >= s.r1 && ri <= s.r2 && ci >= s.c1 && ci <= s.c2
  return { 'cell-selected': inSel, 'row-data-bg': rows.value[ri]!.type === 'data' }
}

// ─── 选区交互 ───

const dragAnchor = ref<{ r: number; c: number } | null>(null)

function applySelection(a: { r: number; c: number }, b: { r: number; c: number }) {
  const rect = normalizeSelection(rows.value, a, b)
  editCtx.setTableSelection({ elementId: props.element.id, ...rect })
}

function onCellMouseDown(r: number, c: number, e: MouseEvent) {
  if (!props.designMode || !props.isSelected) return
  e.stopPropagation() // 阻止画布拖拽元素
  if (e.shiftKey && selection.value) {
    applySelection({ r: selection.value.r1, c: selection.value.c1 }, { r, c })
  } else {
    dragAnchor.value = { r, c }
    applySelection({ r, c }, { r, c })
  }
  window.addEventListener('mouseup', () => { dragAnchor.value = null }, { once: true })
}

function onCellMouseEnter(r: number, c: number) {
  if (dragAnchor.value) applySelection(dragAnchor.value, { r, c })
}

// ─── 双击编辑 ───

function onCellDblClick(r: number, c: number) {
  if (!props.designMode) return
  // 单元格双击：上报单元格坐标，由 PrintDesigner 打开该单元格的表达式编辑器
  emit('dblclick-cell', props.element.id, r, c)
}

// ─── 右键菜单 ───

const menu = reactive({ visible: false, x: 0, y: 0 })

function onCellContextMenu(r: number, c: number, e: MouseEvent) {
  if (!props.designMode || !props.isSelected) return
  const s = selection.value
  const inSel = s && r >= s.r1 && r <= s.r2 && c >= s.c1 && c <= s.c2
  if (!inSel) applySelection({ r, c }, { r, c })
  menu.x = e.clientX
  menu.y = e.clientY
  menu.visible = true
  window.addEventListener('mousedown', () => { menu.visible = false }, { once: true })
}

const mergeReason = computed(() => {
  const s = selection.value
  if (!s) return '未选择单元格'
  return canMergeReason(rows.value, s)
})

const canSplit = computed(() => {
  const s = selection.value
  if (!s) return false
  for (let r = s.r1; r <= s.r2; r++) {
    for (let c = s.c1; c <= s.c2; c++) {
      const cell = rows.value[r]!.cells[c]!
      if (!cell.merged && ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1)) return true
    }
  }
  return false
})

function rowTypeReason(t: TableRowType): string | null {
  const s = selection.value
  if (!s) return '未选择单元格'
  if (s.r1 !== s.r2) return '行类型仅支持单行设置'
  // 试算校验：在 JSON 深拷贝上执行（兼容 reactive Proxy）
  const cloned = JSON.parse(JSON.stringify(rows.value)) as TableRow[]
  return setRowType(cloned, s.r1, t)
}

function syncElementSize() {
  // 尺寸派生统一走共享函数：width/height 恒为列宽和/行高和（mm）
  syncTableElementSize(props.element.options)
}

/** 插入列前检查：新列复制相邻列宽，总列宽不得超过页面打印范围宽度 */
function checkColWidthLimit(cw: number[], index: number): string | null {
  const maxW = editCtx.maxTableWidth.value
  const totalW = cw.reduce((s, w) => s + w, 0) + cw[index]!
  if (totalW > maxW) {
    return `插入后表格总宽 ${Math.round(totalW * 10) / 10}mm 超过打印范围宽度 ${maxW}mm，请先缩小列宽`
  }
  return null
}

function onMenuAction(name: string, payload?: string) {
  const s = selection.value
  if (!s) return
  menu.visible = false
  const o = props.element.options
  const rs = o.tableRows!
  const cw = o.tableColWidths!
  let err: string | null = null
  switch (name) {
    case 'insert-row-above': insertRow(rs, s.r1, 'above'); break
    case 'insert-row-below': insertRow(rs, s.r2, 'below'); break
    case 'delete-row': err = deleteRow(rs, s.r1); break
    case 'insert-col-left': err = checkColWidthLimit(cw, s.c1); if (!err) insertCol(rs, cw, s.c1, 'left'); break
    case 'insert-col-right': err = checkColWidthLimit(cw, s.c2); if (!err) insertCol(rs, cw, s.c2, 'right'); break
    case 'delete-col': err = deleteCol(rs, cw, s.c1); break
    case 'merge': mergeCells(rs, s); break
    case 'split': splitCells(rs, s); break
    case 'set-row-type':
      err = setRowType(rs, s.r1, payload as TableRowType)
      break
  }
  if (err) {
    alert(err)
    return
  }
  editCtx.setTableSelection(null) // 结构变化后选区坐标失效，清空
  syncElementSize()
  editCtx.recordHistory()
}

// ─── 列宽拖拽 ───
// 仅设计态选中且未锁定的多列表格渲染内部列边界手柄；拖拽期间实时回写列宽，
// mouseup 时同步元素尺寸并记一次历史（与右键菜单结构操作一致）。
const colResizeEnabled = computed(
  () => props.designMode && !!props.isSelected && !props.element.options.locked && colWidths.value.length > 1,
)
/** 内部列边界索引（1..n-1），单列无边界 */
const colResizeBoundaries = computed<number[]>(() =>
  colWidths.value.length > 1
    ? Array.from({ length: colWidths.value.length - 1 }, (_, k) => k + 1)
    : [],
)
/** 第 i 列左边界位置（mm）= 前 i 列宽和 */
function colBoundaryLeftMm(i: number): number {
  return colWidths.value.slice(0, i).reduce((s, w) => s + w, 0)
}

const colResizeBoundary = ref<number | null>(null)
let resizeStartX = 0
let resizeStartWidth = 0

/** 拖拽边界 i（第 i 列左边界）：调整其左侧第 i-1 列的宽度，使被拖动的边界线跟随光标 */
function onColResizeStart(i: number, e: MouseEvent) {
  if (!colResizeEnabled.value) return
  colResizeBoundary.value = i
  resizeStartX = e.clientX
  resizeStartWidth = colWidths.value[i - 1]!
  document.addEventListener('mousemove', onColResizeMove)
  document.addEventListener('mouseup', onColResizeEnd)
}

function onColResizeMove(e: MouseEvent) {
  if (colResizeBoundary.value === null) return
  const scale = props.scale || 1
  const deltaMm = (e.clientX - resizeStartX) / scale
  const colIndex = colResizeBoundary.value - 1
  const widths = props.element.options.tableColWidths!
  widths[colIndex] = clampResizedColumnWidth(
    widths, colIndex, resizeStartWidth + deltaMm, editCtx.maxTableWidth.value,
  )
}

function onColResizeEnd() {
  document.removeEventListener('mousemove', onColResizeMove)
  document.removeEventListener('mouseup', onColResizeEnd)
  if (colResizeBoundary.value === null) return
  colResizeBoundary.value = null
  syncElementSize()
  editCtx.recordHistory()
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onColResizeMove)
  document.removeEventListener('mouseup', onColResizeEnd)
})
</script>

<style scoped>
.print-table {
  position: relative;
  width: 100%;
  height: 100%;
}
.print-table table {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
}
.print-table td {
  box-sizing: border-box;
  word-break: break-all;
}
.cell-selected {
  outline: 2px solid #165DFF;
  outline-offset: -2px;
  background-color: rgba(22, 93, 255, 0.08);
}
.row-data-bg {
  background-image: repeating-linear-gradient(
    45deg,
    rgba(22, 93, 255, 0.04) 0 6px,
    transparent 6px 12px
  );
}
.data-placeholder {
  color: #909399;
  font-style: italic;
}
.cell-editor {
  width: 100%;
  border: none;
  outline: none;
  background: #fffbe6;
  font: inherit;
}
.row-badges {
  position: absolute;
  left: -16px;
  top: 0;
  width: 14px;
}
.row-badge {
  position: absolute;
  width: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #909399;
  background: #f5f7fa;
  border-radius: 2px;
}
.col-resize-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}
.col-resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-50%);
  cursor: col-resize;
  pointer-events: auto;
}
/* 手柄 hover/拖拽时显示主题色竖线，提示列边界位置 */
.col-resize-handle::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  border-left: 1px solid transparent;
}
.col-resize-handle:hover::after,
.col-resize-handle.dragging::after {
  border-left-color: var(--pd-accent, #165DFF);
}
</style>
