// 表格类属性分组：DOM 逐字对齐 canvas 的
// property/{TableRowGroup,TableCellGroup,TableSettingsGroup,PaginationGroup}.vue
// （样式由 scripts/gen-styles.mjs 从 canvas 派生，类名对不上样式就掉）。
// 矩阵/边框/合并等操作一律走 @worm-vue3-print/core/designer 纯函数，
// 历史与重绘统一经 store.updateElement 收口（canvas 侧靠 Vue 响应式，这里必须显式 emit）。
import type {
  BorderPreset, ElementOptions, RuntimeElement, TableCell, TableCellBorder, TableCellBorders,
  TableCellType, TextAlign, TextFit, TableRow, TableRowType,
} from '@worm-vue3-print/core/designer'
import {
  applyBorderPreset, canMergeReason, findMainCell, mergeCells, resolveCellTextFit, setHeaderRepeat,
  setRowType, splitCells,
} from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import type { El } from '../core/h'
import type { DesignerStore } from '../core/store'
import { colorTrigger, divider, radioGroup, stepper } from './controls'
import type { ShellCtx } from './controls'
import { renderFontSelect } from './font-select'
import { gateItem } from './property-search'
import { group, pdForm } from './prop-group'

/** Common 的 stepper 没有「清空」通道：未设置以 0 呈现，提交时 0 回落 undefined（= 继承表格/全局默认） */
const optNum = (v: number | undefined): number => Number(v ?? 0)
const orUndef = (v: number): number | undefined => (v ? v : undefined)

/** canvas 的开关行是 input.pd-switch 本体（.pd-switch 样式作用在 input 上），不走 label 壳 */
function switchRow(label: string, checked: boolean, onCommit: (v: boolean) => void, title?: string): El {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label', ...(title ? { title } : {}), text: label }),
    h('input', {
      class: 'pd-switch', type: 'checkbox', checked,
      onChange: (ev: Event) => onCommit((ev.target as HTMLInputElement).checked),
    }),
  ])
}

function selectRow(label: string, value: string, options: { value: string; label: string }[],
  onCommit: (v: string) => void, full = false): El {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label', text: label }),
    h('select', {
      class: 'pd-select', ...(full ? { style: { width: '100%' } } : {}),
      onChange: (ev: Event) => onCommit((ev.target as HTMLSelectElement).value),
    }, options.map(o => h('option', { value: o.value, text: o.label, selected: o.value === value }))),
  ])
}

const hint = (text: string): El => h('p', { class: 'pd-hint', text })

const HEADER_REPEAT_TIP = '多级表头作为一个结构整体重复，勾选后表头区所有行都会在每页顶部重复'

const ROW_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'header', label: '标题行' },
  { value: 'data', label: '数据行' },
  { value: 'subtotal', label: '小计行（每页小计）' },
  { value: 'summary', label: '汇总行' },
]

const BARCODE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'CODE128', label: 'CODE128（通用）' },
  { value: 'EAN13', label: 'EAN13（商品码）' },
  { value: 'EAN8', label: 'EAN8' },
  { value: 'UPC', label: 'UPC' },
  { value: 'CODE39', label: 'CODE39' },
  { value: 'ITF14', label: 'ITF14' },
]

const QR_LEVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'L', label: 'L（最低，容量大）' },
  { value: 'M', label: 'M（推荐）' },
  { value: 'Q', label: 'Q' },
  { value: 'H', label: 'H（最高）' },
]

const FIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'contain', label: '包含（保持比例）' },
  { value: 'cover', label: '覆盖（保持比例）' },
  { value: 'fill', label: '拉伸填满' },
  { value: 'none', label: '原始尺寸' },
  { value: 'scale-down', label: '缩小（保持比例）' },
]

const TEXT_FIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'clip', label: '截断' },
  { value: 'shrink', label: '自动缩小' },
  { value: 'autoHeight', label: '自适应行高' },
]

