// print-canvas/src/render/browser-code-renderer.ts
// 浏览器侧 CodeRenderer：jsbarcode（条形码）+ qrcode（二维码矩阵拼 SVG），纯前端无服务依赖。

import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import type { CodeRenderer, CodeRenderOptions } from '../render/types.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 条形码：jsbarcode 渲染到离体 SVG 元素，取 outerHTML */
function renderBarcodeSvg(value: string, opts: CodeRenderOptions): string {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  JsBarcode(svg as unknown as SVGElement, value, {
    format: (opts.barcodeType || 'CODE128') as unknown as string,
    width: Math.max(1, (opts.barWidth ?? 2) / 2),
    height: 30,
    displayValue: opts.showText !== false,
    fontSize: opts.fontSize ?? 10,
    margin: 0,
    marginBottom: 2,
  })
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

/** 浏览器条码/二维码渲染器；码值非法或为空时抛错，由渲染管线降级文本占位 */
export const browserCodeRenderer: CodeRenderer = {
  render(value: string, cellType: 'barcode' | 'qrcode', opts: CodeRenderOptions = {}): string {
    if (!value) throw new Error('empty barcode value')
    return cellType === 'qrcode' ? renderQrSvg(value, opts) : renderBarcodeSvg(value, opts)
  },
}
