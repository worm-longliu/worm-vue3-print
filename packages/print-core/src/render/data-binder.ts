// print-core/src/render/data-binder.ts
// 模板表达式求值 + 表格数据绑定

import type { TemplateData, TemplateElement, RenderRow, RenderCell } from './types.js'
import { evaluateTemplate } from './expression-eval.js'

/**
 * 将模板中元素的 formatter 表达式求值为实际值。
 * 返回新的模板对象（深拷贝），不修改原始模板。
 */
export function bindData(
  template: TemplateData,
  printData?: Record<string, any> | Record<string, any>[],
  baseUrl?: string,
): TemplateData {
  const raw = printData ?? {}
  const data = Array.isArray(raw) ? (raw[0] ?? {}) : raw
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
    cloned.options.formatter = evaluateTemplate(cloned.options.formatter, data)
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
          const formatter = cell.formatter
          if (!formatter) return ''
          return evaluateTemplate(formatter, ctx)
        }))
        dataRowCtx.push(ctx)
      }
      continue
    }
    if (mode === 'dynamic' && row.type === 'subtotal') {
      // 小计行：不按普通行展开。占位行以整表聚合求值（保证测量高度准确），
      // 同时保留 rawFormatter，渲染阶段按「当前页数据行」重新求值。
      const tpl = makeRenderRow(row, cell => {
        const formatter = cell.formatter
        if (!formatter) return ''
        return evaluateTemplate(formatter, { rows: summaryRows, ...data })
      }, true)
      subtotalTemplates.push(tpl)
      renderRows.push(tpl)
      continue
    }
    if (mode === 'dynamic' && row.type === 'summary') {
      const summaryRow = makeRenderRow(row, cell => {
        const formatter = cell.formatter
        if (!formatter) return ''
        return evaluateTemplate(formatter, { rows: summaryRows, ...data })
      })
      summaryRenderRows.push(summaryRow)
      renderRows.push(summaryRow)
      continue
    }
    renderRows.push(makeRenderRow(row, cell => {
      const formatter = cell.formatter
      if (!formatter) return ''
      return evaluateTemplate(formatter, data)
    }))
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
      ...(keepRaw ? { rawFormatter: cell.merged ? '' : (cell.formatter ?? '') } : {}),
      cellType: cell.cellType,
      barcodeType: cell.barcodeType,
      qrCodeLevel: cell.qrCodeLevel,
      showBarcodeText: cell.showBarcodeText,
      fit: cell.fit,
      maxWidth: cell.maxWidth,
      maxHeight: cell.maxHeight,
      rowspan: cell.rowspan ?? 1,
      colspan: cell.colspan ?? 1,
      merged: cell.merged === true,
      align: cell.align,
      valign: cell.valign,
      fontSize: cell.fontSize,
      fontWeight: cell.fontWeight,
      color: cell.color,
      backgroundColor: cell.backgroundColor,
      borders: cell.borders,
      padding: cell.padding,
      wordWrap: cell.wordWrap,
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

export function injectSystemVariables(html: string): string {
  const now = new Date()
  const printDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return html.replace(/\{printDate\}/g, printDate)
}
