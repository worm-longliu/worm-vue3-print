// print-core/src/render/types.ts
// 打印渲染管线类型定义（同构：Node 服务端与浏览器预览共用）

// type-only：仅借用批量数据联合类型，编译后擦除，无运行时模块依赖
import type { PrintDataInput } from '../print/normalize-print-data.js'

// ─── 纸张 ───

export type PaperSize =
  | 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal'
  // 针式打印纸（241 系列）：全等分（整张）/ 二等分 / 三等分
  | 'DOT_FULL' | 'DOT_HALF' | 'DOT_THIRD'
  // 标签纸
  | 'LABEL_80X60' | 'LABEL_60X40' | 'LABEL_40X30'
  // 小票纸（热敏卷纸）：宽度即纸宽，出纸高度按内容推导
  | 'THERMAL_57' | 'THERMAL_80' | 'THERMAL_110'
  | 'CUSTOM' | 'CONTINUOUS'

/** 连续纸纸型：出纸高度按渲染内容推导 */
export type ContinuousPaperSize = 'CONTINUOUS' | 'THERMAL_57' | 'THERMAL_80' | 'THERMAL_110'

/** 固定尺寸纸型：纸面确定，可作拼版目标纸等需要确定纸面的场景 */
export type SheetPaperSize = Exclude<PaperSize, ContinuousPaperSize>

/** 纸张尺寸映射（mm） */
export const PAPER_DIMENSIONS: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  // 针式打印纸（241 系列等分）：11 英寸整张 279.4mm 按等分取整
  DOT_FULL: { width: 241, height: 279.4 },
  DOT_HALF: { width: 241, height: 139.7 },
  DOT_THIRD: { width: 241, height: 93.1 },
  // 标签纸
  LABEL_80X60: { width: 80, height: 60 },
  LABEL_60X40: { width: 60, height: 40 },
  LABEL_40X30: { width: 40, height: 30 },
  // 小票纸（热敏卷纸）：高度仅为设计画布高度，出纸按内容推导
  THERMAL_57: { width: 57, height: 297 },
  THERMAL_80: { width: 80, height: 297 },
  THERMAL_110: { width: 110, height: 297 },
  CUSTOM: { width: 210, height: 297 },
  // 连续纸：默认 80mm 热敏；高度仅为设计画布高度，出纸按内容推导
  CONTINUOUS: { width: 80, height: 297 },
}

const CONTINUOUS_PAPER_SIZES: ReadonlySet<string> = new Set<ContinuousPaperSize>([
  'CONTINUOUS', 'THERMAL_57', 'THERMAL_80', 'THERMAL_110',
])

/** 纸型是否连续纸（小票纸/热敏卷纸）：出纸高度按渲染内容推导 */
export function isContinuousPaperSize(paperSize: string): boolean {
  return CONTINUOUS_PAPER_SIZES.has(paperSize)
}

// ─── 模板数据模型（PRD 3.2 节） ───

