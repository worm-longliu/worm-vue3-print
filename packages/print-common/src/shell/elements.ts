// 元素渲染：与 print-canvas 的 elements/*.vue 同名结构、同口径样式。
// 元素层样式（.print-element / .print-text / .print-line / .print-shape / .print-image …）
// 来自派生 CSS，因此这里的类名与内联样式必须与 Vue 版一致才能出同样的纸面效果。
import DOMPurify from 'dompurify'
import {
  cropStyleDeclarations,
  DEFAULT_DEMO_DATA,
  ELEMENT_BORDER_SIDES,
  RESIZE_POINTS,
  evaluateTemplate,
  mmToPx,
  resolveElementBorder,
  resolveElementRotation,
  resolveElementTextFit,
  resolveElementWhiteSpace,
  resolveElementNowrap,
  resolveShrinkMinFontSize,
} from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { resolveCanvasFontFamily } from '@worm-vue3-print/core'
import { h } from '../core/h'
import type { DesignerStore } from '../core/store'
import { renderBarcode, renderQrcode } from './code'
import type { ShellCtx } from './controls'
import { renderTable } from './table'
import type { TableFire } from './table'
import { renderFlowListElement } from './flow-list'

const V_ALIGN_FLEX: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }
const H_ALIGN_FLEX: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

/** 元素几何与边框（对齐 BaseElement.elementStyle） */
export function elementStyle(el: RuntimeElement, followMemberIds?: Set<string>): Record<string, string> {
  const o = el.options
  const borders = resolveElementBorder(el.printElementType.type, o)
  const borderStyles: Record<string, string> = {}
  if (borders?.all) {
    borderStyles.border = `${borders.all.borderWidth} ${borders.all.borderStyle} ${borders.all.borderColor}`
  }
  if (borders) {
    for (const side of ELEMENT_BORDER_SIDES) {
      const e = borders.edges[side]
      if (e) {
        borderStyles[`border${side.charAt(0).toUpperCase()}${side.slice(1)}`] =
          `${e.borderWidth} ${e.borderStyle} ${e.borderColor}`
      }
    }
  }
  return {
    position: 'absolute',
    left: `${o.left}mm`,
    top: `${o.top}mm`,
    width: `${o.width}mm`,
    height: `${o.height}mm`,
    zIndex: String(o.zIndex || 'auto'),
    ...borderStyles,
    // 元素级旋转：与 BaseElement/出纸端同一 CSS 独立属性 rotate（排除类型、跟随区成员不转、码类低档吸附直角）
    ...rotateStyleRecord(el, followMemberIds),
  }
}

/** 画布旋转声明：与出纸端同一判据（core 单点），0/不适用不出键 */
function rotateStyleRecord(el: RuntimeElement, followMemberIds?: Set<string>): Record<string, string> {
  if (followMemberIds?.has(el.id)) return {}
  const angle = resolveElementRotation(el.printElementType.type, el.options)
  return angle === undefined ? {} : { rotate: `${angle}deg` }
}

