// 表格类属性分组：DOM 逐字对齐 canvas 的
// property/{TableRowGroup,TableCellGroup,TableSettingsGroup,PaginationGroup}.vue
// （样式由 scripts/gen-styles.mjs 从 canvas 派生，类名对不上样式就掉）。
// 矩阵/边框/合并等操作一律走 @worm-vue3-print/core/designer 纯函数，
// 历史与重绘统一经 store.updateElement 收口（canvas 侧靠 Vue 响应式，这里必须显式 emit）。
import type {
  BorderPreset, ElementOptions, RuntimeElement, TableCell, TableCellBorder,
  TableCellType, TextAlign, TextFit, TableRow, TableRowType,
} from '@worm-vue3-print/core/designer'
import {
  applyBorderPreset, canMergeReason, cellFitCapMm, cellFitWidthMm, findMainCell, mergeCells,
  resolveBorderEdgeStates, resolveCellBorderDisplay, collectWritableCells, resolveCellGroupMode,
  resolveSharedCellType, resolveCellTextFit, setCellBorderEdge, setHeaderRepeat,
  BORDER_LINE_STYLES,
  DEFAULT_BORDER,
  setRowType, splitCells, propertyTip, IMAGE_FIT_OPTIONS, resolveDesignImageSrc, barcodeBarWidthRecommendText, createDefaultOptions,
  CELL_BORDER_APPLY_HINT, CELL_BORDER_APPLY_HINT_MULTI, CELL_BORDER_APPLY_HINT_MIXED,
} from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import type { El } from '../core/h'
import type { DesignerStore } from '../core/store'
import { colorTrigger, divider, fieldHelp, plainSelect, radioGroup, resetButton, stepper } from './controls'
import type { ShellCtx } from './controls'
import { renderFontSelect } from './font-select'
import { gateItem } from './property-search'
import { cropAnchorField } from './crop-anchor'
import { group, pdForm } from './prop-group'

/** Common 的 stepper 没有「清空」通道：未设置以 0 呈现，提交时 0 回落 undefined（= 继承表格/全局默认） */
const optNum = (v: number | undefined): number => Number(v ?? 0)
const orUndef = (v: number): number | undefined => (v ? v : undefined)

/** canvas 的开关行是 input.pd-switch 本体（.pd-switch 样式作用在 input 上），不走 label 壳 */
function switchRow(label: string, checked: boolean, onCommit: (v: boolean) => void, title?: string, reset?: El, disabled?: boolean): El {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label', ...(title ? { title } : {}) }, [h('span', { class: 'pd-label-t', text: label }), reset ?? ''].filter(Boolean)),
    h('input', {
      class: 'pd-switch', type: 'checkbox', checked,
      ...(disabled ? { disabled: true } : {}),
      onChange: (ev: Event) => onCommit((ev.target as HTMLInputElement).checked),
    }),
  ])
}

function selectRow(label: string, value: string, options: { value: string; label: string }[],
  onCommit: (v: string) => void, full = false, reset?: El): El {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: label }), reset ?? ''].filter(Boolean)),
    h('select', {
      class: 'pd-select', ...(full ? { style: { width: '100%' } } : {}),
      onChange: (ev: Event) => onCommit((ev.target as HTMLSelectElement).value),
    }, options.map(o => h('option', { value: o.value, text: o.label, selected: o.value === value }))),
  ])
}

/** 与 selectRow 同构，但用 plainSelect 显式赋 value：首项是「多选」占位时，
 *  部分内核只靠 <option selected> 会回落到第二项，把占位错显示成第一个真值。 */
function selectRowPlain(label: string, value: string, options: { value: string; label: string; disabled?: boolean }[],
  onCommit: (v: string) => void, opts: { full?: boolean; reset?: El } = {}): El {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: label }), opts.reset ?? ''].filter(Boolean)),
    plainSelect(value, options, onCommit, {
      className: 'pd-select',
      ...(opts.full ? { width: '100%' } : {}),
    }),
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

