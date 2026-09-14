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
