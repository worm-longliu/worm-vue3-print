// print-core/src/render/html-generator.ts
// 将 PageLayout[] 转为完整 HTML 字符串（同构：Node 与浏览器共用，条码经 CodeRenderer 注入）

import type {
  TemplateData,
  TemplateElement,
  PageLayout,
  PageSection,
  RenderRow,
  RenderCell,
  CodeRenderer,
} from './types.js'
import { getPaperDimensions } from './types.js'
import { buildPageCss, elementPositionStyle, mm } from './css-builder.js'
import { injectSystemVariables } from './data-binder.js'
import { evaluateTemplate } from './expression-eval.js'
import { tableDesignBottom } from './pagination-engine.js'

/** 渲染上下文：贯穿两遍渲染的可选依赖 */
interface RenderCtx {
  codeRenderer?: CodeRenderer
}

export interface GenerateOptions {
  /** 第一遍测量模式：所有元素在一个连续区域，不分页 */
  isMeasurementPass?: boolean
  /** 条码/二维码 SVG 渲染器；缺省或渲染抛错时降级为文本占位 */
  codeRenderer?: CodeRenderer
}

/**
 * 生成完整 HTML 字符串。
 *
 * - 第一遍（isMeasurementPass=true）：单页连续区域，每个元素带 data-measure-id
 * - 第二遍：按分页结果生成多页 HTML，填充 {pageIndex}/{totalPages}
 */
export function generateHtml(
  template: TemplateData,
  pageLayouts: PageLayout[],
  printData?: Record<string, any>,
  options?: GenerateOptions,
): string {
  const css = buildPageCss(template)
  const isMeasure = options?.isMeasurementPass === true
  const totalPages = isMeasure ? 1 : pageLayouts.length
  const ctx: RenderCtx = { codeRenderer: options?.codeRenderer }

  if (isMeasure) {
    return generateMeasurementHtml(template, css, ctx)
  }
  return generateFinalHtml(template, pageLayouts, css, totalPages, ctx)
}

// ─── 第一遍：测量模式 ───

function generateMeasurementHtml(
  template: TemplateData,
  css: string,
  ctx: RenderCtx,
): string {
  const paper = getPaperDims(template)
  const contentWidth = paper.width - template.margins.left - template.margins.right

  // 所有元素按原始坐标渲染在一个连续区域
  const elementsHtml = template.elements
    .map(el => renderElement(el, true, undefined, undefined, ctx))
    .join('\n')

  // 页眉：分页变量使用占位符 "0"，避免原始文本影响测量精度
  const headerHtml = renderAreaElements(
    template.header?.elements ?? [],
    contentWidth,
    0, // pageIndex placeholder
    0, // totalPages placeholder
    ctx,
  )
  const overlayHtml = renderAreaElements(template.firstPageOverlay?.elements ?? [], contentWidth, undefined, undefined, ctx)

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body class="measure-mode">
<section class="print-page" data-measure-page="0">
  <div class="page-header">${headerHtml}</div>
  <div class="first-page-overlay">${overlayHtml}</div>
  <div class="content-area" style="height:auto;overflow:visible;">
    ${elementsHtml}
  </div>
</section>
</body>
</html>`

  // 注入系统变量（{printDate} 等），保持与最终渲染一致
  html = injectSystemVariables(html)
  return html
}

// ─── 第二遍：最终渲染 ───

function generateFinalHtml(
  template: TemplateData,
  pageLayouts: PageLayout[],
  css: string,
  totalPages: number,
  ctx: RenderCtx,
): string {
  const pagesHtml = pageLayouts.map(page => {
    const pageNum = page.pageIndex + 1
    return renderPage(template, page, pageNum, totalPages, ctx)
  }).join('\n')

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${css}</style>
</head>
<body>
${pagesHtml}
</body>
</html>`

  // 注入系统变量（{printDate} 等）
  html = injectSystemVariables(html)
  return html
}

