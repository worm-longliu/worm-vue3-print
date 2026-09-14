import type { CodeRenderOptions } from '../render/types.js'

/** 物理尺寸（毫米）；三端与协议的公共纸尺寸表示 */
export interface PaperMm {
  width: number
  height: number
}

/** 测量容器尺寸（CSS 像素）；浏览器为 iframe 尺寸，服务端为 page viewport */
export interface ViewportPx {
  width: number
  height: number
}

/** 纸高来源：config = 模板/宿主给定，derived = 连续纸探针推导 */
export type HeightSource = 'config' | 'derived'

export interface MarginsMm {
  top: number
  right: number
  bottom: number
  left: number
}

/** 出图目标规格：与宿主无关，宿主负责翻译成自己的选项 */
export interface PdfTargetSpec {
  paperMm: PaperMm
  marginsMm: MarginsMm
  printBackground: boolean
  scale: number
  preferCSSPageSize: boolean
}

export interface ScreenshotTargetSpec {
  type: 'png'
  fullPage: boolean
  omitBackground: boolean
}

/** 宿主回传的原始测量值（CSS px，不做任何业务换算） */
export interface RawMeasurement {
  id: string
  heightPx: number
  /** 表格行高（px），仅表格元素有值 */
  rowHeightsPx?: number[]
}

/** 一次码值渲染请求；key 为稳定键，用于跨进程映射 */
export interface CodeSpec {
  key: string
  value: string
  cellType: 'barcode' | 'qrcode'
  opts: CodeRenderOptions
}
