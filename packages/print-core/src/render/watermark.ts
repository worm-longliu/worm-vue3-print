// print-core/src/render/watermark.ts
// 水印公共逻辑（同构：Node 服务端 PDF / 浏览器预览 / 静默打印客户端 / 设计器画布共用），
// 保证「设计模板、预览、打印」三端水印完全一致。
//
// 渲染方式：**显式矢量瓦片**——按纸张尺寸算出瓦片网格，逐块输出内联 <svg> 元素。
// 严禁改回 CSS 平铺背景（background-repeat）：Chromium 打印/PDF 后端会把它编译成
// PDF 平铺图案（tiling pattern, PatternType 1），而出纸链路的 RIP（CUPS 过滤器/驱动
// 光栅化）会忽略图案矩阵，把水印放大约 3.1 倍（300dpi÷96px）、错位、铺乱。
// 根因与实测数据见 docs/superpowers/specs/2026-09-13-watermark-explicit-tiles-design.md。

import type { WatermarkOptions } from '../designer/types.js'
import { getByPath } from '../utils.js'
import { evaluateTemplate, safeEval } from './expression-eval.js'

/** 96dpi 下 1mm 对应的 CSS px 数（瓦片尺寸仍以 px 配置，落纸时换算为 mm） */
export const PX_PER_MM = 96 / 25.4
/** 1 CSS px 对应的 mm 数 */
export const MM_PER_PX = 25.4 / 96

/** 水印默认值（与设计器 CanvasPaper 历史行为一致） */
export const WATERMARK_DEFAULTS = {
  color: '#cccccc',
  opacity: 0.15,
  rotate: -30,
  /** 瓦片默认尺寸（px）：决定平铺疏密，默认 260×180 */
  tileWidth: 260,
  tileHeight: 180,
  /** 瓦片下限（px），防止文字裁剪/异常平铺 */
  minTileWidth: 140,
  minTileHeight: 100,
  /** 瓦片字号固定 16px：密度只改变平铺疏密，不改字体大小 */
  fontSize: 16,
} as const

/** 密度预设：调大瓦片 → 更疏；调小 → 更密 */
export const WATERMARK_DENSITY_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  dense: { width: 200, height: 120, label: '密' },
  medium: { width: 260, height: 180, label: '中（默认）' },
  loose: { width: 340, height: 260, label: '疏' },
}

function clampTile(value: number | undefined, fallback: number, min: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.round(n))
}

/** 校验并输出瓦片宽高 */
export function resolveTileSize(wm?: WatermarkOptions): { width: number; height: number } {
  return {
    width: clampTile(wm?.tileWidth, WATERMARK_DEFAULTS.tileWidth, WATERMARK_DEFAULTS.minTileWidth),
    height: clampTile(wm?.tileHeight, WATERMARK_DEFAULTS.tileHeight, WATERMARK_DEFAULTS.minTileHeight),
  }
}

/** 水印是否可见（向后兼容：无 mode 时按 fixed，content 非空即显示） */
export function isWatermarkVisible(wm?: WatermarkOptions | null): boolean {
  if (!wm) return false
  if (!wm.mode || wm.mode === 'fixed') {
    return !!wm.content && wm.content.trim().length > 0
  }
  return !!wm.binding && wm.binding.trim().length > 0
}

/**
 * 解析水印文本。
 * - fixed：取 content；
 * - binding：支持字段路径（order.no）、花括号表达式（{order.no}、CONCAT/DATE(...)），
 *   取不到值时依次回退 testData → [binding]；
 * - timestamp 开启时追加时间（format 指定格式，缺省 YYYY-MM-DD HH:mm）。
 */
export function resolveWatermarkText(wm: WatermarkOptions | undefined, printData?: Record<string, any> | Record<string, any>[]): string {
  if (!wm) return ''
  let text = ''

  if (!wm.mode || wm.mode === 'fixed') {
    text = wm.content ?? ''
  } else if (typeof wm.binding === 'string' && wm.binding.trim()) {
    const binding = wm.binding.trim()
    const data = Array.isArray(printData) ? (printData[0] ?? {}) : (printData ?? {})
    let resolved: unknown
    if (binding.includes('{')) {
      resolved = evaluateTemplate(binding, data)
    } else {
      try {
        resolved = safeEval(binding, data)
      } catch {
        resolved = undefined
      }
      // 纯路径兜底（safeEval 对含点的扁平 key/异常路径取不到时）
      if (resolved == null || typeof resolved === 'object') {
        resolved = getByPath(data, binding)
      }
    }
    if (resolved != null && typeof resolved !== 'object' && String(resolved) !== binding) {
      text = String(resolved)
    } else {
      text = wm.testData ?? `[${wm.binding}]`
    }
  }

  if (wm.timestamp && text) {
    text = `${text} ${formatTimestamp(wm.format)}`
  }
  return text
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 时间格式化：token 支持 YYYY/MM/DD/HH/mm/ss，缺省 YYYY-MM-DD HH:mm */
export function formatTimestamp(format?: string): string {
  const fmt = format && format.trim() ? format : 'YYYY-MM-DD HH:mm'
  const d = new Date()
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  }
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k] ?? k)
}

