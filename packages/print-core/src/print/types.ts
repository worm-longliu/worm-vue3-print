import type { CodeRenderOptions } from '../render/types.js'
import type { CodeRenderer, MultiPageTemplateData, PageLayout, TemplateData } from '../render/types.js'
import type { PrintDataInput } from './normalize-print-data.js'

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

export interface PrintJob {
  /** 模板 JSON（设计器 TemplateData 结构兼容；含 { pages } 多页面模板） */
  templateJson: TemplateData | MultiPageTemplateData
  /** 业务数据：对象=单份；非空对象数组=按数组长度批量合并为一个作业 */
  printData?: PrintDataInput
  /** 相对路径图片基址 */
  baseUrl?: string
  /**
   * 相对路径字体基址；缺省回落 `baseUrl`，传空串表示不拼接（浏览器端按文档 origin 解析）。
   * 出图端必须能访问解析后的字体地址，否则声明字体会静默回退到系统字体。
   */
  fontBaseUrl?: string
  /** 宿主纸张覆盖（mm）；0 或负数视为未提供 */
  paperOverride?: { width?: number; height?: number }
  /** 连续纸显式纸高逃生门（mm） */
  paperHeightMm?: number
  /** 单任务总预算（ms），缺省 30000 */
  timeoutMs?: number
  /** 就绪等待（ms），缺省 5000 */
  readinessMs?: number
  /** 调用方提供的码值渲染器（浏览器端覆盖语义）；提供时跳过多趟收集 */
  codeRenderer?: CodeRenderer
}

export interface PreparedDocument {
  html: string
  pageCount: number
  paperMm: PaperMm
  continuous: boolean
  heightSource: HeightSource
  pageLayouts: PageLayout[]
  /** 份数：单对象=1，数组=数组长度 */
  copies: number
  /** 批量时每份的物理纸张尺寸（连续纸各份高度不同）；单份无此字段 */
  copyPaperMm?: PaperMm[]
}

export interface RenderPdfResult {
  pdf: Uint8Array
  prepared: PreparedDocument
}