function renderPage(
  template: TemplateData,
  page: PageLayout,
  pageNum: number,
  totalPages: number,
  ctx: RenderCtx,
): string {
  const paper = getPaperDims(template)
  const contentWidth = paper.width - template.margins.left - template.margins.right

  // 页眉（含页码变量替换）
  const headerHtml = renderAreaElements(
    template.header?.elements ?? [],
    contentWidth,
    pageNum,
    totalPages,
    ctx,
  )

  // 页脚（含页码变量替换）
  const footerHtml = renderAreaElements(
    template.footer?.elements ?? [],
    contentWidth,
    pageNum,
    totalPages,
    ctx,
  )

  // 首页叠加（仅首页）
  const overlayHtml = page.pageIndex === 0
    ? `<div class="first-page-overlay">${renderAreaElements(template.firstPageOverlay?.elements ?? [], contentWidth, undefined, undefined, ctx)}</div>`
    : ''

  // 内容区元素
  let contentHtml = page.sections
    .map(section => renderSection(section, template, ctx))
    .join('\n')
  // 内容区页码变量替换（PRD：内容区元素也支持 {pageIndex}/{totalPages}）
  contentHtml = contentHtml.replace(/\{pageIndex\}/g, String(pageNum))
  contentHtml = contentHtml.replace(/\{totalPages\}/g, String(totalPages))

  return `<section class="print-page" data-page="${pageNum}">
  <div class="page-header">${headerHtml}</div>
  ${overlayHtml}
  <div class="content-area">
    ${contentHtml}
  </div>
  <div class="page-footer">${footerHtml}</div>
</section>`
}

// ─── 元素渲染 ───

function renderSection(section: PageSection, template: TemplateData, ctx: RenderCtx): string {
  const el = findElement(template, section.elementId)
  if (!el) {
    return `<!-- element not found: ${section.elementId} -->`
  }

  if (section.type === 'table-slice') {
    return renderTableSlice(el, section, ctx)
  }
  if (section.type === 'flow-group') {
    return renderFlowGroup(el, section, template, ctx)
  }
  return renderElement(el, false, undefined, section.renderTop, ctx)
}

const V_ALIGN_FLEX: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
const H_ALIGN_FLEX: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

/** 文本类元素字体/颜色/对齐内联样式（字段与前端 ElementOptions 对齐，fontSize/lineHeight 单位 pt） */
function textStyle(opts: Record<string, any>): string {
  const parts: string[] = []
  if (opts.fontSize) parts.push(`font-size:${opts.fontSize}pt`)
  if (opts.fontFamily) parts.push(`font-family:${opts.fontFamily}`)
  if (opts.fontWeight) parts.push(`font-weight:${opts.fontWeight}`)
  if (opts.color) parts.push(`color:${opts.color}`)
  if (opts.backgroundColor) parts.push(`background-color:${opts.backgroundColor}`)
  if (opts.lineHeight) parts.push(`line-height:${opts.lineHeight}pt`)
  if (opts.letterSpacing) parts.push(`letter-spacing:${opts.letterSpacing}pt`)
  if (opts.verticalAlign) {
    parts.push(`display:flex;align-items:${V_ALIGN_FLEX[opts.verticalAlign] ?? 'flex-start'}`)
    parts.push(`justify-content:${H_ALIGN_FLEX[opts.textAlign ?? 'left'] ?? 'flex-start'}`)
  }
  if (opts.textAlign) parts.push(`text-align:${opts.textAlign}`)
  return parts.length ? parts.join(';') + ';' : ''
}

function renderElement(el: TemplateElement, isMeasure: boolean, containerStyle?: string, overrideTop?: number, ctx?: RenderCtx): string {
  const opts = el.options ?? {}
  const left = opts.left ?? 0
  const top = overrideTop ?? opts.top ?? 0
  const width = opts.width ?? 100
  const height = opts.height ?? undefined
  // 方案 A+B：flow-group 内跟随元素用相对容器样式（containerStyle）覆盖绝对定位
  const style = containerStyle ?? elementPositionStyle(left, top, width, height)
  const measureAttr = isMeasure ? ` data-measure-id="${el.id}"` : ''

  const type = el.type || el.printElementType?.type || 'text'

  switch (type) {
    case 'table':
      return renderTableElement(el, isMeasure, measureAttr, ctx)
    case 'image':
      return `<div class="print-element" style="${style}"${measureAttr}>
  <img src="${esc(opts.src ?? '')}" style="width:100%;height:100%;object-fit:contain;" />
</div>`
    case 'barcode':
    case 'qrcode': {
      const codeValue = String(opts.formatter ?? opts.testData ?? '').trim()
      // 条形码元素按元素框等比填满（fill）；二维码元素保持原 shrink-to-fit 行为
      const fill = type === 'barcode'
      return `<div class="print-element" style="${style}"${measureAttr}>
  ${codeImgHtml(codeValue, type as 'barcode' | 'qrcode', opts, `<span>${esc(codeValue)}</span>`, fill, ctx?.codeRenderer)}
</div>`
    }
    case 'hline':
      return `<div class="print-element" style="${style};border-top:1px solid #000;height:0;"${measureAttr}></div>`
    case 'vline':
      return `<div class="print-element" style="${style};border-left:1px solid #000;width:0;"${measureAttr}></div>`
    case 'rect':
      return `<div class="print-element" style="${style};border:${opts.borderWidth ?? 1}px solid ${opts.borderColor ?? '#000'};"${measureAttr}></div>`
    case 'oval':
      return `<div class="print-element" style="${style};border:${opts.borderWidth ?? 1}px solid ${opts.borderColor ?? '#000'};border-radius:50%;"${measureAttr}></div>`
    case 'longText':
      return `<div class="print-element" style="${style}${textStyle(opts)}overflow:visible;"${measureAttr}>${esc(opts.formatter ?? opts.testData ?? '')}</div>`
    case 'html':
      return `<div class="print-element" style="${style}"${measureAttr}>${opts.testData ?? opts.title ?? ''}</div>`
    default:
      return `<div class="print-element" style="${style}${textStyle(opts)}"${measureAttr}>${esc(opts.formatter ?? opts.testData ?? '')}</div>`
  }
}