const TEXT_FIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'clip', label: '截断' },
  { value: 'shrink', label: '自动缩小' },
  { value: 'autoHeight', label: '自适应行高' },
]

/** 多选占位项：禁用且用哨兵值，避免和「不指定/默认」这类真实空值撞车 */
const MULTI_OPTION = { value: '__multi__', label: '多选', disabled: true }

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

  /** 表格级默认的出厂值就是新建表格时被写上的那组字面值：删键会让 matrixCellStyle 的判空跳过整条声明、
   *  落进 CSS 继承从而改变出纸，所以这三项必须写回字面值而非删键——与元素级同一条派生规则自动覆盖。 */
  const TABLE_FACTORY = createDefaultOptions('table') as Record<string, any>
  const tableReset = (key: string): El => resetButton({
    target: o as Record<string, any>, base: TABLE_FACTORY, propKey: key,
    write: () => commit({ [key]: TABLE_FACTORY[key] } as never),
  })

  return group(ctx, 'table-settings', '表格设置', 'Grid', [
    pdForm([
      selectRow('列表数据源字段', o.dataSource ?? '', listFields, (v) => commit({ dataSource: v || undefined }), true),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '默认字体' }), tableReset('tableDefaultFontFamily')]),
        renderFontSelect({
          id: 'table-default-font',
          state: ctx.state,
          fonts: ctx.host.fonts,
          value: o.tableDefaultFontFamily,
          placeholder: '默认',
          onChange: v => commit({ tableDefaultFontFamily: v || undefined }),
        }),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '默认字号 (pt)' }), tableReset('tableDefaultFontSize')]),
        stepper({
          value: optNum(o.tableDefaultFontSize), min: 0, max: 72, placeholder: '默认',
          onCommit: (v) => commit({ tableDefaultFontSize: orUndef(v) }),
        }),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '默认文字颜色' }), tableReset('tableDefaultColor')]),
        colorTrigger(o.tableDefaultColor, v => commit({ tableDefaultColor: v }), '默认文字颜色'),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '默认内边距 (mm)' }), tableReset('tableDefaultPadding')]),
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

/** 单元格台的本选区草稿（Common 每次重绘重建 DOM，只能按 store 存）：
 *  - border：三行待应用规格（单选初值取自选区，多选落缺省档）
 *  - values：多选批写过的值（控件显示它；不是任何一格的回显）
 *  - edges：多选点过的单边（不取选区三态）
 *  换选区即整份作废——连切回原选区也不复活，与画布 TableCellGroup 的 watch 归零同语义。 */
