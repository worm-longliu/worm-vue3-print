// print-core/src/render/data-binder.ts
// 模板表达式求值 + 表格数据绑定

import type { TemplateData, TemplateElement, RenderRow, RenderCell } from './types.js'
import { evaluateTemplate } from './expression-eval.js'
import {
  detectFlowListKey,
  flowContentWidthMm,
  layoutFlowList,
  resolveFlowColumns,
  resolveFlowGapX,
  resolveFlowMaxSpan,
  resolveFlowPadding,
  resolveFlowLayoutMode,
} from './flow-list.js'

/**
 * 将模板中元素的 formatter 表达式求值为实际值。
 * 返回新的模板对象（深拷贝），不修改原始模板。
 *
 * @param baseUrl 相对路径**图片**基址（如 `/n/...`）
 * @param fontBaseUrl 相对路径**字体**基址；缺省回落到 `baseUrl`（图片与字体同域时无需单独配置），
 *   显式传空串表示不拼接——相对字体 URL 交由文档自身 origin 解析（浏览器端语义）。
 *   字体与图片不在同一域（图片走业务 OSS、字体走前端站点/CDN）时必须显式指定。
 */
export function bindData(
  template: TemplateData,
  printData?: Record<string, any>,
  baseUrl?: string,
  fontBaseUrl?: string,
): TemplateData {
  // 数组在 pipeline 入口（normalizePrintData）已拆分为逐份单对象，不会到达这里
  // 系统变量并入表达式上下文：{printDate} / {DATE(printDate,'YYYY')} 等写法才能在绑定阶段求值。
  // 业务数据优先（同名时覆盖系统变量）；页码此时尚未分页，含页码的表达式另行延迟到最终趟按页求值。
  const data = { ...resolveSystemVariables(), ...(printData ?? {}) }
  // JSON 深拷贝：模板为可持久化的纯 JSON 结构；同时兼容浏览器侧 Vue reactive Proxy
  // （structuredClone 对 Proxy 抛 DataCloneError）。
  const bound = JSON.parse(JSON.stringify(template)) as TemplateData

  if (bound.header?.elements) {
    bound.header.elements = bound.header.elements.map(el => bindElement(el, data, baseUrl))
  }
  if (bound.footer?.elements) {
    bound.footer.elements = bound.footer.elements.map(el => bindElement(el, data, baseUrl))
  }
  bound.elements = bound.elements.map(el => bindElement(el, data, baseUrl))

  // 模板声明的字体：相对 URL 按字体基址解析（缺省回落图片基址），
  // 字体与图片的托管位置天然可能不同，不能硬绑在同一个 baseUrl 上
  const fontBase = fontBaseUrl ?? baseUrl
  if (fontBase && bound.fonts?.length) {
    const prefix = fontBase.replace(/\/+$/, '')
    bound.fonts = bound.fonts.map(font => ({
      ...font,
      files: (font.files ?? []).map(file => ({
        ...file,
        // 绝对 URL（含协议相对 //）原样使用
        url: file.url?.startsWith('/') && !file.url.startsWith('//') ? prefix + file.url : file.url,
      })),
    }))
  }

  return bound
}

function bindElement(
  el: TemplateElement,
  data: Record<string, any>,
  baseUrl?: string,
): TemplateElement {
  const cloned = { ...el, options: { ...el.options } }
  // 流式列表的 formatter 是「每行一项」的模板，不能按整份数据求值：
  // 表达式里的列表路径（{drugs.name}）对整份数据求值会得到空串，模板就被抹平了
  const isFlowList = cloned.type === 'flowList' || cloned.printElementType?.type === 'flowList'
  // 对元素 formatter 求值
  if (!isFlowList && typeof cloned.options.formatter === 'string') {
    const raw = cloned.options.formatter
    if (referencesPageNumbers(raw)) {
      // 引用了页码的表达式（{pageIndex}、{ADD(pageIndex,1)}）：pageIndex/totalPages 要等分页后才有值，
      // 此处保留原始表达式——测量趟按最宽文本测量，最终趟由 html-generator 按该页页码重新求值。
      cloned.options.rawFormatter = raw
    } else {
      cloned.options.formatter = evaluateTemplate(raw, data)
    }
  }
  // 图片元素 src：{字段} 表达式求值（动态传参），相对路径拼接服务端 base URL
  const isImage = cloned.type === 'image' || cloned.printElementType?.type === 'image'
  if (isImage && typeof cloned.options.src === 'string') {
    let src = cloned.options.src
    if (src.includes('{')) {
      src = evaluateTemplate(src, data)
    }
    if (src && baseUrl && src.startsWith('/')) {
      src = baseUrl.replace(/\/+$/, '') + src
    }
    cloned.options.src = src
  }
  // 表格数据绑定
  if (cloned.type === 'table' || cloned.printElementType?.type === 'table') {
    bindTableData(cloned, data)
  }
  // 流式列表数据绑定：单元模板对数组逐项求值
  if (cloned.type === 'flowList' || cloned.printElementType?.type === 'flowList') {
    bindFlowListData(cloned, data)
  }
  return cloned
}

