// 示例卡片缩略图：按模板元素坐标等比绘制示意图（不渲染真实条码/二维码），实现口径与 demo 的 SampleThumb 一致。
// 只做版式示意，出纸效果以「预览」为准。
import { useMemo } from 'react'
import { getByPath, getPaperDimensions, isContinuousPaperSize } from '@worm-vue3-print/core'

/** 缩略图舞台尺寸（px）：纸张等比缩放后居中放置 */
const STAGE_W = 148
const STAGE_H = 108
/** pt → mm */
const PT_TO_MM = 0.3528

/** 把模板表达式里可解析的 {a.b} 换成静态数据的实际值，其余原样保留 */
function resolveText(formatter, data) {
  if (!formatter) return ''
  return formatter.replace(/\{([^{}]+)\}/g, (raw, expr) => {
    const path = expr.trim()
    if (!data || !/^[\w.]+$/.test(path)) return raw
    const value = getByPath(data, path)
    return value == null ? '' : String(value)
  })
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
    lines.push({ left: `${(acc / totalW) * 100}%`, top: 0, width: '1px', height: '100%' })
  })
  acc = 0
  rows.slice(0, -1).forEach(r => {
    acc += r.height ?? 0
    lines.push({ top: `${(acc / totalH) * 100}%`, left: 0, height: '1px', width: '100%' })
  })
  return lines
}

export default function SampleThumb({ template, data }) {
  // 多页 wrapper（{ pages: [...] }）归一化：缩略图按首页版式绘制
  const base = useMemo(() => (template.pages?.length ? template.pages[0] : template), [template])

  // 纸张尺寸（mm）：连续纸按内容底部推算一个可视高度
  const paperMm = useMemo(() => {
    const dim = getPaperDimensions(base)
    if (!isContinuousPaperSize(base.paperSize)) return dim
    const bottom = (base.elements ?? []).reduce((max, e) => {
      const o = e.options ?? {}
      return Math.max(max, (o.top ?? 0) + (o.height ?? 0))
    }, 0)
    return { width: dim.width, height: Math.max(40, bottom + base.margins.top + base.margins.bottom) }
  }, [base])

  const scale = Math.min(STAGE_W / paperMm.width, STAGE_H / paperMm.height)

  const pageStyle = useMemo(() => ({
    width: `${Math.round(paperMm.width * scale)}px`,
    height: `${Math.round(paperMm.height * scale)}px`,
  }), [paperMm, scale])

  const items = useMemo(() => {
    const k = scale
    const ml = base.margins.left
    const mt = base.margins.top
    return (base.elements ?? []).map((e, i) => {
      const o = e.options ?? {}
      const type = e.printElementType?.type ?? e.type ?? 'text'
      const style = {
        left: `${(ml + (o.left ?? 0)) * k}px`,
        top: `${(mt + (o.top ?? 0)) * k}px`,
        width: `${Math.max(1, (o.width ?? 0) * k)}px`,
        height: `${Math.max(1, (o.height ?? 0)) * k}px`,
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
      return {
        id: e.id ?? `t-${i}`,
        type,
        style,
        text: type === 'text' || type === 'longText' ? resolveText(o.formatter, data) : '',
        textStyle: verticalCenter ? { ...textStyle, margin: 'auto 0' } : textStyle,
        gridLines: type === 'table' ? tableGridLines(o) : [],
      }
    })
  }, [base, data, scale])

  return (
    <div className="thumb-stage">
      <div className="thumb-page" style={pageStyle}>
        {items.map(it => (
          <div key={it.id} className={`thumb-el thumb-el--${it.type}`} style={it.style}>
            {it.text ? <span className="thumb-text" style={it.textStyle}>{it.text}</span> : null}
            {it.gridLines.map((ln, i) => <i key={i} className="thumb-grid-line" style={ln}></i>)}
          </div>
        ))}
      </div>
    </div>
  )
}