export interface TemplateData {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  /**
   * 出纸旋转角度（整页内容旋转出纸）：缺省 0（不旋转）。仅固定纸（非连续纸、非拼版）生效。
   * 0° 纸张不变、内容不旋转；180° 纸张不变、内容翻转；90°/270° 纸张长宽互换以贴合旋转后的内容包围盒，
   * 设计稿内容保持原方向不变，不被拉伸或裁切。
   */
  outputRotation?: 0 | 90 | 180 | 270
  /** 自定义纸张宽度（mm），paperSize='CUSTOM' 时生效；连续纸（含小票纸）时为纸宽，缺省取预设纸宽 */
  customWidth?: number
  /** 自定义纸张高度（mm），仅 paperSize='CUSTOM' 时生效；连续纸（含小票纸）时仅作设计画布高度（缺省 297，出纸按内容推导） */
  customHeight?: number
  /** 页面（纸张）背景色；未设置时默认白色 */
  pageBackground?: string
  /** 水印配置（同 design/WatermarkOptions，渲染端读取其颜色/透明度/角度/密度/绑定） */
  watermark?: import('../designer/types.js').WatermarkOptions
  /** 页面名称（多页面模板中用于设计器页签与错误上下文；渲染端忽略） */
  name?: string
  /** 模板级字体声明：三端据此生成同一份 @font-face，不依赖各端系统字体 */
  fonts?: import('../print/fonts.js').PrintFontDeclaration[]
  /** 拼版打印配置（模板级）；缺省不写 = 不拼版 */
  tiling?: import('../print/tiling.js').TilingOptions
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
  /** 字体族名；未设置时单元格不输出 font-family，交还 CSS 继承 */
  fontFamily?: string
  fontWeight?: string
  color?: string
  backgroundColor?: string
  borders?: RenderCellBorders
  padding?: number        // mm
  wordWrap?: boolean
  /** 文字溢出显示形式；缺省按「不换行→截断，否则自适应行高」判定 */
  textFit?: string
  /** 自动缩小（textFit='shrink'）的下限字号（pt）；缺省 6pt */
  shrinkMinFontSize?: number
  /** 自动缩小求得的最终字号（pt）：测量趟算出后回写，最终趟据此渲染 */
  fittedFontSize?: number
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
 * 三端统一由 core 的 DOM 执行器实现（jsbarcode/qrcode 算法只有一份）：
 * 浏览器进程内直调，服务端与桌面客户端注入 IIFE 产物后在页面上下文执行。
 * 码值非法时抛出异常，由调用方降级为文本占位。
 */
export interface CodeRenderer {
  render(value: string, cellType: 'barcode' | 'qrcode', opts?: CodeRenderOptions): string
}

// ─── 渲染请求 / 响应 ───

export interface RenderRequest {
  /** 模板 JSON：单模板或 { pages } 多页面模板 */
  templateJson: TemplateData | MultiPageTemplateData
  /** 业务数据：对象=单份；非空对象数组=批量（数组长度即份数，上限 500） */
  printData?: PrintDataInput
  /** 服务端对外访问 base URL，用于把 /docfiles/... 等相对路径图片拼接为完整地址 */
  baseUrl?: string
  /** 相对路径字体基址；缺省回落 `baseUrl`（缺省时二者同域），传空串表示不拼接 */
  fontBaseUrl?: string
  /** 宿主纸张覆盖（mm）：宽/高沿用 print.paperSize 语义，0 或负数视为未提供 */
  paperOverride?: { width?: number; height?: number }
  /** 连续纸显式纸高（mm）逃生门 */
  paperHeightMm?: number
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
  /**
   * 本页含「分页预算放不下、被强制留在本页」的内容（首个元素/单元即放不下）。
   * 该场景不产出空白页，但内容可能超出纸面，需由上层（如拼版「每份恰好 1 页」校验）据此阻断。
   */
  overflow?: boolean
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

/**
 * 获取纸张物理尺寸（考虑方向）。
 * - CUSTOM：宽高取 customWidth/customHeight，缺省回退 A4；
 * - 连续纸（小票纸/热敏卷纸）：强制纵向，宽度取 customWidth（缺省取预设纸宽），
 *   高度仅为设计画布高度（取 customHeight，缺省取预设值），出纸高度由内容推导；
 * - 其余预设：取 PAPER_DIMENSIONS，横向时宽高互换。
 * 参数刻意只用纸张相关字段——不需要 elements，故设计器侧与渲染侧模板均可直接传入。
 */
export function getPaperDimensions(template: {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  customWidth?: number
  customHeight?: number
}): { width: number; height: number } {
  const continuous = isContinuousPaperSize(template.paperSize)
  const base = template.paperSize === 'CUSTOM' || continuous
    ? {
        width: template.customWidth ?? PAPER_DIMENSIONS[template.paperSize].width,
        height: template.customHeight ?? PAPER_DIMENSIONS[template.paperSize].height,
      }
    : PAPER_DIMENSIONS[template.paperSize]
  // 连续纸只有纵向
  if (template.orientation === 'landscape' && !continuous) {
    return { width: base.height, height: base.width }
  }
  return { ...base }
}

/**
 * 实际出纸纸张尺寸（考虑出纸旋转角度 outputRotation）。
 * - 连续纸（小票纸/热敏卷纸）/拼版：无出纸旋转概念，直接返回设计稿纸张尺寸（见 getPaperDimensions）；
 * - 其余固定纸：0°/180° 纸张长宽不变（内容旋转或翻转）；90°/270° 内容包围盒为 Hd×Wd，
 *   需交换纸张长宽以贴合旋转后的内容，即「设计稿横向排版、竖向出纸」场景：出纸页为竖向纸，内容整页旋转填入。
 */
export function getOutputPaperDimensions(template: {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  outputRotation?: 0 | 90 | 180 | 270
  customWidth?: number
  customHeight?: number
  tiling?: { enabled?: boolean } | undefined
}): { width: number; height: number } {
  const continuous = isContinuousPaperSize(template.paperSize)
  if (continuous || template.tiling?.enabled === true) {
    return getPaperDimensions(template)
  }
  const design = getPaperDimensions(template)
  // 90/270 旋转后内容包围盒为 Hd×Wd，交换纸张长宽贴合；0/180 纸张不变
  const swap = template.outputRotation === 90 || template.outputRotation === 270
  return swap ? { width: design.height, height: design.width } : design
}

/**
 * 当前出纸旋转角度（0/90/180/270）；连续纸/拼版强制 0（无旋转概念）。
 */
export function getOutputRotationAngle(template: {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  outputRotation?: 0 | 90 | 180 | 270
  tiling?: { enabled?: boolean } | undefined
}): 0 | 90 | 180 | 270 {
  const continuous = isContinuousPaperSize(template.paperSize)
  if (continuous || template.tiling?.enabled === true) return 0
  return template.outputRotation ?? 0
}

/**
 * 是否需要在最终出纸时旋转整页：出纸旋转角度非 0，且仅固定纸（非连续纸、非拼版）生效。
 * 连续纸强制纵向、拼版按目标纸铺格，二者都不存在「出纸旋转」概念。
 */
export function shouldApplyOutputRotation(template: {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  outputRotation?: 0 | 90 | 180 | 270
  tiling?: { enabled?: boolean } | undefined
}): boolean {
  const continuous = isContinuousPaperSize(template.paperSize)
  if (continuous || template.tiling?.enabled === true) return false
  return template.outputRotation != null && template.outputRotation !== 0
}

/** 是否连续纸（热敏/小票/标签卷纸）：出纸高度按渲染内容推导 */
export function isContinuousPaper(template: { paperSize: string }): boolean {
  return isContinuousPaperSize(template.paperSize)
}

// ─── 多页面模板（固定顺序版式组合：各页独立版式、共用同一份数据） ───

export interface MultiPageTemplateData {
  /** 版本号，缺省 1 */
  version?: 1
  /** 按打印顺序排列的页面模板，每个都是完整的单页 TemplateData */
  pages: TemplateData[]
}
