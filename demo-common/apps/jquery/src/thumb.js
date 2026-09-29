// 示例卡片缩略图：按模板元素坐标等比绘制版式示意（不渲染真实条码/二维码），口径与 demo 的 SampleThumb.vue 一致。
// 无打包器形态下，纸张尺寸与取值工具全部来自全局 WormPrintCommon（core 已内联进同一份 dist/common.js）。
// 只做版式示意，出纸效果以「预览」为准。

const W = window.WormPrintCommon

/** 缩略图舞台尺寸（px）：纸张等比缩放后居中放置 */
const STAGE_W = 148
const STAGE_H = 108

/** pt → mm */
const PT_TO_MM = 0.3528

/** 多页 wrapper（{ pages: [...] }）归一化：缩略图按首页版式绘制 */
function baseOf(template) {
  return template.pages && template.pages.length ? template.pages[0] : template
}

/** 把模板表达式里可解析的 {a.b} 换成静态数据的实际值，其余原样保留 */
function resolveText(formatter, data) {
  if (!formatter) return ''
  return formatter.replace(/\{([^{}]+)\}/g, (raw, expr) => {
    const path = expr.trim()
    if (!data || !/^[\w.]+$/.test(path)) return raw
    const value = W.getByPath(data, path)
    return value == null ? '' : String(value)
  })
}

/** 纸张尺寸（mm）：连续纸按内容底部推算一个可视高度 */
function paperMmOf(t) {
  const dim = W.getPaperDimensions(t)
  if (!W.isContinuousPaperSize(t.paperSize)) return dim
  const bottom = (t.elements ?? []).reduce((max, e) => {
    const o = e.options ?? {}
    return Math.max(max, (o.top ?? 0) + (o.height ?? 0))
  }, 0)
  return { width: dim.width, height: Math.max(40, bottom + t.margins.top + t.margins.bottom) }
}

/** 表格网格线：按列宽/行高累计位置画细线（百分比定位） */
function tableGridLines(o) {
  const cols = o.tableColWidths ?? []
  const rows = o.tableRows ?? []
  const totalW = cols.reduce((s, w) => s + w, 0) || 1
  const totalH = rows.reduce((s, r) => s + (r.height ?? 0), 0) || 1
  const lines = []
  let acc = 0
  cols.slice(0, -1).forEach(w => {
    acc += w
    lines.push({ left: `${(acc / totalW) * 100}%`, top: '0', width: '1px', height: '100%' })
  })
  acc = 0
  rows.slice(0, -1).forEach(r => {
    acc += r.height ?? 0
    lines.push({ top: `${(acc / totalH) * 100}%`, left: '0', height: '1px', width: '100%' })
  })
  return lines
}

function createNode(tag, className, style) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (style) Object.assign(node.style, style)
  return node
}

/** 单个模板元素的等比示意块 */
function createThumbItem(element, index, t, k, data) {
  const o = element.options ?? {}
  const type = element.printElementType?.type ?? element.type ?? 'text'
  const style = {
    left: `${(t.margins.left + (o.left ?? 0)) * k}px`,
    top: `${(t.margins.top + (o.top ?? 0)) * k}px`,
    width: `${Math.max(1, (o.width ?? 0) * k)}px`,
    height: `${Math.max(1, o.height ?? 0) * k}px`,
  }
  const fontSizePx = Math.max(2, Math.round((o.fontSize ?? 10) * PT_TO_MM * k * 10) / 10)
  const textStyle = {
    fontSize: `${fontSizePx}px`,
    textAlign: o.textAlign ?? 'left',
    color: o.color ?? '#3a4150',
    fontWeight: o.fontWeight === 'bold' ? '600' : '400',
    textDecoration: o.textDecoration === 'line-through' ? 'line-through' : 'none',
  }
  const verticalCenter = o.verticalAlign === 'middle' || type === 'table'
  if (verticalCenter) style.display = 'flex'
  const box = createNode('div', `thumb-el thumb-el--${type}`, style)
  const text = type === 'text' || type === 'longText' ? resolveText(o.formatter, data) : ''
  if (text) {
    const span = createNode('span', 'thumb-text', verticalCenter ? { ...textStyle, margin: 'auto 0' } : textStyle)
    span.textContent = text
    box.appendChild(span)
  }
  if (type === 'table') {
    tableGridLines(o).forEach(ln => box.appendChild(createNode('i', 'thumb-grid-line', ln)))
  }
  return box
}

/** 生成一张示例卡片里的缩略图 DOM：.thumb-stage > .thumb-page > .thumb-el… */
export function createThumb(template, data) {
  const t = baseOf(template)
  const paper = paperMmOf(t)
  const k = Math.min(STAGE_W / paper.width, STAGE_H / paper.height)
  const stage = createNode('div', 'thumb-stage')
  const page = createNode('div', 'thumb-page', {
    width: `${Math.round(paper.width * k)}px`,
    height: `${Math.round(paper.height * k)}px`,
  })
  ;(t.elements ?? []).forEach((element, i) => page.appendChild(createThumbItem(element, i, t, k, data)))
  stage.appendChild(page)
  return stage
}