/** 文本与长文本共用的行内样式：与 canvas 的 TextElement / LongTextElement 逐项一致（差异按类型分支） */
export function textLikeStyle(el: RuntimeElement) {
  const o = el.options
  const isLong = el.printElementType.type === 'longText'
  const fit = resolveElementTextFit(el.printElementType.type, o)
  const base = (o.fontSize || 12)
  const autoHeight = fit === 'autoHeight'
  const style: Record<string, string> = {
    fontSize: `${base}pt`,
    fontWeight: o.fontWeight || 'normal',
    fontFamily: resolveCanvasFontFamily(o.fontFamily),
    color: o.color || '#333',
    backgroundColor: o.backgroundColor || 'transparent',
    textAlign: o.textAlign || 'left',
    // justify 不拉伸段落末行，单行文本需显式声明才撑满行宽（与画布/出纸同策）
    ...(o.textAlign === 'justify' ? { textAlignLast: 'justify' } : {}),
    // 长文本默认 1.5 倍行高（canvas 同口径），普通文本走浏览器 normal
    lineHeight: o.lineHeight ? `${o.lineHeight}pt` : isLong ? '1.5' : 'normal',
    letterSpacing: o.letterSpacing ? `${o.letterSpacing}pt` : 'normal',
    width: '100%',
    height: autoHeight ? 'auto' : '100%',
    boxSizing: 'border-box',
    overflow: autoHeight ? 'visible' : 'hidden',
    ...(isLong
      ? { wordBreak: 'break-all', textIndent: o.longTextIndent ? `${o.longTextIndent}em` : '0' }
      : {
          textDecoration: o.textDecoration || 'none',
          padding: `${o.contentPaddingTop || 0}pt ${o.contentPaddingRight || 0}pt ${o.contentPaddingBottom || 0}pt ${o.contentPaddingLeft || 0}pt`,
        }),
  }
  if (resolveElementNowrap(o)) {
    style.whiteSpace = 'nowrap'
    style.textOverflow = 'ellipsis'
  }
  // 「保留换行符」档与画布/出纸共用 core 判据；关掉自动换行时它返回 undefined，单行优先
  const keepWs = resolveElementWhiteSpace(o)
  if (keepWs) style.whiteSpace = keepWs
  if (o.verticalAlign) {
    // justify 要行盒满宽：横向 flex 的匿名文本项拉不伸，改纵向主轴（垂直交给 justify-content，交叉轴 stretch 占满宽）
    style.display = 'flex'
    if (o.textAlign === 'justify') {
      style.flexDirection = 'column'
      style.justifyContent = V_ALIGN_FLEX[o.verticalAlign] ?? 'flex-start'
    } else {
      style.alignItems = V_ALIGN_FLEX[o.verticalAlign] ?? 'flex-start'
      style.justifyContent = H_ALIGN_FLEX[o.textAlign || 'left'] ?? 'flex-start'
    }
  }
  return { style, fit }
}

function lineStyle(el: RuntimeElement): Record<string, string> {
  const o = el.options
  const bw = `${o.borderWidth || 0.75}pt`
  const bs = o.borderStyle || 'solid'
  const bc = o.borderColor || '#333'
  if (el.printElementType.type === 'hline') {
    return { width: '100%', height: '0', borderTop: `${bw} ${bs} ${bc}`, boxSizing: 'border-box' }
  }
  return { width: '0', height: '100%', borderLeft: `${bw} ${bs} ${bc}`, boxSizing: 'border-box' }
}

function shapeStyle(el: RuntimeElement): Record<string, string> {
  const o = el.options
  return {
    width: '100%',
    height: '100%',
    borderWidth: `${o.borderWidth || 1}pt`,
    borderStyle: o.borderStyle || 'solid',
    borderColor: o.borderColor || '#333',
    backgroundColor: o.backgroundColor || 'transparent',
    borderRadius: el.printElementType.type === 'oval' ? '50%' : '0',
    boxSizing: 'border-box',
  }
}

export function imageStyle(el: RuntimeElement): Record<string, string> {
  const o = el.options
  return {
    objectFit: o.fit || 'contain',
    // 取位与放大的判据与出纸同源（core crop-style）：锚点即放大不动点，两端不许各拼一遍
    ...cropStyleDeclarations(o.fit, o.fitScale, o.objectPosition),
    maxWidth: o.maxWidth ? `${o.maxWidth}mm` : '100%',
    maxHeight: o.maxHeight ? `${o.maxHeight}mm` : '100%',
  }
}

/**
 * 自动缩小探针属性：与 canvas TextElement / LongTextElement 的 data-fit-* 集合一致，
 * 供 print-designer 的实测遍（core/browser fitTextNode）读取基准字号与下限。
 */
function fitDataset(el: RuntimeElement): Record<string, string> {
  const o = el.options
  const ds: Record<string, string> = {
    fitBase: String(o.fontSize || 12),
    fitMin: String(resolveShrinkMinFontSize(o.shrinkMinFontSize)),
  }
  if (resolveElementTextFit(el.printElementType.type, o) === 'shrink') ds.fit = 'shrink'
  return ds
}