interface CellGroupDraft {
  key: string
  border: Partial<TableCellBorder>
  values: Partial<TableCell>
  edges: Partial<Record<'top' | 'right' | 'bottom' | 'left', boolean>>
}
const cellGroupDrafts = new WeakMap<DesignerStore, CellGroupDraft>()

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

  const writableCells = (): TableCell[] => collectWritableCells(rows, sel)
  /** 单/多选：可写格=1 才回显单格配置；跨行/跨列的合并格仍算单选 */
  const groupMode = resolveCellGroupMode(rows, sel)
  const cellCount = groupMode.count
  const isMulti = groupMode.mode === 'multi'
  const selectionKey = `${el.id}:${sel.r1}:${sel.c1}:${sel.r2}:${sel.c2}`
  const stored = cellGroupDrafts.get(s)
  const groupDraft: CellGroupDraft = stored?.key === selectionKey
    ? stored
    : { key: selectionKey, border: {}, values: {}, edges: {} }
  if (stored?.key !== selectionKey) cellGroupDrafts.set(s, groupDraft)
  /** 只更新草稿（不重绘）：调用方随后会 store.emit 的场合用 */
  const rememberDraft = (patch: Partial<CellGroupDraft>) => {
    cellGroupDrafts.set(s, {
      key: selectionKey,
      border: patch.border ?? groupDraft.border,
      values: patch.values ?? groupDraft.values,
      edges: patch.edges ?? groupDraft.edges,
    })
  }
  const setBorderPatch = <K extends keyof TableCellBorder>(key: K, value: TableCellBorder[K]) => {
    rememberDraft({ border: { ...groupDraft.border, [key]: value } })
    ctx.repaint()
  }
  const write = (fn: (c: TableCell) => void, patch?: Partial<TableCell>) => {
    writableCells().forEach(fn)
    if (isMulti && patch) rememberDraft({ values: { ...groupDraft.values, ...patch } })
    s.updateElement(el.id, { tableRows: rows })
  }
  /** 单键批写：多选下同时更新草稿，避免写完整组控件弹回「多选」 */
  const writeField = (key: keyof TableCell, value: unknown) => {
    write(c => { (c as Record<string, any>)[key] = value }, { [key]: value })
  }
  /** 显示取值：单选取该格真实值；多选只取本次批写草稿 */
  const val = <K extends keyof TableCell>(key: K): TableCell[K] | undefined =>
    isMulti ? (groupDraft.values as Partial<TableCell>)[key] : cell0[key]
  const hasDraft = (key: keyof TableCell): boolean => isMulti && key in groupDraft.values

  /** 三行的待应用规格：单选取自选区真实边框；多选不回显单格，只用缺省档 + 本次草稿 */
  const cellBorderDisplay = isMulti
    ? { width: undefined, style: undefined, color: undefined }
    : resolveCellBorderDisplay(rows, sel)
  /** 单选格四边是否至少有一条边：没有边时三行显示「无 / 0」，而不是缺省档 */
  const hasBorderEdges = !isMulti && writableCells()
    .some(c => !!c.borders && !!(c.borders.top || c.borders.right || c.borders.bottom || c.borders.left))
  const noBorder = !isMulti && !hasBorderEdges
  const draft: TableCellBorder = {
    width: noBorder ? 0 : (typeof cellBorderDisplay.width === 'number' ? cellBorderDisplay.width : DEFAULT_BORDER.width),
    style: (noBorder
      ? 'none'
      : (typeof cellBorderDisplay.style === 'string' && cellBorderDisplay.style !== 'mixed'
        ? cellBorderDisplay.style : DEFAULT_BORDER.style)) as TableCellBorder['style'],
    color: (typeof cellBorderDisplay.color === 'string' && cellBorderDisplay.color !== 'mixed'
      ? cellBorderDisplay.color : DEFAULT_BORDER.color),
    ...groupDraft.border,
  }
  /** 单格四边规格不一致（mixed）且用户尚未改该项：界面显示「混合」，批写仍按缺省档 */
  const BORDER_MIXED_VALUE = '__mixed__'
  const borderMixed = {
    style: !isMulti && cellBorderDisplay.style === 'mixed',
    width: !isMulti && cellBorderDisplay.width === 'mixed',
    color: !isMulti && cellBorderDisplay.color === 'mixed',
  }
  const styleMixed = borderMixed.style && !('style' in groupDraft.border)
  const widthMixed = borderMixed.width && !('width' in groupDraft.border)
  const colorMixed = borderMixed.color && !('color' in groupDraft.border)
  const mixedActiveAny = styleMixed || widthMixed || colorMixed
  const borderStyleDisplay = styleMixed ? BORDER_MIXED_VALUE : draft.style
  const borderWidthDisplay = widthMixed ? undefined : draft.width
  const borderColorDisplay = colorMixed ? undefined : draft.color
  /** 线型切换：无边框格选非无线型时补缺省宽度；选无且本来无框则宽度归零 */
  const setBorderStyle = (v: TableCellBorder['style']) => {
    const next: Partial<TableCellBorder> = { style: v }
    if (v !== 'none' && borderWidthDisplay === 0) next.width = DEFAULT_BORDER.width
    else if (v === 'none' && !hasBorderEdges) next.width = 0
    rememberDraft({ border: { ...groupDraft.border, ...next } })
    ctx.repaint()
  }
  const currentBorder = (): TableCellBorder => ({ ...draft })
  /** 单选：边位状态由选区真实边框派生；多选不回显，只认本次点过的边 */
  const edgeStates = isMulti
    ? BORDER_EDGES.reduce((acc, e) => {
      acc[e.value] = groupDraft.edges[e.value] ? 'on' : 'off'
      return acc
    }, {} as Record<'top' | 'right' | 'bottom' | 'left', 'on' | 'off' | 'mixed'>)
    : resolveBorderEdgeStates(writableCells().map(c => c.borders))

  const sharedType = isMulti
    ? ('cellType' in groupDraft.values ? (groupDraft.values.cellType ?? 'text') : resolveSharedCellType(rows, sel))
    : (cell0.cellType ?? 'text')
  const isBarcodeCell = sharedType === 'barcode'
  const isQrcodeCell = sharedType === 'qrcode'
  const isImageCell = sharedType === 'image'
  const isTextCell = sharedType === 'text'
  const dotAligned = isBarcodeCell && !!val('printerDpi')
  /** 条宽推荐段：只在填了分辨率时出现，只给参考不回写值（与画布单元格台共用 core 文案） */
  const barWidthRec = barcodeBarWidthRecommendText(val('printerDpi'), val('barWidth'))
  const cellTextFit = isMulti ? groupDraft.values.textFit : resolveCellTextFit(cell0)
  const cellTypeCurrent = isMulti
    ? ('cellType' in groupDraft.values ? (groupDraft.values.cellType ?? 'text') : '')
    : (cell0.cellType || 'text')
  const withMulti = <T extends { value: string }>(options: T[]): Array<T | typeof MULTI_OPTION> =>
    isMulti ? [MULTI_OPTION, ...options] : options
  const multiPlaceholder = (single: string): string => (isMulti ? '多选' : single)
  /** 数值：多选只认批写草稿（未写过留空），单选沿用原口径 */
  const numValue = (key: keyof TableCell, single: number | undefined): number | undefined =>
    isMulti ? ((groupDraft.values as Record<string, any>)[key] as number | undefined) : single
  const barcodeTypeValue = isMulti ? (val('barcodeType') ?? '__multi__') : (cell0.barcodeType || 'CODE128')
  const printerDpiValue = isMulti
    ? (hasDraft('printerDpi') ? (val('printerDpi') ? String(val('printerDpi')) : '') : '__multi__')
    : (cell0.printerDpi ? String(cell0.printerDpi) : '')
  const qrCodeLevelValue = isMulti ? (val('qrCodeLevel') ?? '__multi__') : (cell0.qrCodeLevel || 'M')
  const fitValue = isMulti ? (val('fit') ?? '__multi__') : (cell0.fit || 'contain')
  const textFitValue: string = cellTextFit ?? '__multi__'
  const mergeReason = canMergeReason(rows, sel)
  /** 按值合并仅对数据行模板格有意义：选区覆盖行全为 data 才可用（多选跨行类型不一致时禁用） */
  let mergeSameValueEnabled = true
  for (let r = sel.r1; r <= sel.r2; r++) {
    if (rows[r]?.type !== 'data') { mergeSameValueEnabled = false; break }
  }
  const mergeSameValueReason = mergeSameValueEnabled ? '' : '仅数据行（明细行）支持按值合并'
  let canSplit = false
  for (let r = sel.r1; r <= sel.r2 && !canSplit; r++) {
    for (let c = sel.c1; c <= sel.c2 && !canSplit; c++) {
      const cell = rows[r]?.cells[c]
      if (cell && !cell.merged && ((cell.rowspan ?? 1) > 1 || (cell.colspan ?? 1) > 1)) canSplit = true
    }
  }

  const numField = (label: string, value: number | undefined, key: keyof TableCell,
    opts: { min?: number; max?: number; step?: number; placeholder?: string } = {}, reset?: El): El => h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: label }), reset ?? ''].filter(Boolean)),
    stepper({ value, ...opts, onCommit: v => writeField(key, orUndef(v)) }),
  ])

  /** 单元格出厂态即「未设」：base 传空对象 ⇒ 落点恒为 undefined，删键后回落到该表自己的表级默认。
   *  写回必须走整选区 write（resetButton 给了 write 就不再直改 target）；提示整组不带数字——
   *  回落目标是作者可改的表级默认，写死数字就是假承诺。多选时按钮恒可点、不显示单格脏点。 */
  const CELL_TIP = '恢复默认值（跟随表格默认）'
  const cellReset = (key: string): El => resetButton({
    target: cell0 as Record<string, any>, base: {}, propKey: key, tipOverride: CELL_TIP, force: isMulti,
    // 走 writeField 而非 write：多选时要同时清掉批写草稿，否则控件会继续显示重置前的值
    write: () => writeField(key as keyof TableCell, undefined),
  })

  /** 单元格内容盒近似：列宽合计 × 行高合计（与 canvas 同口径，只用于判哪一轴能挪） */
  // 剪裁盒尺寸取「可用内容框」：与出纸钉盒同一口径（扣内边距与塌陷边框），报原始行列和会让可挪量虚高
  const cellPad = el.options.tableDefaultPadding ?? 1
  const cellBox = {
    width: cellFitWidthMm(el.options.tableColWidths ?? [], main.c, cell0, cellPad),
    height: cellFitCapMm(rows, main.r, cell0, cellPad),
  }

  return group(ctx, 'table-cell', '单元格', 'Menu', [
    pdForm([
      isMulti ? hint(`已选 ${cellCount} 格 · 批量设置：不显示单格配置，改动会应用到全部选中格`) : '',
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '单元格类型' }),
        radioGroup('cell-type', [
          { value: 'text', label: '文本' }, { value: 'barcode', label: '条形码' },
          { value: 'qrcode', label: '二维码' }, { value: 'image', label: '图片' },
        ], cellTypeCurrent, (v) => {
          const type = v === 'text' ? undefined : (v as TableCellType)
          const patch: Partial<TableCell> = { cellType: v as TableCellType }
          if (v !== 'barcode') Object.assign(patch, {
            barcodeType: undefined, showBarcodeText: undefined, printerDpi: undefined,
            barQuietZone: undefined, barHeight: undefined,
          })
          if (v !== 'qrcode') Object.assign(patch, { qrCodeLevel: undefined, qrQuietZone: undefined })
          write(c => {
            c.cellType = type
            if (v !== 'barcode') { c.barcodeType = undefined; c.showBarcodeText = undefined; c.printerDpi = undefined; c.barQuietZone = undefined; c.barHeight = undefined }
            if (v !== 'qrcode') { c.qrCodeLevel = undefined; c.qrQuietZone = undefined }
          }, patch)
        }),
      ]),

      isBarcodeCell ? selectRowPlain('码制', barcodeTypeValue, withMulti(BARCODE_TYPE_OPTIONS),
        v => { if (v !== '__multi__') writeField('barcodeType', v || undefined) }) : '',
      isBarcodeCell ? switchRow('显示文本', isMulti ? groupDraft.values.showBarcodeText === true : cell0.showBarcodeText !== false,
        v => writeField('showBarcodeText', v), undefined, cellReset('showBarcodeText')) : '',
      isBarcodeCell
        ? numField('条宽（倍率）', numValue('barWidth', cell0.barWidth ?? 2), 'barWidth',
          { min: 2, max: 8, step: 0.5, placeholder: multiPlaceholder('') }, cellReset('barWidth'))
        : '',
      isBarcodeCell ? hint((dotAligned
        ? '已设置打印机分辨率：条宽会被吸附到最近的整数打印点（DPI 优先于毫米值），单元格放不下时整体等比缩小'
        : '热敏/针式打印建议 3 及以上：决定条码的落纸尺寸，条越粗出纸后条宽越稳定') + (barWidthRec ? `。${barWidthRec}` : '')) : '',
      // 同二维码：走 stepper 而非 numField，0 档（不留白边）是合法值不能被归并成未设置
      isBarcodeCell ? fieldHelp('静区 (模块)', stepper({
        value: numValue('barQuietZone', cell0.barQuietZone), min: 0, max: 20, placeholder: multiPlaceholder('默认 10'),
        onCommit: v => writeField('barQuietZone', v),
      }), propertyTip('cd-bar-quiet-zone'), cellReset('barQuietZone')) : '',
      isBarcodeCell ? fieldHelp('条高 (mm)', stepper({
        value: numValue('barHeight', cell0.barHeight), min: 1, max: 100, placeholder: multiPlaceholder('默认 30 模块'),
        onCommit: v => writeField('barHeight', v ?? undefined),
      }), propertyTip('cd-bar-height'), cellReset('barHeight')) : '',
      isBarcodeCell
        ? numField('文本字号（相对条高，条高为 30）', numValue('barFontSize', cell0.barFontSize ?? 10), 'barFontSize',
          { min: 5, max: 24, placeholder: multiPlaceholder('默认 10') }, cellReset('barFontSize'))
        : '',
      isBarcodeCell ? selectRowPlain('打印机分辨率', printerDpiValue, withMulti([
        { value: '', label: '不指定（按条宽渲染）' }, { value: '203', label: '203 dpi（8 点/mm）' },
        { value: '300', label: '300 dpi（11.8 点/mm）' }, { value: '600', label: '600 dpi（23.6 点/mm）' },
      ]), (v) => {
        if (v === '__multi__') return
        const dpi = Number(v)
        writeField('printerDpi', dpi > 0 ? dpi : undefined)
      }, { reset: cellReset('printerDpi') }) : '',
      isBarcodeCell ? hint('填写后条宽吸附到整数打印点（消除出纸「条宽忽宽忽窄」）：条码先按条宽渲染，可用宽度够就原样落纸，不够才整体等比缩小') : '',
      isQrcodeCell ? selectRowPlain('纠错级别', qrCodeLevelValue, withMulti(QR_LEVEL_OPTIONS),
        v => { if (v !== '__multi__') writeField('qrCodeLevel', v || undefined) }, { reset: cellReset('qrCodeLevel') }) : '',
      // 与元素台同构造直接用 stepper：numField 经 orUndef 会把显式填的 0 归并成未设置（出图虽一致，存的值应与用户填的一致），且它也不带说明图标
      isQrcodeCell ? fieldHelp('静区 (模块)', stepper({
        value: numValue('qrQuietZone', cell0.qrQuietZone), min: 0, max: 8, placeholder: multiPlaceholder('默认 0'),
        onCommit: v => writeField('qrQuietZone', v),
      }), propertyTip('cd-quiet-zone'), cellReset('qrQuietZone')) : '',

      isBarcodeCell ? hint('单元格条码尺寸由「条宽」与「打印机分辨率」结算：可用宽度足够时按条宽原样落纸，不足时整体等比缩小；拉伸会把条宽变成非整数，故条形码不提供缩放模式，可用「最大宽高」限制上限。要放大条码：先加条宽倍率，再收窄静区（左右白边会换成条宽），必要时关掉显示文本以让出文本区高度') : '',
      (isQrcodeCell || isImageCell) ? selectRowPlain('缩放模式', fitValue, withMulti(IMAGE_FIT_OPTIONS),
        v => { if (v !== '__multi__') writeField('fit', v as TableCell['fit']) }, { reset: cellReset('fit') }) : '',
      isImageCell && !isMulti && cell0.fit === 'cover' ? cropAnchorField(ctx, {
        fieldKey: 'ap-img-object-position', label: '裁剪锚点', src: resolveDesignImageSrc(cell0.formatter), fit: cell0.fit,
        containerClass: 'pd-cell-anchor',
        widthMm: cellBox.width, heightMm: cellBox.height,
        scale: cell0.fitScale,
        value: cell0.objectPosition, onCommit: v => writeField('objectPosition', v),
        onScaleCommit: v => writeField('fitScale', v),
        resetAnchor: cellReset('objectPosition'),
        resetScale: cellReset('fitScale'),
      }) : '',
      (isBarcodeCell || isQrcodeCell || isImageCell)
        ? numField('最大宽度 (mm)', numValue('maxWidth', optNum(cell0.maxWidth)), 'maxWidth',
          { min: 0, max: 200, placeholder: multiPlaceholder('默认') }, cellReset('maxWidth'))
        : '',
      (isBarcodeCell || isQrcodeCell || isImageCell)
        ? numField('最大高度 (mm)', numValue('maxHeight', optNum(cell0.maxHeight)), 'maxHeight',
          { min: 0, max: 200, placeholder: multiPlaceholder('默认') }, cellReset('maxHeight'))
        : '',

      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label', text: '内容' }),
        h('input', {
          class: 'pd-input', type: 'text', value: isMulti ? (val('formatter') ?? '') : (cell0.formatter || ''),
          placeholder: isMulti ? '多选（输入后覆盖全部选中格）' : '输入内容，支持 {字段} 表达式',
          onChange: (ev: Event) => writeField('formatter', (ev.target as HTMLInputElement).value || undefined),
          // 表达式编辑器入口在壳层（对照 canvas 的 onDblClickCell → table-cell-dblclick）
          onDblclick: () => ctx.fire('table-cell-dblclick', { elementId: el.id, r: main.r, c: main.c, cellId: cell0.id }),
        }),
      ]),

      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '水平对齐' }), cellReset('align')]),
        radioGroup('cell-align', [
          { value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }, { value: 'justify', label: '两端' },
        ], isMulti ? (groupDraft.values.align ?? '') : (cell0.align || 'left'),
        v => writeField('align', v as TextAlign)),
      ]),
      h('div', { class: 'pd-field' }, [
        h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '垂直对齐' }), cellReset('valign')]),
        radioGroup('cell-valign', [
          { value: 'top', label: '上' }, { value: 'middle', label: '中' }, { value: 'bottom', label: '下' },
        ], isMulti ? (groupDraft.values.valign ?? '') : (cell0.valign || 'top'),
        v => writeField('valign', v as TableCell['valign'])),
      ]),
      h('div', { class: 'cell-style-grid' }, [
        h('div', { class: 'pd-field cell-font-field' }, [
          h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '字体' }), cellReset('fontFamily')]),
          renderFontSelect({
            id: 'cell-font',
            state: ctx.state,
            fonts: ctx.host.fonts,
            value: isMulti ? val('fontFamily') : cell0.fontFamily,
            placeholder: multiPlaceholder('继承默认'),
            onChange: v => writeField('fontFamily', v),
          }),
        ]),
        numField('字号 (pt)', numValue('fontSize', optNum(cell0.fontSize)), 'fontSize',
          { min: 0, max: 72, placeholder: multiPlaceholder('默认') }, cellReset('fontSize')),
        h('div', { class: 'pd-field' }, [
          h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '加粗' }), cellReset('fontWeight')]),
          h('input', {
            class: 'pd-switch', type: 'checkbox',
            checked: isMulti ? groupDraft.values.fontWeight === 'bold' : cell0.fontWeight === 'bold',
            onChange: (ev: Event) => writeField(
              'fontWeight', (ev.target as HTMLInputElement).checked ? 'bold' : undefined,
            ),
          }),
        ]),
        h('div', { class: 'pd-field' }, [
          h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '文字颜色' }), cellReset('color')]),
          colorTrigger(isMulti ? val('color') : cell0.color, v => writeField('color', v), '文字颜色'),
        ]),
        h('div', { class: 'pd-field' }, [
          h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: '背景色' }), cellReset('backgroundColor')]),
          colorTrigger(isMulti ? val('backgroundColor') : cell0.backgroundColor, v => writeField('backgroundColor', v), '背景颜色'),
        ]),
      ]),

      divider('边框'),
      h('div', { class: 'border-style-row' }, [
        // 裸下拉必须显式赋值当前值（只靠 <option selected> 在内核不一致时会回落到第二项）
        plainSelect(borderStyleDisplay, [
          ...(styleMixed ? [{ value: BORDER_MIXED_VALUE, label: '混合', disabled: true }] : []),
          ...BORDER_LINE_STYLES,
        ], v => { if (v !== BORDER_MIXED_VALUE) setBorderStyle(v as TableCellBorder['style']) },
        { width: '90px' }),
        h('div', { style: { width: '112px', flexShrink: '0' } }, [stepper({
          value: borderWidthDisplay, min: 0.25, max: 5, step: 0.25,
          placeholder: isMulti ? '多选' : (widthMixed ? '混合' : undefined),
          onCommit: v => setBorderPatch('width', v),
        })]),
        colorTrigger(borderColorDisplay, v => setBorderPatch('color', v), '边框颜色'),
      ]),
      h('div', { class: 'pd-button-group border-presets' }, ([
        ['all', '全部'], ['outer', '外侧'], ['inner', '内部'], ['none', '无'],
      ] as [BorderPreset, string][]).map(([p, label]) => h('button', {
        type: 'button', class: 'pd-button small', text: label,
        // 线型＝无 ⇒ 预设就是清边框（不写一条隐形的 none 边）
        onClick: () => {
          applyBorderPreset(rows, sel, draft.style === 'none' ? 'none' : p, currentBorder())
          s.updateElement(el.id, { tableRows: rows })
        },
      }))),
      h('div', { class: 'pd-checkbox-group' }, BORDER_EDGES.map(edge => h('label', { class: 'pd-checkbox' }, [
        h('input', {
          type: 'checkbox', value: edge.value,
          checked: edgeStates[edge.value] === 'on',
          indeterminate: edgeStates[edge.value] === 'mixed',
          onChange: (ev: Event) => {
            // 单边只切那一条：半选态点下去是补齐（与工具栏单边按钮一致），不能整组覆盖掉其余三边
            const on = (ev.target as HTMLInputElement).checked
            // 线型＝无时勾边不会出线：一律按"没有这条边"处理
            const visible = on && draft.style !== 'none'
            if (isMulti) rememberDraft({ edges: { ...groupDraft.edges, [edge.value]: visible } })
            write(c => { setCellBorderEdge(c, edge.value, visible ? currentBorder() : null) })
          },
        }),
        h('span', { text: edge.label }),
      ]))),
      hint(isMulti
        ? CELL_BORDER_APPLY_HINT_MULTI
        : (mixedActiveAny ? CELL_BORDER_APPLY_HINT_MIXED : CELL_BORDER_APPLY_HINT)),

      numField('内边距 (mm)', numValue('padding', optNum(cell0.padding)), 'padding',
        { min: 0, max: 10, step: 0.5, placeholder: multiPlaceholder('默认') }, cellReset('padding')),
      switchRow('自动换行', isMulti ? groupDraft.values.wordWrap === true : (cell0.wordWrap ?? true),
        v => writeField('wordWrap', v), undefined, cellReset('wordWrap')),
      switchRow('按值合并', isMulti ? groupDraft.values.mergeSameValue === true : cell0.mergeSameValue === true,
        v => writeField('mergeSameValue', v), mergeSameValueReason || undefined,
        mergeSameValueEnabled ? cellReset('mergeSameValue') : undefined, !mergeSameValueEnabled),
      isTextCell ? selectRowPlain('文字溢出', textFitValue, withMulti(TEXT_FIT_OPTIONS),
        v => { if (v !== '__multi__') writeField('textFit', v as TextFit) }, { full: true, reset: cellReset('textFit') }) : '',
      (isTextCell && cellTextFit === 'shrink')
        ? numField('最小字号 (pt)', numValue('shrinkMinFontSize', optNum(cell0.shrinkMinFontSize)), 'shrinkMinFontSize',
          { min: 0, max: 72, step: 0.5, placeholder: multiPlaceholder('默认 6') }, cellReset('shrinkMinFontSize'))
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