/**
 * 码值 → URL 编码 SVG <img>（Chromium PDF 与浏览器预览均稳定）。
 * 无渲染器、码值非法或为空时降级为文本占位。
 */
function codeImgHtml(
  value: string,
  cellType: 'barcode' | 'qrcode',
  opts: Record<string, any>,
  fallbackHtml: string,
  /** 元素级条形码：等比填满元素框；表格单元格保持原 shrink-to-fit 行为 */
  fill = false,
  codeRenderer?: CodeRenderer,
): string {
  if (!value || !codeRenderer) return fallbackHtml
  try {
    const svg = codeRenderer.render(value, cellType, {
      barcodeType: opts.barcodeType,
      qrCodeLevel: opts.qrCodeLevel != null ? String(opts.qrCodeLevel) : undefined,
      showText: opts.hideTitle !== undefined ? !opts.hideTitle : opts.showBarcodeText,
      barWidth: typeof opts.barWidth === 'number' ? opts.barWidth : undefined,
      fontSize: typeof opts.fontSize === 'number' ? opts.fontSize : undefined,
    })
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    const style = fill
      ? 'width:100%;height:100%;object-fit:contain;display:block;margin:auto;'
      : 'max-width:100%;max-height:100%;display:block;margin:auto;'
    return `<img src="${src}" style="${style}" />`
  } catch {
    return fallbackHtml
  }
}

/** 单元格内联样式：逐格样式 + 元素级默认值兜底 */
function matrixCellStyle(cell: RenderCell, opts: Record<string, any>): string {
  const parts: string[] = []
  const fontSize = cell.fontSize ?? opts.tableDefaultFontSize
  const color = cell.color ?? opts.tableDefaultColor
  const padding = cell.padding ?? opts.tableDefaultPadding ?? 1
  if (fontSize) parts.push(`font-size:${fontSize}pt`)
  if (cell.fontWeight) parts.push(`font-weight:${cell.fontWeight}`)
  if (color) parts.push(`color:${color}`)
  if (cell.backgroundColor) parts.push(`background-color:${cell.backgroundColor}`)
  parts.push(`text-align:${cell.align ?? 'left'}`)
  parts.push(`vertical-align:${cell.valign ?? 'middle'}`)
  parts.push(`padding:${padding}mm`)
  parts.push(cell.wordWrap === false
    ? 'white-space:nowrap;overflow:hidden'
    : 'word-break:break-all')
  const b = cell.borders ?? {}
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const border = b[side]
    parts.push(border
      ? `border-${side}:${border.width}pt ${border.style} ${border.color}`
      : `border-${side}:none`)
  }
  return parts.join(';')
}

/** 渲染指定行区间为 <tr> 序列；merged 占位格不输出 td */
function renderMatrixRows(
  renderRows: RenderRow[],
  start: number,
  end: number,
  opts: Record<string, any>,
  withRowIndex: boolean,
  ctx?: RenderCtx,
): string {
  const trs: string[] = []
  for (let r = start; r < end; r++) {
    const row = renderRows[r]
    if (!row) continue
    const idxAttr = withRowIndex ? ` data-row-index="${r}"` : ''
    const tds = row.cells
      .filter(cell => !cell.merged)
      .map(cell => {
        const span = `${cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : ''}${cell.colspan > 1 ? ` colspan="${cell.colspan}"` : ''}`
        let inner: string
        if (cell.cellType === 'barcode' || cell.cellType === 'qrcode') {
          // 单元格条形码按单元格等比填满（fill）；单元格二维码保持原 shrink-to-fit 行为
          const cellFill = cell.cellType === 'barcode'
          inner = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;">${codeImgHtml(cell.content, cell.cellType as 'barcode' | 'qrcode', cell, esc(cell.content), cellFill, ctx?.codeRenderer)}</div>`
        } else {
          inner = esc(cell.content)
        }
        return `<td${span} style="${matrixCellStyle(cell, opts)}">${inner}</td>`
      })
      .join('')
    trs.push(`<tr${idxAttr} style="height:${row.height}mm;">${tds}</tr>`)
  }
  return trs.join('\n')
}