/**
 * 流式列表：与表格共用「列表源解析」（dataSource → fields → 顶层第一个数组兜底），
 * 单元模板（options.formatter）对每个数据项求值一次；固定模式只保留单元文本，
 * 动态模式同时保留排布行，供逐行测量与后续分页使用。
 */
function bindFlowListData(el: TemplateElement, data: Record<string, any>): void {
  const template = typeof el.options.formatter === 'string' ? el.options.formatter : ''
  // 列表源从表达式里检出（如 {drugs.name}），没有显式声明就不要求作者再填一遍
  const source = { ...el.options, dataSource: el.options.dataSource ?? detectFlowListKey(template, data) }
  const { list, key } = resolveListSource(source, data)
  const itemCtx = (item: Record<string, any>): Record<string, any> =>
    key ? { ...data, ...item, [key]: item } : { ...data, ...item }
  // 设计器里没绑定表达式时按测试数据兜底，保证画布与预览都有可见内容
  const items = list.map(item => {
    if (!template) return String(item ?? '')
    return referencesPageNumbers(template)
      ? template
      : evaluateTemplate(template, itemCtx(item))
  })
  el.options._flowItems = items
  el.options._flowRawFormatter = referencesPageNumbers(template) ? template : undefined
  // 动态模式在数据绑定后保留内部排布行结构（宽度按扣除左右内边距后的内容宽计算）；
  // 固定模式不写，避免为兼容模式增加多余字段。
  if (resolveFlowLayoutMode(el.options.flowLayoutMode) === 'dynamic') {
    const contentWidth = flowContentWidthMm(el.options.width ?? 0, resolveFlowPadding(el.options))
    const layoutItems = items.length > 0
      ? items
      : String(el.options.testData ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    el.options._flowRows = layoutFlowList(layoutItems, {
      width: contentWidth,
      columns: resolveFlowColumns(el.options.flowColumns),
      gapX: resolveFlowGapX(el.options.flowGapX),
      fontSizePt: el.options.fontSize ?? 12,
      autoSpan: el.options.flowAutoSpan === true,
      maxSpan: resolveFlowMaxSpan(el.options.flowMaxSpan, el.options.flowColumns),
    })
  }
}

function resolveListSource(opts: any, data: Record<string, any>): { list: Record<string, any>[]; key: string | undefined } {
  // 优先显式 dataSource（属性面板配置）→ fields 配置 → printData 顶层第一个数组
  const explicitKey: string | undefined = opts.dataSource ?? opts.fields?.[0]?.dataSource ?? opts.fields?.[0]?.field
  if (explicitKey && Array.isArray(data[explicitKey])) {
    return { list: data[explicitKey], key: explicitKey }
  }
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) return { list: v as Record<string, any>[], key: k }
  }
  return { list: [], key: explicitKey }
}