/** 行属性：行类型 / 行高 / 表头每页重复（作用于整个表头区） */
export function tableRowGroup(ctx: ShellCtx, el: RuntimeElement): El {
  const s = ctx.store
  const sel = s.tableSelection
  const rows: TableRow[] = el.options.tableRows ?? []
  const row = sel ? rows[sel.r1] : undefined
  if (!sel || !row) return group(ctx, 'table-row', '行属性', 'Grid', [])

  const commit = (patch: Partial<ElementOptions>) => s.updateElement(el.id, patch)

  return group(ctx, 'table-row', '行属性', 'Grid', [
    pdForm([
      selectRow('行类型', row.type, ROW_TYPE_OPTIONS, (v) => {
        const err = setRowType(rows, sel.r1, v as TableRowType)
        if (err) { window.alert(err); return }
        commit({ tableRows: rows })
      }, true),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '行高 (mm)' }),
        stepper({
          value: row.height, min: 3, max: 100, step: 0.5,
          onCommit: (v) => { row.height = v; commit({ tableRows: rows }) },
        }),
      ]),
      row.type === 'header'
        ? switchRow('表头每页重复', row.repeatOnPage ?? false, (v) => {
          setHeaderRepeat(rows, v)
          commit({ tableRows: rows })
        }, HEADER_REPEAT_TIP)
        : '',
    ]),
  ])
}

/** 表格设置：列表数据源、表格级默认样式、逐列列宽 */
export function tableSettingsGroup(ctx: ShellCtx, el: RuntimeElement): El {
  const s = ctx.store
  const o = el.options
  const commit = (patch: Partial<ElementOptions>) => s.updateElement(el.id, patch)
  const widths = o.tableColWidths ?? []
  /** 页面打印范围宽度（mm）：与 shell/table.ts 的列宽拖拽同一上限口径 */
  const maxTableWidth = s.paperSize.width - s.templateData.margins.left - s.templateData.margins.right
  const listFields = s.fields
    .filter(f => f.fieldType === 'list')
    .map(f => ({ value: f.fieldKey, label: f.fieldLabel }))

  return group(ctx, 'table-settings', '表格设置', 'Grid', [
    pdForm([
      selectRow('列表数据源字段', o.dataSource ?? '', listFields, (v) => commit({ dataSource: v || undefined }), true),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '默认字号 (pt)' }),
        stepper({
          value: optNum(o.tableDefaultFontSize), min: 0, max: 72, placeholder: '默认',
          onCommit: (v) => commit({ tableDefaultFontSize: orUndef(v) }),
        }),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '默认文字颜色' }),
        colorTrigger(o.tableDefaultColor, v => commit({ tableDefaultColor: v }), '默认文字颜色'),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '默认内边距 (mm)' }),
        stepper({
          value: optNum(o.tableDefaultPadding), min: 0, max: 10, step: 0.5, placeholder: '默认',
          onCommit: (v) => commit({ tableDefaultPadding: orUndef(v) }),
        }),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '列宽 (mm)' }),
        ...widths.map((w, i) => h('div', { class: 'col-width-row' }, [
          h('span', { style: { width: '60px' }, text: `列${i + 1}` }),
          stepper({
            value: w, min: 5, max: 200,
            onCommit: (v) => {
              const othersW = widths.reduce((sum, cw, idx) => (idx === i ? sum : sum + cw), 0)
              if (othersW + v > maxTableWidth) {
                const clamped = Math.max(5, Math.round((maxTableWidth - othersW) * 10) / 10)
                window.alert(`表格总宽不能超过打印范围宽度 ${maxTableWidth}mm，列${i + 1} 已调整为 ${clamped}mm`)
                widths[i] = clamped
              } else {
                widths[i] = v
              }
              commit({ tableColWidths: widths })
            },
          }),
        ])),
      ]),
    ]),
  ])
}

/** 分页配置：表格元素只有「启用分页」，非表格元素为「参与分页 / 与下元素同页」 */
export function paginationGroup(ctx: ShellCtx, el: RuntimeElement): El {
  const s = ctx.store
  const o = el.options
  const isTable = el.printElementType.type === 'table'
  const patch = (p: Partial<ElementOptions>) => s.updateElement(el.id, p)
  const items: El[] = []
  if (isTable) {
    items.push(gateItem(ctx, 'pg-enabled', switchRow('启用分页', o.tablePagination?.enabled ?? true,
      v => patch({ tablePagination: { enabled: v } }))))
  } else {
    const pageable = o.pagination?.pageable ?? true
    const keepWithNext = o.pagination?.keepWithNext ?? false
    items.push(gateItem(ctx, 'pg-pageable', switchRow('参与分页', pageable,
      v => patch({ pagination: { pageable: v, keepWithNext } }))))
    items.push(gateItem(ctx, 'pg-keep-with-next', switchRow('与下元素同页', keepWithNext,
      v => patch({ pagination: { pageable, keepWithNext: v } }))))
  }
  return group(ctx, 'pagination', '分页配置', 'Document', [pdForm(items)], false)
}

