// 打印预览的「查看缩放」纯逻辑：只作用于屏幕，不参与出纸。
// 下沉 core 的原因是三端同源：canvas 的 PrintHtmlPreview、print-common 的 UMD 直挂命名空间、
// 以及四个宿主 demo 各自复刻的预览层都要用同一份档位与纸宽结算，不能再各写一份纸型表。
//
// 为什么要点阵档：CSS 的 mm 恒按 96px/in 换算（与打印机物理 DPI 无关）。95mm 纸在屏幕上只有
// 359px，本模板 SN 条码 297 模块压在 281px 上＝每模块 0.94 像素，纸面 2 个打印点的信息塞不进
// 1 个屏幕像素，条与条必然塌缩粘连（实测 1x 屏幕只能分辨 147 段，纸面是 297 模块）。
// 把缩放比取到 dpi/96，即「1 屏幕像素 = 1 打印点」，塌缩消失：实测该档下条宽恰好落在
// 2/4/6/8 像素上、逐位均匀且零灰阶——预览与纸面成同一张点阵。
// 自适应档用整数倍而非任意倍：非整数倍会重采样出半像素边，正是「抗锯齿」观感的来源。

import { getPaperDimensions } from './default-config.js'

/** CSS 绝对单位：1in = 96px */
export const MM_TO_PX = 96 / 25.4
/** 缩放上下限：下限 1 倍不缩小纸面，上限防止长模板把容器撑到不可用 */
export const ZOOM_MIN = 1
export const ZOOM_MAX = 8
/** 拿不到纸型时的兜底宽度（A4 竖版 210mm） */
const FALLBACK_PAPER_WIDTH_MM = 210

export interface ZoomPreset {
  key: string
  /** 实际写进 CSS zoom 的倍率 */
  value: number
  label: string
  /** 悬停说明：点阵档要说清它和纸面的关系 */
  tip: string
}

/** 收集模板里出现过的打印机分辨率：元素与表格单元格都可能有，多页模板要翻 pages */
function collectDpi(node: unknown, out: Set<number>): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectDpi(item, out)
    return
  }
  const record = node as Record<string, any>
  if (typeof record.printerDpi === 'number' && record.printerDpi > 0) out.add(record.printerDpi)
  for (const key of Object.keys(record)) {
    if (key === 'printerDpi') continue
    const value = record[key]
    if (value && typeof value === 'object') collectDpi(value, out)
  }
}

/**
 * 取模板的打印机分辨率；同时存在多档时取最大（点距最细，放大倍数最高）。
 * 未填 DPI 的模板不做点对齐，也就没有「点阵档」可言，返回 null。
 */
export function resolvePrinterDpi(templateJson?: Record<string, any> | null): number | null {
  if (!templateJson) return null
  const found = new Set<number>()
  collectDpi(templateJson, found)
  return found.size ? Math.max(...found) : null
}

/**
 * 纸张宽度（CSS px）：兼容单页与多页结构。
 * 宽高一律走 core 的 `getPaperDimensions`——方向交换、自定义宽度、连续纸宽度都在那一处结算，
 * 预览不再维护第二份纸型表（此前那份漏了 Letter/Legal/针式/热敏纸，还把 A3/A5 横版算错）。
 */
export function paperWidthPx(templateJson?: Record<string, any> | null): number {
  const page = templateJson?.pages?.[0] ?? templateJson
  if (!page) return FALLBACK_PAPER_WIDTH_MM * MM_TO_PX
  return getPaperDimensions(page).width * MM_TO_PX
}

/** 适配档：容器宽放得下整页的最大整数倍，非整数一律向下取整（不产生亚像素重采样） */
export function fitZoom(containerPx: number, paperPx: number): number {
  if (containerPx <= 0 || paperPx <= 0) return ZOOM_MIN
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.floor(containerPx / paperPx)))
}

/**
 * 缩放档位表。点阵档仍排在最前：它是唯一能保证「预览所见 = 纸面所打」的档，
 * 但默认不落在它上面（见 `defaultZoomKey`），把首档位置留给最容易看见的入口。
 */
export function zoomPresets(dpi: number | null, containerPx: number, paperPx: number): ZoomPreset[] {
  const list: ZoomPreset[] = []
  if (dpi) {
    list.push({
      key: 'dots',
      value: dpi / 96,
      label: `点阵 ${dpi}dpi`,
      tip: `1 屏幕像素 = 1 个打印点（${dpi}dpi ÷ 96dpi）。条与间隙按纸面逐点显示，不会在屏幕上糊成一片`,
    })
  }
  list.push(
    { key: 'fit', value: fitZoom(containerPx, paperPx), label: '适配', tip: '按容器宽放大到放得下整页的最大整数倍' },
    { key: '100', value: 1, label: '100%', tip: '按 CSS 真实尺寸显示（1mm = 3.78 屏幕像素），热敏点距在此档不可分辨' },
    { key: '200', value: 2, label: '200%', tip: '整数倍放大，避免非整数缩放带来的半像素边' },
    { key: '400', value: 4, label: '400%', tip: '整数倍放大，避免非整数缩放带来的半像素边' },
  )
  return list
}

/**
 * 默认档恒为 100%（CSS 真实尺寸）：预览按纸张实际比例展开，不再随点距自动放大。
 * `dpi` 形参已不参与判定，保留是因为这组函数登记在 core 的稳定面上、四宿主与 UMD 直挂
 * 宿主都在按实参调用，删签名属于破坏性变更。
 */
export function defaultZoomKey(dpi: number | null): string {
  return '100'
}

/**
 * 「当前档看不出条码」的提示文案：模板声明了打印头分辨率、且当前不在点阵档时给出，
 * 把点阵档的入口留在预览层里——默认改到 100% 后细条码在屏幕上仍会塌缩，
 * 没有这条提示容易被当成打印质量缺陷。无提示时返回空串。
 */
export function viewZoomHint(dpi: number | null, currentKey: string): string {
  if (!dpi || currentKey === 'dots') return ''
  return `条码看不清？切「点阵 ${dpi}dpi」档（1 屏幕像素 = 1 打印点）`
}

/** 注入预览文档的缩放守卫样式 id：重渲染会换文档，靠它判断是否需要重新注入 */
export const PREVIEW_ZOOM_GUARD_ID = 'print-preview-zoom-guard'

/**
 * 缩放只写进预览文档，不改渲染产物：一条带 `@media print` 复位的规则——
 * `print()` 走 iframe 自身排版与 @page 分页，屏幕放大必须在打印媒介下打回 1，否则会连带改掉分页。
 */
export function applyPreviewViewZoom(doc: Document | null | undefined, zoom: number): void {
  if (!doc?.documentElement) return
  let guard = doc.getElementById(PREVIEW_ZOOM_GUARD_ID) as HTMLStyleElement | null
  if (!guard) {
    guard = doc.createElement('style')
    guard.id = PREVIEW_ZOOM_GUARD_ID
    ;(doc.head ?? doc.documentElement).appendChild(guard)
  }
  guard.textContent = `html{zoom:${zoom}}@media print{html{zoom:1 !important}}`
}

/** 档位因模板变化（如删掉最后一处 printerDpi）而消失时，落回默认档 */
export function resolveZoomKey(presets: readonly ZoomPreset[], currentKey: string, dpi: number | null): string {
  return presets.some(p => p.key === currentKey) ? currentKey : defaultZoomKey(dpi)
}

/** 当前档位的实际倍率；档位表里找不到时按 1 倍（不缩放） */
export function zoomValueOf(presets: readonly ZoomPreset[], key: string): number {
  return presets.find(p => p.key === key)?.value ?? 1
}
