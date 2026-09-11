// web/src/components/print/utils/zone-layout.ts
// 页眉/页脚/内容三区几何计算与归区逻辑（区域元素坐标相对区域左上角，mm）
import type { RuntimeElement, TemplateData, ElementZone } from '../types.js'
import { getPaperDimensions } from './default-config.js'

/** 允许放入页眉/页脚的元素类型 */
export const ZONE_ALLOWED_TYPES = ['text', 'image', 'hline', 'vline', 'rect', 'oval', 'barcode', 'qrcode']

export interface ZoneRectPt {
  left: number
  top: number
  width: number
  height: number
}

/** 纸张宽高（mm，含方向；CUSTOM 读取 customWidth/customHeight，缺省回退 A4） */
export function getPaperSizeMM(t: TemplateData): { width: number; height: number } {
  return getPaperDimensions(t)
}

/** 三区在纸面坐标系中的矩形（mm），布局：上边距→页眉→内容→页脚→下边距 */
export function getZoneRects(t: TemplateData): Record<ElementZone, ZoneRectPt> {
  const paper = getPaperSizeMM(t)
  const m = t.margins
  const headerH = t.header.height
  const footerH = t.footer.height
  const contentW = paper.width - m.left - m.right
  const contentH = paper.height - m.top - m.bottom - headerH - footerH
  const rect = (l: number, tp: number, w: number, h: number): ZoneRectPt => ({
    left: l, top: tp, width: w, height: h,
  })
  return {
    header: rect(m.left, m.top, contentW, headerH),
    content: rect(m.left, m.top + headerH, contentW, contentH),
    footer: rect(m.left, paper.height - m.bottom - footerH, contentW, footerH),
  }
}

/** 纸面 mm 坐标 → 命中区域（高度为 0 的区域不参与命中） */
export function zoneFromPaperPoint(t: TemplateData, _x: number, y: number): ElementZone {
  const r = getZoneRects(t)
  if (r.footer.height > 0 && y >= r.footer.top) return 'footer'
  if (r.header.height > 0 && y < r.header.top + r.header.height) return 'header'
  return 'content'
}

/** 将元素局部坐标 clamp 到区域矩形内（原地修改） */
export function clampToZone(el: RuntimeElement, zone: ZoneRectPt): void {
  const o = el.options
  o.width = Math.min(o.width, zone.width)
  o.height = Math.min(o.height, zone.height)
  o.left = Math.min(Math.max(0, o.left), zone.width - o.width)
  o.top = Math.min(Math.max(0, o.top), zone.height - o.height)
}

/**
 * 拖拽/缩放结束后按元素中心点归区：
 * 跨区时换算坐标并改写 zone；页眉/页脚内 clamp；类型不允许时拒绝跨入并 clamp 回内容区。
 */
export function finalizeElementZone(
  el: RuntimeElement,
  t: TemplateData,
): { rejected: boolean } {
  const rects = getZoneRects(t)
  const fromZone: ElementZone = el.zone || 'content'
  const from = rects[fromZone]
  const cx = from.left + el.options.left + el.options.width / 2
  const cy = from.top + el.options.top + el.options.height / 2
  let target = zoneFromPaperPoint(t, cx, cy)
  let rejected = false
  if (target !== 'content' && !ZONE_ALLOWED_TYPES.includes(el.printElementType.type)) {
    target = 'content'
    rejected = true
  }
  if (target !== fromZone) {
    const to = rects[target]
    el.options.left = from.left + el.options.left - to.left
    el.options.top = from.top + el.options.top - to.top
    el.zone = target
  }
  if (target !== 'content') {
    clampToZone(el, rects[target])
  } else if (rejected) {
    clampToZone(el, rects.content)
  }
  return { rejected }
}
