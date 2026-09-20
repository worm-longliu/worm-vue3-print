// print-core/src/render/data-binder.ts
// 模板表达式求值 + 表格数据绑定

import type { TemplateData, TemplateElement, RenderRow, RenderCell } from './types.js'
import { evaluateTemplate } from './expression-eval.js'

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
  if (bound.firstPageOverlay?.elements) {
    bound.firstPageOverlay.elements = bound.firstPageOverlay.elements.map(el => bindElement(el, data, baseUrl))
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
  // 对元素 formatter 求值
  if (typeof cloned.options.formatter === 'string') {
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
  return cloned
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
      for (const item of list) {
        if (dataStartIdx < 0) dataStartIdx = renderRows.length
        const ctx = itemCtx(item)
        renderRows.push(makeRenderRow(row, cell => {
          return resolveCellText(cell, ctx)
        }))
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
      showBarcodeText: cell.showBarcodeText,
      printerDpi: cell.printerDpi,
      fit: cell.fit,
      maxWidth: cell.maxWidth,
      maxHeight: cell.maxHeight,
      rowspan: cell.rowspan ?? 1,
      colspan: cell.colspan ?? 1,
      merged: cell.merged === true,
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

function countRepeatHeader(rows: any[]): number {
  let n = 0
  for (const row of rows) {
    if (row.type === 'header' && row.repeatOnPage === true) { n++ } else { break }
  }
  return n
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