/** 边框草稿：canvas 存在组件 ref 上，Common 每次重绘重建 DOM，故按 store 持久化同一份 */
interface BorderDraft {
  style: TableCellBorder['style']
  width: number
  color: string
  edges: string[]
}
const draftByStore = new WeakMap<DesignerStore, BorderDraft>()

function borderDraft(store: DesignerStore): BorderDraft {
  let d = draftByStore.get(store)
  if (!d) { d = { style: 'solid', width: 0.75, color: '#333333', edges: [] }; draftByStore.set(store, d) }
  return d
}

const BORDER_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' }, { value: 'double', label: '双线' },
]

const BORDER_EDGES: { value: 'top' | 'right' | 'bottom' | 'left'; label: string }[] = [
  { value: 'top', label: '上' }, { value: 'right', label: '右' },
  { value: 'bottom', label: '下' }, { value: 'left', label: '左' },
]

/** 单元格：内容类型与码制 / 内容表达式 / 样式 / 边框 / 合并拆分（作用于整个选区） */
export function tableCellGroup(ctx: ShellCtx, el: RuntimeElement): El {
  const s = ctx.store
  const sel = s.tableSelection
  const rows: TableRow[] = el.options.tableRows ?? []
  if (!sel) return group(ctx, 'table-cell', '单元格', 'Menu', [])
  const main = findMainCell(rows, sel.r1, sel.c1)
  const cell0 = rows[main.r]?.cells[main.c]
  if (!cell0) return group(ctx, 'table-cell', '单元格', 'Menu', [])

  const draft = borderDraft(s)
  const write = (fn: (c: TableCell) => void) => {
    for (let r = sel.r1; r <= sel.r2; r++) {
      for (let c = sel.c1; c <= sel.c2; c++) {
        const cell = rows[r]?.cells[c]
        if (cell && !cell.merged) fn(cell)
      }
    }
    s.updateElement(el.id, { tableRows: rows })
  }
  const currentBorder = (): TableCellBorder => ({ width: draft.width, style: draft.style, color: draft.color })

  const isBarcodeCell = cell0.cellType === 'barcode'
  const isQrcodeCell = cell0.cellType === 'qrcode'
  const isImageCell = cell0.cellType === 'image'
  const isTextCell = !isBarcodeCell && !isQrcodeCell && !isImageCell
  const dotAligned = isBarcodeCell && !!cell0.printerDpi
  const cellTextFit = resolveCellTextFit(cell0)
  const mergeReason = canMergeReason(rows, sel)
  let canSplit = false
  for (let r = sel.r1; r <= sel.r2 && !canSplit; r++) {
    for (let c = sel.c1; c <= sel.c2 && !canSplit; c++) {
      const cell = rows[r]?.cells[c]
      if (cell && !cell.merged && ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1)) canSplit = true
    }
  }

  const numField = (label: string, value: number, writeValue: (c: TableCell, v: number | undefined) => void,
    opts: { min?: number; max?: number; step?: number; placeholder?: string } = {}): El => h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label', text: label }),
    stepper({ value, ...opts, onCommit: v => write(c => writeValue(c, orUndef(v))) }),
  ])

  return group(ctx, 'table-cell', '单元格', 'Menu', [
    pdForm([
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '单元格类型' }),
        radioGroup('cell-type', [
          { value: 'text', label: '文本' }, { value: 'barcode', label: '条形码' },
          { value: 'qrcode', label: '二维码' }, { value: 'image', label: '图片' },
        ], cell0.cellType || 'text', (v) => {
          write(c => {
            c.cellType = v === 'text' ? undefined : (v as TableCellType)
            if (v !== 'barcode') { c.barcodeType = undefined; c.showBarcodeText = undefined; c.printerDpi = undefined }
            if (v !== 'qrcode') c.qrCodeLevel = undefined
          })
        }),
      ]),

      isBarcodeCell ? selectRow('码制', cell0.barcodeType || 'CODE128', BARCODE_TYPE_OPTIONS,
        v => write(c => { c.barcodeType = v || undefined })) : '',
      isBarcodeCell ? switchRow('显示文本', cell0.showBarcodeText !== false,
        v => write(c => { c.showBarcodeText = v })) : '',
      isBarcodeCell
        ? numField('条宽（倍率）', cell0.barWidth ?? 2, (c, v) => { c.barWidth = v }, { min: 2, max: 4, step: 0.5 })
        : '',
      isBarcodeCell ? hint(dotAligned
        ? '已设置打印机分辨率：条宽会被吸附到最近的整数打印点（DPI 优先于毫米值），单元格放不下时整体等比缩小'
        : '热敏/针式打印建议 3 及以上：决定条码的落纸尺寸，条越粗出纸后条宽越稳定') : '',
      isBarcodeCell
        ? numField('文本字号（相对条高，条高为 30）', cell0.barFontSize ?? 10, (c, v) => { c.barFontSize = v }, { min: 5, max: 24, placeholder: '默认 10' })
        : '',
      isBarcodeCell ? selectRow('打印机分辨率', cell0.printerDpi ? String(cell0.printerDpi) : '', [
        { value: '', label: '不指定（按条宽渲染）' }, { value: '203', label: '203 dpi（8 点/mm）' },
        { value: '300', label: '300 dpi（11.8 点/mm）' }, { value: '600', label: '600 dpi（23.6 点/mm）' },
      ], (v) => {
        const dpi = Number(v)
        write(c => { c.printerDpi = dpi > 0 ? dpi : undefined })
      }) : '',
      isBarcodeCell ? hint('填写后条宽吸附到整数打印点（消除出纸「条宽忽宽忽窄」）：条码先按条宽渲染，可用宽度够就原样落纸，不够才整体等比缩小') : '',
      isQrcodeCell ? selectRow('纠错级别', cell0.qrCodeLevel || 'M', QR_LEVEL_OPTIONS,
        v => write(c => { c.qrCodeLevel = v || undefined })) : '',

      isBarcodeCell ? hint('单元格条码尺寸由「条宽」与「打印机分辨率」结算：可用宽度足够时按条宽原样落纸，不足时整体等比缩小；拉伸会把条宽变成非整数，故条形码不提供缩放模式，可用「最大宽高」限制上限') : '',
      (isQrcodeCell || isImageCell) ? selectRow('缩放模式', cell0.fit || 'contain', FIT_OPTIONS,
        v => write(c => { c.fit = v as NonNullable<TableCell['fit']> })) : '',
      (isBarcodeCell || isQrcodeCell || isImageCell)
        ? numField('最大宽度 (mm)', optNum(cell0.maxWidth), (c, v) => { c.maxWidth = v }, { min: 0, max: 200, placeholder: '默认' })
        : '',
      (isBarcodeCell || isQrcodeCell || isImageCell)
        ? numField('最大高度 (mm)', optNum(cell0.maxHeight), (c, v) => { c.maxHeight = v }, { min: 0, max: 200, placeholder: '默认' })
        : '',

      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '内容' }),
        h('input', {
          class: 'pd-input', type: 'text', value: cell0.formatter || '',
          placeholder: '输入内容，支持 {字段} 表达式',
          onChange: (ev: Event) => write(c => { c.formatter = (ev.target as HTMLInputElement).value || undefined }),
          // 表达式编辑器入口在壳层（对照 canvas 的 onDblClickCell → table-cell-dblclick）
          onDblclick: () => ctx.fire('table-cell-dblclick', { elementId: el.id, r: main.r, c: main.c, cellId: cell0.id }),
        }),
      ]),

      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '水平对齐' }),
        radioGroup('cell-align', [
          { value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' },
        ], cell0.align || 'left', v => write(c => { c.align = v as TextAlign })),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '垂直对齐' }),
        radioGroup('cell-valign', [
          { value: 'top', label: '上' }, { value: 'middle', label: '中' }, { value: 'bottom', label: '下' },
        ], cell0.valign || 'top', v => write(c => { c.valign = v as TableCell['valign'] })),
      ]),
      h('div', { class: 'cell-style-grid' }, [
        h('div', { class: 'pd-field cell-font-field' }, [
          h('span', { class: 'pd-label', text: '字体' }),
          renderFontSelect({
            id: 'cell-font',
            state: ctx.state,
            fonts: ctx.host.fonts,
            value: cell0.fontFamily,
            placeholder: '继承默认',
            onChange: v => write(c => { c.fontFamily = v }),
          }),
        ]),
        numField('字号 (pt)', optNum(cell0.fontSize), (c, v) => { c.fontSize = v }, { min: 0, max: 72, placeholder: '默认' }),
        h('div', { class: 'pd-field' }, [
          h('span', { class: 'pd-label', text: '加粗' }),
          h('input', {
            class: 'pd-switch', type: 'checkbox', checked: cell0.fontWeight === 'bold',
            onChange: (ev: Event) => write(c => {
              c.fontWeight = (ev.target as HTMLInputElement).checked ? 'bold' : undefined
            }),
          }),
        ]),
        h('div', { class: 'pd-field' }, [
          h('span', { class: 'pd-label', text: '文字颜色' }),
          colorTrigger(cell0.color, v => write(c => { c.color = v }), '文字颜色'),
        ]),
        h('div', { class: 'pd-field' }, [
          h('span', { class: 'pd-label', text: '背景色' }),
          colorTrigger(cell0.backgroundColor, v => write(c => { c.backgroundColor = v }), '背景颜色'),
        ]),
      ]),

      divider('边框'),
      h('div', { class: 'border-style-row' }, [
        h('select', {
          class: 'pd-select', style: { width: '90px' },
          onChange: (ev: Event) => {
            draft.style = (ev.target as HTMLSelectElement).value as TableCellBorder['style']
            ctx.repaint()
          },
        }, BORDER_STYLE_OPTIONS.map(o => h('option', {
          value: o.value, text: o.label, selected: o.value === draft.style,
        }))),
        h('div', { style: { width: '112px', flexShrink: '0' } }, [stepper({
          value: draft.width, min: 0.25, max: 5, step: 0.25,
          onCommit: (v) => { draft.width = v; ctx.repaint() },
        })]),
        colorTrigger(draft.color, v => { draft.color = v; ctx.repaint() }, '边框颜色'),
      ]),
      h('div', { class: 'pd-button-group border-presets' }, ([
        ['all', '全部'], ['outer', '外侧'], ['inner', '内部'], ['none', '无'],
      ] as [BorderPreset, string][]).map(([p, label]) => h('button', {
        type: 'button', class: 'pd-button small', text: label,
        onClick: () => { applyBorderPreset(rows, sel, p, currentBorder()); s.updateElement(el.id, { tableRows: rows }) },
      }))),
      h('div', { class: 'pd-checkbox-group' }, BORDER_EDGES.map(edge => h('label', { class: 'pd-checkbox' }, [
        h('input', {
          type: 'checkbox', value: edge.value, checked: draft.edges.includes(edge.value),
          onChange: (ev: Event) => {
            const input = ev.target as HTMLInputElement
            const edges = new Set(draft.edges)
            if (input.checked) edges.add(input.value); else edges.delete(input.value)
            draft.edges = [...edges]
            const b = currentBorder()
            write(c => {
              const nb: TableCellBorders = { ...(c.borders ?? {}) }
              for (const side of BORDER_EDGES) {
                if (edges.has(side.value)) nb[side.value] = { ...b }
                else delete nb[side.value]
              }
              c.borders = nb
            })
          },
        }),
        h('span', { text: edge.label }),
      ]))),

      numField('内边距 (mm)', optNum(cell0.padding), (c, v) => { c.padding = v }, { min: 0, max: 10, step: 0.5, placeholder: '默认' }),
      switchRow('自动换行', cell0.wordWrap ?? true, v => write(c => { c.wordWrap = v })),
      isTextCell ? selectRow('文字溢出', cellTextFit, TEXT_FIT_OPTIONS,
        v => write(c => { c.textFit = v as TextFit }), true) : '',
      (isTextCell && cellTextFit === 'shrink')
        ? numField('最小字号 (pt)', optNum(cell0.shrinkMinFontSize), (c, v) => { c.shrinkMinFontSize = v }, { min: 0, max: 72, step: 0.5, placeholder: '默认 6' })
        : '',

      h('div', { class: 'merge-btns' }, [
        h('button', {
          type: 'button', class: 'pd-button small', text: '合并单元格',
          disabled: !!mergeReason, title: mergeReason || '',
          onClick: () => { mergeCells(rows, sel); s.updateElement(el.id, { tableRows: rows }) },
        }),
        h('button', {
          type: 'button', class: 'pd-button small', text: '拆分单元格', disabled: !canSplit,
          onClick: () => { splitCells(rows, sel); s.updateElement(el.id, { tableRows: rows }) },
        }),
      ]),
    ]),
  ])
}