/** 矩阵表格骨架：colgroup（列宽 mm）+ 单一 tbody */
function matrixTableHtml(
  el: TemplateElement,
  bodyHtml: string,
): string {
  const opts = el.options
  const colWidths: number[] = opts.tableColWidths ?? []
  const colgroup = colWidths.map(w => `<col style="width:${w}mm;">`).join('')
  const tableWidth = colWidths.reduce((s, w) => s + w, 0)
  return `<table class="print-table" data-element-id="${el.id}" style="border-collapse:collapse;table-layout:fixed;width:${tableWidth}mm;">
    <colgroup>${colgroup}</colgroup>
    <tbody>${bodyHtml}</tbody>
  </table>`
}

function renderTableElement(
  el: TemplateElement,
  isMeasure: boolean,
  measureAttr: string,
  ctx?: RenderCtx,
): string {
  const opts = el.options
  const style = elementPositionStyle(opts.left ?? 0, opts.top ?? 0, opts.width ?? 100)
  const renderRows: RenderRow[] = opts._renderRows ?? []
  const bodyHtml = renderMatrixRows(renderRows, 0, renderRows.length, opts, isMeasure, ctx)
  return `<div class="print-element" style="${style};overflow:visible;"${measureAttr}>
  ${matrixTableHtml(el, bodyHtml)}
</div>`
}

function renderTableSlice(el: TemplateElement, section: PageSection, ctx?: RenderCtx): string {
  const opts = el.options
  // 续片在本页内容区从页顶(0)开始，首片用设计 top
  const style = elementPositionStyle(opts.left ?? 0, section.renderTop ?? opts.top ?? 0, opts.width ?? 100)
  const renderRows: RenderRow[] = opts._renderRows ?? []
  const startRow = section.startRow ?? 0
  const endRow = section.endRow ?? renderRows.length
  const repeatCount: number = opts._repeatHeaderCount ?? 0

  const repeatHtml = section.repeatHeader && repeatCount > 0
    ? renderMatrixRows(renderRows, 0, repeatCount, opts, false, ctx)
    : ''
  const bodyHtml = renderMatrixRows(renderRows, startRow, endRow, opts, false, ctx)
  const subtotalHtml = section.subtotal ? renderSubtotalRows(el, section, opts, ctx) : ''
  const summaryHtml = section.summary ? renderSummaryRows(el, opts, ctx) : ''

  return `<div class="print-element" style="${style};overflow:visible;">
  ${matrixTableHtml(el, `${repeatHtml}\n${bodyHtml}${subtotalHtml}${summaryHtml}`)}
</div>`
}

/** 渲染小计行（当前页数据小计）：按本片 data 行区间从 _dataRowCtx 截取，对 rawFormatter 重新求值 */
function renderSubtotalRows(
  el: TemplateElement,
  section: PageSection,
  opts: Record<string, any>,
  ctx?: RenderCtx,
): string {
  const templates: RenderRow[] = opts._subtotalTemplates ?? []
  if (templates.length === 0) return ''
  const dataRowCtx: Record<string, any>[] = opts._dataRowCtx ?? []
  const dataStartIdx: number = opts._dataStartIdx ?? 0
  const mainData = opts._mainData ?? {}
  const bodyLen: number = opts._renderRows?.length ?? 0
  const startRow = section.startRow ?? 0
  const endRow = section.endRow ?? bodyLen
  // 本片内 data 行区间：data 行在正文行中从 dataStartIdx 起连续
  const dataStart = Math.max(startRow, dataStartIdx)
  const dataEnd = Math.max(endRow, dataStart)
  const pageCtx = dataEnd > dataStartIdx
    ? dataRowCtx.slice(Math.max(dataStart - dataStartIdx, 0), dataEnd - dataStartIdx)
    : []
  const rows = templates.map(tpl => ({
    ...tpl,
    cells: tpl.cells.map(cell => cell.rawFormatter
      ? { ...cell, content: evaluateTemplate(cell.rawFormatter, { rows: pageCtx, ...mainData }) }
      : cell),
  }))
  return renderMatrixRows(rows, 0, rows.length, opts, false, ctx)
}

