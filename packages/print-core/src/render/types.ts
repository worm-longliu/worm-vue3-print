// print-core/src/render/types.ts
// 打印渲染管线类型定义（同构：Node 服务端与浏览器预览共用）

// ─── 纸张 ───

export type PaperSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'CUSTOM'

/** 纸张尺寸映射（mm） */
export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  CUSTOM: { width: 210, height: 297 },
}

// ─── 模板数据模型（PRD 3.2 节） ───

export interface TemplateData {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  /** 自定义纸张宽度（mm），仅 paperSize='CUSTOM' 时生效 */
  customWidth?: number
  /** 自定义纸张高度（mm），仅 paperSize='CUSTOM' 时生效 */
  customHeight?: number
  /** 页面（纸张）背景色；未设置时默认白色 */
  pageBackground?: string
  margins: { top: number; right: number; bottom: number; left: number }
  header: { height: number; elements: TemplateElement[] }
  footer: { height: number; elements: TemplateElement[] }
  firstPageOverlay: { height: number; elements: TemplateElement[] }
  elements: TemplateElement[]
}

// ─── 模板元素 ───

/** 元素分页属性（非表格元素） */
export interface PaginationConfig {
  pageable: boolean
  keepWithNext: boolean
}

/** 表格分页配置 */
export interface TablePaginationConfig {
  enabled: boolean
}

/**
 * 模板元素 — print-render 侧的简化视图。
 * 兼容前端 PrintElementData 的 options 嵌套结构，
 * 同时提供扁平访问器方便分页引擎使用。
 */
export interface TemplateElement {
  id: string
  type: string
  /** 元素选项（与前端 ElementOptions 对齐） */
  options: Record<string, any>
  /** 元素类型元数据（与前端 PrintElementTypeMeta 对齐） */
  printElementType?: { type: string; title?: string; [key: string]: any }
  /** 分页属性（非表格元素） */
  pagination?: PaginationConfig
  /** 表格分页配置（表格元素） */
  tablePagination?: TablePaginationConfig
}

// ─── Excel 风格表格渲染行（数据绑定展开后的产物） ───

export type RenderRowType = 'header' | 'data' | 'summary' | 'subtotal' | 'static'

export interface RenderCellBorder {
  width: number   // pt
  style: string
  color: string
}

export interface RenderCellBorders {
  top?: RenderCellBorder
  right?: RenderCellBorder
  bottom?: RenderCellBorder
  left?: RenderCellBorder
}

/** 绑定后的单元格：content 已是最终文本（小计行 content 为占位值，真实值按每页数据渲染时求值） */
export interface RenderCell {
  content: string
  /** 小计行专用：单元格原始 formatter 表达式，渲染阶段以当前页数据行上下文求值 */
  rawFormatter?: string
  /** 内容类型：text（默认）/ barcode / qrcode / image，非 text 时 content 为码值或图片 URL */
  cellType?: string
  /** 条形码码制（jsbarcode 格式名），仅 cellType='barcode' 时生效 */
  barcodeType?: string
  /** 二维码纠错级别 L/M/Q/H，仅 cellType='qrcode' 时生效 */
  qrCodeLevel?: string
  /** 条形码下方是否显示文本，仅 cellType='barcode' 时生效 */
  showBarcodeText?: boolean
  /** 图片缩放模式，仅 cellType='image' 时生效 */
  fit?: string
  /** 图片最大宽度（mm），仅 cellType='image' 时生效 */
  maxWidth?: number
  /** 图片最大高度（mm），仅 cellType='image' 时生效 */
  maxHeight?: number
  rowspan: number
  colspan: number
  merged: boolean
  align?: string
  valign?: string
  fontSize?: number       // pt
  fontWeight?: string
  color?: string
  backgroundColor?: string
  borders?: RenderCellBorders
  padding?: number        // mm
  wordWrap?: boolean
}

/** 绑定后的渲染行，存入 options._renderRows */
export interface RenderRow {
  type: RenderRowType
  height: number          // mm，min-height 语义
  cells: RenderCell[]
}


// ─── 条码/二维码渲染器（依赖注入，解耦 Node/browser 实现） ───

export interface CodeRenderOptions {
  /** 条形码码制（jsbarcode 格式名），仅 barcode 类型使用 */
  barcodeType?: string
  /** 二维码纠错级别 L/M/Q/H，仅 qrcode 类型使用 */
  qrCodeLevel?: string
  /** 条形码下方是否显示文本 */
  showText?: boolean
  /** 条码模块宽度倍率 */
  barWidth?: number
  /** 条码下方文本字号（pt） */
  fontSize?: number
}

/**
 * 码值 → SVG 字符串渲染器。
 * 服务端由 print-render 用 bwip-js 实现；浏览器由 print-canvas 用 jsbarcode/qrcode 实现。
 * 码值非法时抛出异常，由调用方降级为文本占位。
 */
export interface CodeRenderer {
  render(value: string, cellType: 'barcode' | 'qrcode', opts?: CodeRenderOptions): string
}

// ─── 渲染请求 / 响应 ───

export interface RenderRequest {
  templateJson: TemplateData
  printData?: Record<string, any>
  /** 服务端对外访问 base URL，用于把 /docfiles/... 等相对路径图片拼接为完整地址 */
  baseUrl?: string
}

export interface RenderError {
  code: string
  message: string
}

// ─── 测量结果 ───

export interface MeasuredElement {
  id: string
  measuredHeight: number // mm
  /** 表格每行实际高度（mm），仅表格元素有值 */
  measuredRowHeights?: number[]
  /** 重复表头段实际高度（mm）= 前 _repeatHeaderCount 个渲染行高之和，仅表格元素有值 */
  repeatHeaderHeight?: number
}

// ─── 分页输出 ───

export interface PageLayout {
  pageIndex: number
  sections: PageSection[]
}

export interface PageSection {
  elementId: string
  type: 'element' | 'table-slice' | 'flow-group'
  /** table-slice 专用：渲染行起始索引（含表头行） */
  startRow?: number
  /** table-slice 专用：渲染行结束索引（不含） */
  endRow?: number
  /** table-slice 专用：非首片时在切片前重复表头段 */
  repeatHeader?: boolean
  /** table-slice 专用：本片末尾是否渲染小计行（当前页数据小计，每页重复） */
  subtotal?: boolean
  /** table-slice 专用：本片末尾是否渲染整表汇总行（总计，仅最后一页） */
  summary?: boolean
  /** 本节在本页内容区内的实际 top（mm）。发生换页后的内容为 0；缺省回退元素设计 top */
  renderTop?: number
  /**
   * flow-group 专用：相对容器在本页的实际 top（mm），覆盖元素设计 top。
   * 同页时 = 表格设计 top（容器顶部对齐表格 slice 顶部）；
   * 跟随区整体移页时 = 新页内容区顶部（0）。
   */
  groupTop?: number
  /** flow-group 专用：跟随区成员元素 id（容器内按文档流渲染） */
  followElementIds?: string[]
}

// ─── 纸张辅助 ───

/** 获取纸张物理尺寸（考虑方向） */
export function getPaperDimensions(template: TemplateData): { width: number; height: number } {
  const base = template.paperSize === 'CUSTOM'
    ? { width: template.customWidth ?? 210, height: template.customHeight ?? 297 }
    : PAPER_DIMENSIONS[template.paperSize]
  if (template.orientation === 'landscape') {
    return { width: base.height, height: base.width }
  }
  return { ...base }
}