// ─── 瓦片网格（显式矢量瓦片） ───

/** 纸张尺寸（mm） */
export interface WatermarkPaper {
  width: number
  height: number
}

/** 单块瓦片在纸面坐标系中的位置与尺寸（mm，左上角原点） */
export interface WatermarkTile {
  leftMm: number
  topMm: number
  widthMm: number
  heightMm: number
}

/** 水印解析结果：文本 + 视觉参数 + 完整瓦片网格（HTML 与设计器画布共用同一份几何） */
export interface ResolvedWatermark {
  text: string
  color: string
  rotate: number
  opacity: number
  /** 瓦片内字号（px，viewBox 用户单位；不随密度变化） */
  fontSizePx: number
  /** 瓦片尺寸（px，viewBox 用户单位；密度配置的原值） */
  tileWidthPx: number
  tileHeightPx: number
  tileWidthMm: number
  tileHeightMm: number
  columns: number
  rows: number
  tiles: WatermarkTile[]
}

/** 保留 4 位小数，避免浮点噪声把 HTML 撑大 */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function escXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 解析水印并生成瓦片网格。
 * - 不可见（未配置/文本为空）返回 null；
 * - 网格覆盖整张纸：列数 = ceil(纸宽/瓦片宽)，行数 = ceil(纸高/瓦片高)，
 *   末列/末行超出部分由 .watermark-layer 的 overflow:hidden 裁掉（与背景平铺语义一致）。
 *
 * @param paperMm 最终纸张尺寸（mm）；连续纸须传探针推导后的纸高，保证网格与 @page 同源。
 */
export function resolveWatermarkLayout(
  wm: WatermarkOptions | undefined,
  printData: Record<string, any> | Record<string, any>[] | undefined,
  paperMm: WatermarkPaper,
): ResolvedWatermark | null {
  if (!isWatermarkVisible(wm)) return null
  const text = resolveWatermarkText(wm, printData)
  if (!text) return null

  const tile = resolveTileSize(wm)
  const tileWidthMm = round4(tile.width * MM_PER_PX)
  const tileHeightMm = round4(tile.height * MM_PER_PX)
  const paper = {
    width: Math.max(0, Number.isFinite(paperMm?.width) ? paperMm.width : 0),
    height: Math.max(0, Number.isFinite(paperMm?.height) ? paperMm.height : 0),
  }
  const columns = Math.max(1, Math.ceil(paper.width / tileWidthMm))
  const rows = Math.max(1, Math.ceil(paper.height / tileHeightMm))

  const tiles: WatermarkTile[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      tiles.push({
        leftMm: round4(c * tileWidthMm),
        topMm: round4(r * tileHeightMm),
        widthMm: tileWidthMm,
        heightMm: tileHeightMm,
      })
    }
  }

  return {
    text,
    color: wm?.color || WATERMARK_DEFAULTS.color,
    rotate: wm?.rotate ?? WATERMARK_DEFAULTS.rotate,
    opacity: wm?.opacity ?? WATERMARK_DEFAULTS.opacity,
    fontSizePx: WATERMARK_DEFAULTS.fontSize,
    tileWidthPx: tile.width,
    tileHeightPx: tile.height,
    tileWidthMm,
    tileHeightMm,
    columns,
    rows,
    tiles,
  }
}

/**
 * 生成单块瓦片的 `<svg>` 标记。
 * viewBox 用瓦片 px 坐标（字号 16px 等视觉参数不变），width/height 用 mm 落纸，
 * 因此瓦片在纸面上的物理尺寸恰好等于密度配置值。
 */
export function renderWatermarkTileSvg(layout: ResolvedWatermark, tile: WatermarkTile): string {
  const tileWidthPx = layout.tileWidthPx
  const tileHeightPx = layout.tileHeightPx
  const cx = tileWidthPx / 2
  const cy = tileHeightPx / 2
  const style =
    `left:${tile.leftMm}mm;top:${tile.topMm}mm;width:${tile.widthMm}mm;height:${tile.heightMm}mm`
  return `<svg class="watermark-tile" style="${style}" viewBox="0 0 ${tileWidthPx} ${tileHeightPx}" xmlns="http://www.w3.org/2000/svg">`
    + `<text x="${cx}" y="${cy}" font-size="${layout.fontSizePx}" fill="${layout.color}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${layout.rotate},${cx},${cy})">${escXml(layout.text)}</text>`
    + '</svg>'
}

/**
 * 生成单页水印层 HTML（放在 .print-page 内、所有内容之下的最底层）。
 * 不可见/文本为空时返回空串。
 */
export function renderWatermarkLayerHtml(
  wm: WatermarkOptions | undefined,
  printData: Record<string, any> | Record<string, any>[] | undefined,
  paperMm: WatermarkPaper,
): string {
  const layout = resolveWatermarkLayout(wm, printData, paperMm)
  if (!layout) return ''
  const tiles = layout.tiles.map((t) => renderWatermarkTileSvg(layout, t)).join('\n')
  return `\n<div class="watermark-layer" style="opacity:${layout.opacity}">\n${tiles}\n</div>`
}