/** 渲染整表汇总行（总计，仅最后一页） */
function renderSummaryRows(el: TemplateElement, opts: Record<string, any>, ctx?: RenderCtx): string {
  const summaryRows: RenderRow[] = opts._summaryRows ?? []
  if (summaryRows.length === 0) return ''
  return renderMatrixRows(summaryRows, 0, summaryRows.length, opts, false, ctx)
}

/**
 * 方案 A+B：渲染「表格 slice + 跟随区」相对容器。
 * 容器按 groupTop 绝对定位，容器内表格 slice 与跟随元素走文档流：
 * 跟随元素从表格设计底部开始，按设计 Y 差值（margin-top）依次排布。
 */
function renderFlowGroup(
  el: TemplateElement,
  section: PageSection,
  template: TemplateData,
  ctx?: RenderCtx,
): string {
  const opts = el.options ?? {}
  const tableLeft = opts.left ?? 0
  const tableWidth = opts.width ?? 100
  const groupTop = section.groupTop ?? opts.top ?? 0
  const style = `position:absolute;left:${mm(tableLeft)};top:${mm(groupTop)};width:${mm(tableWidth)};overflow:visible;`

  // 本页表格 slice（跟随区整体移页时为空；小计/汇总行即使无正文行也渲染）
  const startRow = section.startRow ?? 0
  const endRow = section.endRow ?? 0
  let sliceHtml = ''
  if (endRow > startRow || section.subtotal || section.summary) {
    const renderRows: RenderRow[] = opts._renderRows ?? []
    const repeatCount: number = opts._repeatHeaderCount ?? 0
    const repeatHtml = section.repeatHeader && repeatCount > 0
      ? renderMatrixRows(renderRows, 0, repeatCount, opts, false, ctx)
      : ''
    const bodyHtml = renderMatrixRows(renderRows, startRow, endRow, opts, false, ctx)
    const subtotalHtml = section.subtotal ? renderSubtotalRows(el, section, opts, ctx) : ''
    const summaryHtml = section.summary ? renderSummaryRows(el, opts, ctx) : ''
    sliceHtml = `<div class="flow-slice" style="position:relative;width:${mm(tableWidth)};overflow:visible;">
  ${matrixTableHtml(el, `${repeatHtml}\n${bodyHtml}${subtotalHtml}${summaryHtml}`)}
</div>`
  }

  // 跟随区：相对容器内按文档流排布，间距 = 设计 Y 差值（保留排版意图）
  let cursorBottom = tableDesignBottom(el)
  const followHtml = (section.followElementIds ?? [])
    .map(id => {
      const m = findElement(template, id)
      if (!m) return ''
      const mTop = m.options?.top ?? 0
      const mLeft = m.options?.left ?? 0
      const mWidth = m.options?.width ?? tableWidth
      const mHeight = m.options?.height ?? 0
      const gap = Math.max(mTop - cursorBottom, 0)
      cursorBottom = mTop + mHeight
      const type = m.type || m.printElementType?.type || 'text'
      const needsHeight = type === 'rect' || type === 'oval' || type === 'image'
      const flowStyle = [
        'position:relative',
        `left:${mm(mLeft - tableLeft)}`,
        `width:${mm(mWidth)}`,
        ...(needsHeight && mHeight > 0 ? [`height:${mm(mHeight)}`] : []),
        `margin-top:${mm(gap)}`,
        'overflow:visible',
      ].join(';') + ';'
      return renderElement(m, false, flowStyle, undefined, ctx)
    })
    .join('\n')

  return `<div class="flow-group" style="${style}">
${sliceHtml}
${followHtml}
</div>`
}

// ─── 区域元素渲染（页眉/页脚/叠加） ───

function renderAreaElements(
  elements: TemplateElement[],
  _contentWidth: number,
  pageIndex?: number,
  totalPages?: number,
  ctx?: RenderCtx,
): string {
  return elements
    .map(el => {
      let html = renderAreaElement(el, ctx)
      // 页码变量替换（仅页眉/页脚区域）
      if (pageIndex !== undefined) {
        html = html.replace(/\{pageIndex\}/g, String(pageIndex))
      }
      if (totalPages !== undefined) {
        html = html.replace(/\{totalPages\}/g, String(totalPages))
      }
      return html
    })
    .join('\n')
}

function renderAreaElement(el: TemplateElement, ctx?: RenderCtx): string {
  // 复用内容区类型分支，补齐 hline/vline/rect/oval/barcode/qrcode
  return renderElement(el, false, undefined, undefined, ctx)
}

// ─── 工具函数 ───

function findElement(template: TemplateData, id: string): TemplateElement | undefined {
  return template.elements.find(el => el.id === id)
}

function getPaperDims(template: TemplateData): { width: number; height: number } {
  return getPaperDimensions(template)
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