function bindTableData(el: TemplateElement, data: Record<string, any>): void {
  const opts = el.options
  const rows: any[] | undefined = opts.tableRows
  if (!Array.isArray(rows) || rows.length === 0) return

  const mode: string = opts.tableMode ?? 'dynamic'
  const { list, key } = mode === 'dynamic' ? resolveListSource(opts, data) : { list: [], key: undefined }

  // 行上下文：同时暴露列表前缀（{goods.name}）与行内字段（{name}）
  const itemCtx = (item: Record<string, any>): Record<string, any> =>
    key ? { ...data, ...item, [key]: item } : { ...data, ...item }
  // 聚合行上下文：rows 每行同样带前缀映射，使 SUM(goods.amount) 可聚合
  const summaryRows = key ? list.map(item => ({ ...item, [key]: item })) : list

  const renderRows: RenderRow[] = []
  const dataRowCtx: Record<string, any>[] = []
  const subtotalTemplates: RenderRow[] = []
  const summaryRenderRows: RenderRow[] = []
  // bodyRows 中 data 展开行的起始索引（= header 行数），分页按页切片后据此截取当页数据行上下文
  let dataStartIdx = -1

  for (const row of rows) {
    if (mode === 'dynamic' && row.type === 'data') {
      // 归一化：dynamic 数据行按列表逐项复制，模板上的静态纵向 span 会随每行复制导致错位，一律重置。
      // 只清「被上方行跨行覆盖」的占位格；横向合并（colspan 主格 + 同行占位格）必须保留，
      // 否则占位格会渲染成空 td，整行多出一列。
      resetDataRowSpan(row.cells)
      for (const item of list) {
        if (dataStartIdx < 0) dataStartIdx = renderRows.length
        const ctx = itemCtx(item)
        renderRows.push(makeRenderRow(row, cell => resolveCellText(cell, ctx)))
        dataRowCtx.push(ctx)
      }
      continue
    }
    if (mode === 'dynamic' && row.type === 'subtotal') {
      // 小计行：不按普通行展开。占位行以整表聚合求值（保证测量高度准确），
      // 同时保留 rawFormatter，渲染阶段按「当前页数据行」重新求值。
      const tpl = makeRenderRow(row, cell => resolveCellText(cell, { rows: summaryRows, ...data }), true)
      subtotalTemplates.push(tpl)
      renderRows.push(tpl)
      continue
    }
    if (mode === 'dynamic' && row.type === 'summary') {
      const summaryRow = makeRenderRow(row, cell => resolveCellText(cell, { rows: summaryRows, ...data }))
      summaryRenderRows.push(summaryRow)
      renderRows.push(summaryRow)
      continue
    }
    renderRows.push(makeRenderRow(row, cell => resolveCellText(cell, data)))
  }

  opts._renderRows = renderRows
  opts._repeatHeaderCount = countRepeatHeader(rows)
  // 小计行分页求值所需的每页上下文与模板
  opts._dataRowCtx = dataRowCtx
  opts._dataStartIdx = dataStartIdx < 0 ? renderRows.length : dataStartIdx
  opts._subtotalTemplates = subtotalTemplates
  opts._summaryRows = summaryRenderRows
  opts._mainData = data
}

/**
 * 数据行模板格的跨度归一：纵向行跨度随列表复制只会让后续副本错位，一律清零；
 * 同时只把「被上方行跨行覆盖」的占位格恢复成实格。
 * 横向合并（左侧主格 colspan 覆盖到的同行格子）必须保持 merged=true——渲染趟据此跳过，
 * 一旦清掉就会多输出一个空 td，整张表错列（数据行内单行横向合并是合法操作）。
 */
function resetDataRowSpan(cells: any[]): void {
  // 同行横向覆盖的列索引：colspan 主格右侧 (colspan-1) 格（矩阵模型下 cells 下标即列号）
  const horizontal = new Set<number>()
  cells.forEach((cell: any, idx: number) => {
    if (!cell || cell.merged) return
    const span = Math.max(cell.colspan ?? 1, 1)
    for (let i = 1; i < span; i++) horizontal.add(idx + i)
  })
  cells.forEach((cell: any, idx: number) => {
    if (cell.rowspan) cell.rowspan = 1
    if (cell.merged && !horizontal.has(idx)) cell.merged = false
  })
}

/** 单元格文本求值：引用了页码的表达式保留原文，由最终趟按页重算（元素 formatter 同理） */
function resolveCellText(cell: any, ctx: Record<string, any>): string {
  const formatter = cell.formatter
  if (!formatter) return ''
  if (referencesPageNumbers(formatter)) return formatter
  return evaluateTemplate(formatter, ctx)
}

function makeRenderRow(
  row: any,
  resolve: (cell: any) => string,
  keepRaw = false,
): RenderRow {
  return {
    type: row.type,
    height: row.height ?? 8,
    cells: row.cells.map((cell: any): RenderCell => ({
      content: cell.merged ? '' : resolve(cell),
      // 小计行（keepRaw）与引用页码的单元格都保留原始表达式：前者按当页数据行重算，后者按当页页码重算
      ...((keepRaw || referencesPageNumbers(cell.formatter)) && !cell.merged
        ? { rawFormatter: cell.formatter ?? '' }
        : {}),
      cellType: cell.cellType,
      barcodeType: cell.barcodeType,
      qrCodeLevel: cell.qrCodeLevel,
      qrQuietZone: cell.qrQuietZone,
      barQuietZone: cell.barQuietZone,
      // 条高同样必须进白名单：漏一个，属性台填的 mm 就只在设计器生效、出纸静默按缺省 30 模块
      barHeight: cell.barHeight,
      // 条宽与条码文本字号也必须在白名单里：漏一个，属性台填的倍率就只在设计器生效、出纸静默按缺省
      barWidth: cell.barWidth,
      barFontSize: cell.barFontSize,
      showBarcodeText: cell.showBarcodeText,
      printerDpi: cell.printerDpi,
      fit: cell.fit,
      objectPosition: cell.objectPosition,
      fitScale: cell.fitScale,
      maxWidth: cell.maxWidth,
      maxHeight: cell.maxHeight,
      rowspan: cell.rowspan ?? 1,
      colspan: cell.colspan ?? 1,
      merged: cell.merged === true,
      // 「按值合并」声明必须带到渲染行：归并在渲染区间（每片）计算，渲染端据此决定列是否参与
      ...(cell.mergeSameValue === true ? { mergeSameValue: true } : {}),
      align: cell.align,
      valign: cell.valign,
      fontSize: cell.fontSize,
      fontFamily: cell.fontFamily,
      fontWeight: cell.fontWeight,
      color: cell.color,
      backgroundColor: cell.backgroundColor,
      borders: cell.borders,
      padding: cell.padding,
      wordWrap: cell.wordWrap,
      textFit: cell.textFit,
      shrinkMinFontSize: cell.shrinkMinFontSize,
    })),
  }
}