/** 元素内容层（对应 BaseElement 里的 contentComponent 分发） */
function content(el: RuntimeElement, designMode: boolean, host?: { store: DesignerStore; fire: TableFire }) {
  const type = el.printElementType.type
  const o = el.options
  switch (type) {
    case 'text': {
      const { style } = textLikeStyle(el)
      // 设计态显示原始表达式（与 canvas 的 displayText 口径一致），不做数据求值
      return h('div', {
        class: 'print-text', style, dataset: fitDataset(el),
        text: String(o.testData || o.formatter || '') || '文本',
      })
    }
    case 'longText': {
      const { style } = textLikeStyle(el)
      return h('div', {
        class: 'print-longtext', style, dataset: fitDataset(el),
        // canvas 的长文本设计态只看 formatter，占位文案是「长文本内容」
        text: String(o.formatter || '') || '长文本内容',
      })
    }
    case 'hline':
    case 'vline':
      return h('div', { class: 'print-line', style: lineStyle(el) })
    case 'rect':
    case 'oval':
      return h('div', { class: 'print-shape', style: shapeStyle(el) })
    case 'image': {
      const raw = String(o.src ?? '')
      const src = raw.includes('{') ? evaluateTemplate(raw, DEFAULT_DEMO_DATA) : raw
      return h('div', { class: 'print-image' }, [
        src
          ? h('img', { src, style: imageStyle(el) })
          : h('div', { class: 'image-placeholder', text: '图片' }),
      ])
    }
    case 'qrcode':
      return renderQrcode(el)
    case 'barcode':
      return renderBarcode(el)
    case 'html': {
      // 与 canvas HtmlElement 同口径：先表达式求值，再 DOMPurify 消毒后注入
      const raw = String(o.formatter ?? '')
      const html = raw
        ? DOMPurify.sanitize(evaluateTemplate(raw, {}))
        : '<div style="background:#e0e0e0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:10pt;color:#999">HTML</div>'
      return h('div', { class: 'print-html', html })
    }
    case 'pageNumber':
      return h('div', {
        class: 'page-number-element',
        style: {
          fontSize: `${o.fontSize || 12}pt`,
          fontWeight: o.fontWeight || 'normal',
          fontFamily: resolveCanvasFontFamily(o.fontFamily),
          color: o.color || '#333',
          textAlign: o.textAlign || 'left',
          ...(o.textAlign === 'justify' ? { textAlignLast: 'justify' } : {}),
        },
        text: designMode ? (o.title || '{pageIndex}/{totalPages}') : String(o.title || ''),
      })
    case 'table':
      return host ? renderTable(el, host.store, host.fire) : h('div', { class: 'print-table' })
    case 'flowList':
      return renderFlowListElement(el)
    default:
      return h('div', { text: type })
  }
}

/** 选中角标文本：与 canvas BaseElement 的 posLabel 逐字一致（四舍五入到整数 mm） */
export function positionLabel(o: { left: number; top: number; width: number; height: number }) {
  return `x:${Math.round(o.left)} y:${Math.round(o.top)} ${Math.round(o.width)}×${Math.round(o.height)}mm`
}

export function renderDesignElement(ctx: ShellCtx, el: RuntimeElement, followMemberIds?: Set<string>) {
  const s = ctx.store
  const selected = s.selectedIds.has(el.id)
  const previewed = s.previewIds.has(el.id)
  const o = el.options
  const zone = el.zone || 'content'
  const children: unknown[] = [content(el, true, { store: s, fire: ctx.fire })]
  // canvas BaseElement：拖拽中元素变淡（.drag-ghost）并叠加虚线副本框（.drag-preview）
  if (s.draggingIds.has(el.id)) children.push(h('div', { class: 'drag-preview' }))
  if (selected) {
    children.push(h('div', { class: 'resize-handles' }, RESIZE_POINTS.map((p: string) => h('div', {
      class: `resize-handle handle-${p}`,
      dataset: { point: p, elId: el.id },
      onMousedown: (ev: Event) => ctx.fire('resize-start', { event: ev as MouseEvent, id: el.id, point: p }),
    }))))
    children.push(h('div', { class: 'selected-indicator' }, [
      h('div', { class: 'position-label', text: positionLabel(o) }),
    ]))
  }
  return h('div', {
    class: [
      'print-element',
      `type-${el.printElementType.type}`,
      `zone-${zone}`,
      selected ? 'selected' : '',
      previewed ? 'previewed' : '',
      s.draggingIds.has(el.id) ? 'drag-ghost' : '',
      'design-mode',
      o.locked ? 'locked' : '',
      o.visible === false ? 'hidden' : '',
    ].filter(Boolean).join(' '),
    style: elementStyle(el, followMemberIds),
    dataset: { elId: el.id },
    onMousedown: (ev: Event) => ctx.fire('element-mousedown', { event: ev as MouseEvent, id: el.id }),
    // 双击判定在 print-designer 的 element-mousedown 分支（paint 全量重建会断掉原生 dblclick）
    onContextmenu: (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
      ctx.fire('contextmenu', { event: ev as MouseEvent, id: el.id })
    },
  }, children as never)
}

/** mm → px（供画布几何换算复用同一口径） */
export { mmToPx }
