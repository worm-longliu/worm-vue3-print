// services/print-render/src/barcode-renderer.ts
// 服务端条形码/二维码 SVG 生成：bwip-js toSVG，纯 Node 无 DOM 依赖

import bwipjs from 'bwip-js'

/** 前端 jsbarcode 码制名 → bwip-js bcid 映射 */
const BWID_MAP: Record<string, string> = {
  CODE128: 'code128',
  EAN13: 'ean13',
  EAN8: 'ean8',
  UPC: 'upc',
  CODE39: 'code39',
  ITF14: 'itf14',
}

export interface BarcodeSvgOptions {
  /** 条形码码制（jsbarcode 格式名），仅 barcode 类型使用 */
  barcodeType?: string
  /** 二维码纠错级别 L/M/Q/H，仅 qrcode 类型使用 */
  qrCodeLevel?: string
  /** 条形码下方是否显示文本 */
  showText?: boolean
  /** 条码模块宽度倍率（条码设置→条宽），默认 2；映射 bwip scale = barWidth/2（保持历史默认 1） */
  barWidth?: number
  /** 条码下方文本字号（pt），默认 12；映射 bwip textsize = fontSize/12*7（保持历史默认 7） */
  fontSize?: number
}

/**
 * 将码值渲染为 SVG 字符串。
 * cellType='qrcode' 用 bwip 内置 qrcode，其余走条形码映射（默认 CODE128）。
 * 抛出异常表示码值/码制不合法，由调用方决定降级方式。
 */
export function renderBarcodeSvg(
  value: string,
  cellType: 'barcode' | 'qrcode',
  opts: BarcodeSvgOptions = {},
): string {
  if (!value) throw new Error('empty barcode value')
  const bcid = cellType === 'qrcode'
    ? 'qrcode'
    : (BWID_MAP[(opts.barcodeType ?? 'CODE128').toUpperCase()] ?? 'code128')

  const options: Record<string, any> = { bcid, text: value }
  if (cellType === 'qrcode') {
    options.eclevel = ['L', 'M', 'Q', 'H'].includes((opts.qrCodeLevel ?? '').toUpperCase())
      ? opts.qrCodeLevel!.toUpperCase()
      : 'M'
    options.scale = 3
  } else {
    options.height = 10
    options.includetext = opts.showText !== false
    options.textxalign = 'center'
    // 条宽倍率 → bwip scale：默认 barWidth=2 → scale=1，与历史输出一致；
    // bwip-js 对 scale<1 输出异常（反而变粗），故最小钳制为 1
    options.scale = Math.max(1, (opts.barWidth ?? 2) / 2)
    // 字号 pt → bwip textsize：默认 fontSize=12 → textsize=7，与历史输出一致
    options.textsize = ((opts.fontSize ?? 12) / 12) * 7
  }
  return bwipjs.toSVG(options as any)
}