/**
 * 解析分页续片需要重复的表头行数。
 *
 * 重复粒度是「表头区」而不是「单行」：多级表头的各行由 rowspan/colspan 连成一个结构整体，
 * 逐行独立判定会把表头切在半截上——首行存在 rowspan=3 的跨行主格却只重复 1 行时，
 * 续片会丢掉下面两级表头。因此：
 * 1. 表头区 = 从第 0 行起的连续 header 行；
 * 2. 区内任一行 repeatOnPage 为真 → 整个表头区参与重复；
 * 3. 重复行数按 rowspan 完整性向下对齐，保证 [0, n) 内不存在跨出 n 的主格。
 */
function countRepeatHeader(rows: any[]): number {
  const headerCount = countLeadingHeaderRows(rows)
  if (headerCount === 0) return 0
  const enabled = rows.slice(0, headerCount).some((row: any) => row.repeatOnPage === true)
  if (!enabled) return 0
  return alignToRowspanBoundary(rows, headerCount)
}

/** 表头区行数：从第 0 行起的连续 header 行数量 */
function countLeadingHeaderRows(rows: any[]): number {
  let n = 0
  for (const row of rows) {
    if (row?.type !== 'header') break
    n++
  }
  return n
}

/** [0, n) 内的主格是否都没有跨出 n（表头区闭合时 n = max 即完整） */
function isRowspanComplete(rows: any[], n: number): boolean {
  for (let r = 0; r < n; r++) {
    for (const cell of rows[r]?.cells ?? []) {
      if (cell?.merged) continue
      if (r + (cell?.rowspan ?? 1) > n) return false
    }
  }
  return true
}

/**
 * 把重复行数对齐到最近的 rowspan 完整边界（≤ max 向下找）。
 * 历史模板可能存在表头主格 rowspan 跨到数据行的脏数据，此时收缩到能完整闭合的行数，
 * 残余的超界 rowspan 由 html-generator 在续片渲染时裁剪兜底。
 */
function alignToRowspanBoundary(rows: any[], max: number): number {
  for (let n = max; n >= 1; n--) {
    if (isRowspanComplete(rows, n)) return n
  }
  return 1
}

/** 系统变量上下文（表达式 ctx 与 HTML 占位符替换共用，保证取值一致） */
export interface SystemVariableContext {
  /** 打印日期 YYYY-MM-DD */
  printDate: string
  /** 打印时间 HH:mm:ss */
  printTime: string
  pageIndex: number
  totalPages: number
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 生成系统变量取值；水印表达式求值与最终 HTML 占位符替换共用同一实现，
 * 避免「设计器预览看到的打印时间」与「实际打印出来的」不一致。
 */
export function resolveSystemVariables(
  now: Date = new Date(),
  page: { pageIndex?: number; totalPages?: number } = {},
): SystemVariableContext {
  return {
    printDate: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    printTime: `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`,
    pageIndex: page.pageIndex ?? 1,
    totalPages: page.totalPages ?? 1,
  }
}

/**
 * 表达式是否引用了页码变量（pageIndex / totalPages）。
 * 引用了就必须延迟到最终渲染趟按页求值——绑定阶段页码尚未确定。
 */
export function referencesPageNumbers(expr: unknown): boolean {
  return typeof expr === 'string' && /\b(pageIndex|totalPages)\b/.test(expr)
}

export function injectSystemVariables(html: string, now: Date = new Date()): string {
  const { printDate, printTime } = resolveSystemVariables(now)
  return html
    .replace(/\{printDate\}/g, printDate)
    .replace(/\{printTime\}/g, printTime)
}
