// print-core/src/browser/browser-code-renderer.ts
// 浏览器侧 CodeRenderer：jsbarcode（条形码）+ qrcode（二维码矩阵拼 SVG），纯前端无服务依赖。
//
// 条形码出纸清晰度的三条硬约束（实测得出，勿随意回退）：
// 1. 每模块必须是整数个打印点：非整数会被打印机/RIP 各自取整，同一逻辑条宽打成 2 点或 3 点，
//    出纸即「条宽忽宽忽窄」。给出 printerDpi 时按整数点反算最终尺寸（见 render/barcode-dot.ts）。
// 2. shape-rendering="crispEdges"：抗锯齿会在条边缘生成灰像素，热敏头只有黑白两态，
//    灰边被阈值化后条宽进一步失真（实测灰像素占墨迹 11.3% → 1.7%）。二维码一直是这么设的。
// 3. 静区不能为 0：jsbarcode 默认 10 模块，此前被写死 margin:0，EAN13/UPC/ITF14 会直接扫不出。

import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import {
  BARCODE_BAR_HEIGHT_MODULES,
  BARCODE_MARGIN_BOTTOM_MODULES,
  BARCODE_QUIET_ZONE_MODULES,
  BARCODE_TEXT_FONT_SIZE_MODULES,
  barcodeUnitsPerModule,
  resolveBarcodeSize,
} from '../render/barcode-dot.js'
import type { CodeRenderer, CodeRenderOptions } from '../render/types.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 读 svg 的 viewBox 宽高；缺失或非法时返回 null */
function readViewBox(svg: SVGSVGElement): { width: number; height: number } | null {
  const raw = svg.getAttribute('viewBox')
  if (!raw) return null
  const parts = raw.trim().split(/[\s,]+/).map(Number)
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) return null
  return { width: parts[2]!, height: parts[3]! }
}

/**
 * 条形码：jsbarcode 渲染到离体 SVG 元素，取 outerHTML。
 * 所有 jsbarcode 参数都以「模块」为单位再乘以每模块用户单位数，使条码图形与倍率无关；
 * 落纸尺寸由统一的结算算法给出（见 render/barcode-dot.ts）：条宽定首选尺寸、
 * 有 printerDpi 时吸附到整数打印点、可用框放不下则等比缩小，故这里总是写成 mm。
 */
function renderBarcodeSvg(value: string, opts: CodeRenderOptions): string {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  const unitPerModule = barcodeUnitsPerModule(opts.barWidth)
  JsBarcode(svg as unknown as SVGElement, value, {
    format: (opts.barcodeType || 'CODE128') as unknown as string,
    width: unitPerModule,
    height: BARCODE_BAR_HEIGHT_MODULES * unitPerModule,
    displayValue: opts.showText !== false,
    fontSize: (opts.fontSize ?? BARCODE_TEXT_FONT_SIZE_MODULES) * unitPerModule,
    // 静区只留左右：上下留白会白白吃掉元素高度（jsbarcode 的 margin 是四边通配）
    margin: 0,
    marginLeft: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
    marginRight: BARCODE_QUIET_ZONE_MODULES * unitPerModule,
    marginTop: 0,
    marginBottom: BARCODE_MARGIN_BOTTOM_MODULES * unitPerModule,
  })

  // 归一到「1 单位 = 1 模块」再求落纸尺寸：条宽定首选、DPI 定点阵、框不够就等比缩小
  const viewBox = readViewBox(svg)
  if (viewBox) {
    const size = resolveBarcodeSize({
      unitWidth: viewBox.width / unitPerModule,
      unitHeight: viewBox.height / unitPerModule,
      boxWidthMm: opts.targetWidthMm ?? 0,
      boxHeightMm: opts.targetHeightMm ?? 0,
      dpi: opts.printerDpi,
      barWidth: opts.barWidth,
    })
    // 尺寸不取整：mm 数值一旦被四舍五入，折算回打印点就不再是整数，点对齐随之失效
    svg.setAttribute('width', `${size.widthMm}mm`)
    svg.setAttribute('height', `${size.heightMm}mm`)
  }

  svg.setAttribute('shape-rendering', 'crispEdges')
  return svg.outerHTML
}

/** 二维码：QRCode.create 同步取模块矩阵，拼接 SVG（静态白边 4 模块） */
function renderQrSvg(value: string, opts: CodeRenderOptions): string {
  const level = (opts.qrCodeLevel ?? 'M').toUpperCase()
  const qr = QRCode.create(value, {
    errorCorrectionLevel: (['L', 'M', 'Q', 'H'].includes(level) ? level : 'M') as 'L' | 'M' | 'Q' | 'H',
  })
  const modules = qr.modules
  const size = modules.size
  const dot = 4
  const quiet = 4 * dot
  const dim = size * dot + quiet * 2
  let rects = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules.get(x, y)) {
        rects += `<rect x="${quiet + x * dot}" y="${quiet + y * dot}" width="${dot}" height="${dot}" fill="#000"/>`
      }
    }
  }
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges">${rects}</svg>`
}

/** 码值 → SVG：浏览器渲染器与 DOM 执行器共用同一算法 */
export function renderCodeSvg(
  value: string,
  cellType: 'barcode' | 'qrcode',
  opts: CodeRenderOptions = {},
): string {
  if (!value) throw new Error('empty barcode value')
  return cellType === 'qrcode' ? renderQrSvg(value, opts) : renderBarcodeSvg(value, opts)
}

/** 浏览器条码/二维码渲染器；码值非法或为空时抛错，由渲染管线降级文本占位 */
export const browserCodeRenderer: CodeRenderer = {
  render(value: string, cellType: 'barcode' | 'qrcode', opts: CodeRenderOptions = {}): string {
    return renderCodeSvg(value, cellType, opts)
  },
}
