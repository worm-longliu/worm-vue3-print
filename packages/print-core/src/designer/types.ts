// web/src/components/print/types.ts
// 打印模块全部类型定义，零外部依赖

// ─── 新模板数据模型（PRD 3.2 节） ───

/**
 * 纸张尺寸。
 * - DOT_FULL / DOT_HALF / DOT_THIRD：针式打印纸 241 系列全等分 / 二等分 / 三等分；
 * - LABEL_80X60 / LABEL_60X40 / LABEL_40X30：标签纸；
 * - THERMAL_57 / THERMAL_80 / THERMAL_110：小票纸（热敏卷纸，连续纸，出纸高度按内容推导）；
 * - CONTINUOUS=连续纸（热敏/标签，设计高度固定 297mm，出纸高度按内容推导，底边距用 margins.bottom）。
 * 连续纸（含小票纸）设计高度仅作画布，方向强制纵向，纸宽可用 customWidth 覆盖。
 */
export type PaperSize =
  | 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal'
  | 'DOT_FULL' | 'DOT_HALF' | 'DOT_THIRD'
  | 'LABEL_80X60' | 'LABEL_60X40' | 'LABEL_40X30'
  | 'THERMAL_57' | 'THERMAL_80' | 'THERMAL_110'
  | 'CUSTOM' | 'CONTINUOUS'

/** 元素所属区域（运行时标记，序列化时剥离；区域元素 left/top 相对所在区域左上角，单位 pt） */
export type ElementZone = 'content' | 'header' | 'footer'

/** 元素分页属性（非表格元素） */
export interface PaginationConfig {
  pageable: boolean      // 是否参与分页，默认 true
  keepWithNext: boolean  // 是否与下一元素保持在同一页
}

/** 表格分页配置 */
export interface TablePaginationConfig {
  enabled: boolean        // 是否启用表格分页
}

/** 新模板数据模型（替代旧 PrintPanel / PrintTemplateJson） */
export interface TemplateData {
  paperSize: PaperSize
  /** 方向（纸张方向）= 当前纸张长宽；切换时直接交换纸张宽高（设计稿内容随之铺在该尺寸上） */
  orientation: 'portrait' | 'landscape'
  /**
   * 出纸旋转角度（整页内容旋转出纸）：缺省 0（不旋转）。仅固定纸（非连续纸、非拼版）生效。
   * 0° 纸张不变、内容不旋转；180° 纸张不变、内容翻转；90°/270° 纸张长宽互换以贴合旋转后的内容包围盒，
   * 设计稿内容保持原方向不变，不被拉伸或裁切。
   */
  outputRotation?: 0 | 90 | 180 | 270
  margins: { top: number; right: number; bottom: number; left: number } // mm
  header: {
    height: number // mm
    elements: TemplateElement[]
  }
  footer: {
    height: number // mm
    elements: TemplateElement[]
  }
  firstPageOverlay: {
    height: number // mm
    elements: TemplateElement[]
  }
  elements: TemplateElement[] // 内容区主体元素
  /** 页面名称（多页面模板中用于设计器页签显示；渲染端忽略） */
  name?: string
  /** 模板级字体声明（由设计器 prop 同步写入）：三端据此生成同一份 @font-face */
  fonts?: import('../print/fonts.js').PrintFontDeclaration[]
  /** 拼版打印配置（模板级）；缺省不写 = 不拼版 */
  tiling?: import('../print/tiling.js').TilingOptions
  /** 元素坐标单位（新保存模板固定 'mm'；旧数据无此字段按 pt 迁移） */
  unit?: 'pt' | 'mm'
  /** 自定义纸张宽度（mm），paperSize='CUSTOM' 时有效；连续纸（含小票纸）时为纸宽，缺省取预设纸宽 */
  customWidth?: number
  /** 自定义纸张高度（mm），仅 paperSize='CUSTOM' 时有效；连续纸（含小票纸）时仅作设计画布高度（缺省 297，出纸按内容推导） */
  customHeight?: number
  /** 页面（纸张）背景色；未设置时默认白色 */
  pageBackground?: string
  /** 水印配置 */
  watermark?: WatermarkOptions
  /** 手动参考线（设计态辅助，序列化保留，渲染端忽略） */
  guides?: AlignLine[]
  /** 设计背景（定位底图）：仅设计画布显示，用于套打对位；预览与打印管线一律忽略 */
  designBackground?: DesignBackground
}

/**
 * 多页面模板（设计器侧 wrapper）：pages 为设计器完整模型 TemplateData。
 * 与主入口 render 管线的同名 MultiPageTemplateData（pages 为简化 TemplateData）有意分离，
 * 两侧运行时代表同一份 JSON（{version, pages}），由 canvas 侧经 normalizeTemplate 交给渲染端。
 */
export interface MultiPageTemplateData {
  version?: 1
  pages: TemplateData[]
}

/** 模板元素引用（用于 TemplateData 各区域） */
export type TemplateElement = PrintElementData

// ─── 基础类型 ───

/** 元素类型 */
export type ElementType =
  | 'text' | 'image' | 'longText' | 'table'
  | 'hline' | 'vline' | 'rect' | 'oval'
  | 'barcode' | 'qrcode' | 'html'
  | 'pageNumber'

/** 对齐方式 */
export type TextAlign = 'left' | 'center' | 'right'

/**
 * 文字超出可用空间时的显示形式（文本类元素与表格单元格共用）：
 * - `clip`：截断，超出部分不显示；不换行（`wordWrap=false`）时以省略号收尾
 * - `shrink`：自动缩小字号，缩到下限字号仍放不下则退化为截断
 * - `autoHeight`：自适应高度，元素高度 / 表格行高随内容增高
 *
 * 未显式设置时按元素类型取默认值（text=clip、longText=autoHeight、单元格=autoHeight），
 * 与既有渲染行为一致，存量模板不受影响。
 */
export type TextFit = 'clip' | 'shrink' | 'autoHeight'

/** 垂直对齐方式（文本类元素，未设置时按顶部处理，与打印端一致） */
export type VerticalAlign = 'top' | 'middle' | 'bottom'

/** 缩放手柄方向 */
export type ResizePoint = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** 设计背景（定位底图）：仅设计画布显示，预览/PDF/打印/截图均不输出 */
export interface DesignBackground {
  /** 宿主上传接口返回的完整图片路径，可直接用于 <img src> */
  src: string
  /** 旋转角度，仅允许 90° 步进；非法值读取时按 0 处理 */
  rotation: 0 | 90 | 180 | 270
}

/** 引导线 */
export interface AlignLine {
  type: 'vertical' | 'horizontal'
  position: number
  id?: string
  /** 引导线颜色(区分左/中/右对齐类型) */
  color?: string
}

/** 吸附结果 */
export interface AdsorbResult {
  left: number
  top: number
  lines: AlignLine[]
}

/** 元素矩形（用于吸附检测） */
export interface ElementRect {
  id: string
  left: number
  top: number
  width: number
  height: number
}

// ─── Excel 风格表格矩阵模型 ───

/** 表格行类型：header 标题 / data 数据（全表唯一） / subtotal 当前页小计（每页末尾） / summary 整表汇总 */
export type TableRowType = 'header' | 'data' | 'subtotal' | 'summary'

/** 单边边框样式 */
export interface TableCellBorder {
  width: number   // pt
  style: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'
  color: string
}

/** 四边边框 */
export interface TableCellBorders {
  top?: TableCellBorder
  right?: TableCellBorder
  bottom?: TableCellBorder
  left?: TableCellBorder
}

/** 单元格内容类型 */
export type TableCellType = 'text' | 'barcode' | 'qrcode' | 'image'

/** 单元格 */
export interface TableCell {
  id: string
  formatter?: string          // 表达式模板：data 行 {field}；subtotal/summary 行 {MONEY(SUM(field))}（subtotal 聚合当前页数据）；header 行 "文本: {field}"
  cellType?: TableCellType    // 内容类型，缺省 text
  barcodeType?: string        // 条形码码制（jsbarcode 格式名），仅 cellType='barcode' 时生效
  qrCodeLevel?: string        // 二维码纠错级别 L/M/Q/H，仅 cellType='qrcode' 时生效
  showBarcodeText?: boolean   // 条形码下方是否显示文本，仅 cellType='barcode' 时生效
  /**
   * 打印机分辨率（点/英寸，常见 203/300/600），仅 cellType='barcode' 时生效：
   * 条形码尺寸由「条宽 → dpi → 等比缩小」结算（见 render/barcode-dot.ts），
   * 给出本字段时首选尺寸吸附到整数打印点（dpi 优先于条宽的精确毫米值），
   * 单元格可用宽高不足则整体等比缩小，消除热敏出纸「条宽忽宽忽窄」。
   */
  printerDpi?: number
  /** 条码模块宽度倍率（2-4），仅 cellType='barcode' 时生效：每模块首选宽度 = 倍率/2 × 0.25mm */
  barWidth?: number
  /** 条码下方文本字号（相对条高，条高为 30），仅 cellType='barcode' 时生效 */
  barFontSize?: number
  rowspan?: number            // 默认 1
  colspan?: number            // 默认 1
  merged?: boolean            // true = 被合并覆盖的占位格
  align?: TextAlign
  valign?: 'top' | 'middle' | 'bottom'
  fontFamily?: string         // 字体
  fontSize?: number           // pt
  fontWeight?: string
  color?: string
  backgroundColor?: string
  borders?: TableCellBorders
  padding?: number            // mm
  wordWrap?: boolean          // 默认 true
  /** 文字溢出显示形式；缺省按「不换行→截断，否则自适应行高」判定 */
  textFit?: TextFit
  /** 自动缩小（textFit='shrink'）的下限字号（pt）；缺省 6pt */
  shrinkMinFontSize?: number
  // 图片类型特有属性
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'  // 缩放模式，默认 contain
  maxWidth?: number     // 最大宽度（mm）
  maxHeight?: number    // 最大高度（mm）
}

/** 表格行 */
export interface TableRow {
  id: string
  type: TableRowType
  height: number              // mm，min-height 语义
  repeatOnPage?: boolean      // 仅 header 行有效
  cells: TableCell[]          // 长度恒等于列数
}

/** 单元格选区（r/c 均为 0 基，闭区间） */
export interface TableSelection {
  elementId: string
  r1: number
  c1: number
  r2: number
  c2: number
}

/** 表格历史字段绑定（兼容存量模板，实际取 fields[0].dataSource） */
export interface ElementFieldBinding {
  text?: string
  dataSource?: string
}

/** 元素选项（序列化到 JSON） */
export interface ElementOptions {
  left: number
  top: number
  width: number
  height: number
  /** @deprecated 统一使用 formatter */
  title?: string
  testData?: string
  fontSize?: number
  fontWeight?: string
  fontFamily?: string
  color?: string
  backgroundColor?: string
  textAlign?: TextAlign
  verticalAlign?: VerticalAlign
  lineHeight?: number
  letterSpacing?: number
  /** 文字溢出显示形式（text/longText）；缺省按元素类型取默认值 */
  textFit?: TextFit
  /** 自动缩小（textFit='shrink'）的下限字号（pt）；缺省 6pt */
  shrinkMinFontSize?: number
  /** 自动换行（text/longText）；缺省 true。false 时单行显示，截断形式下以省略号收尾 */
  wordWrap?: boolean
  fixed?: boolean
  locked?: boolean
  /** 元素可见性（图层面板切换） */
  visible?: boolean
  borderWidth?: number
  borderStyle?: string
  borderColor?: string
  contentPaddingLeft?: number
  contentPaddingTop?: number
  contentPaddingRight?: number
  contentPaddingBottom?: number
  textDecoration?: string
  textType?: 'barcode' | 'qrcode'
  barcodeType?: string
  barWidth?: number
  barAutoWidth?: string
  /**
   * 打印机分辨率（点/英寸，常见 203/300/600）：条形码尺寸由「条宽 → dpi → 等比缩小」结算
   * （见 render/barcode-dot.ts），给出本字段时首选尺寸吸附到整数打印点，dpi 优先于条宽的
   * 精确毫米值；可用框放不下则整体等比缩小。缺省不启用（按条宽的毫米值落纸）。
   */
  printerDpi?: number
  qrCodeLevel?: string
  src?: string
  /** 内容缩放模式（image/qrcode）：contain | cover | fill | none | scale-down。条形码不接受拉伸——尺寸已由结算确定 */
  fit?: string
  /** 内容最大宽度（mm，image/barcode/qrcode）；缺省不限制 */
  maxWidth?: number
  /** 内容最大高度（mm，image/barcode/qrcode）；缺省不限制 */
  maxHeight?: number
  hideTitle?: boolean
  draggable?: boolean
  axis?: string
  transform?: number
  zIndex?: number
  groupId?: string
  // 分页属性（非表格元素）
  pagination?: PaginationConfig
  // 表格分页配置（表格元素）
  tablePagination?: TablePaginationConfig
  // Excel 风格表格矩阵模型
  /** @deprecated 静态布局模式已移除，所有表格统一使用动态模式 */
  tableMode?: 'dynamic' | 'static'       // 默认 dynamic
  tableRows?: TableRow[]
  tableColWidths?: number[]              // 列宽 mm
  tableDefaultFontSize?: number          // 单元格未设置时的继承基线
  tableDefaultColor?: string
  tableDefaultPadding?: number           // mm
  /** 列表数据源路径（data 行迭代的数据数组） */
  dataSource?: string
  /** @deprecated 兼容存量表格模型；列表数据源优先使用 dataSource */
  fields?: ElementFieldBinding[]
  formatter?: string
  styler?: string
  rowStyler?: string
  // 长文本特有
  longTextIndent?: number
  leftSpaceRemoved?: boolean
  lHeight?: number
}

/** 元素类型元数据 */
export interface PrintElementTypeMeta {
  title?: string
  type: ElementType
  editable?: boolean
  formatter?: string
  styler?: string
}

/** 序列化元素数据 */
export interface PrintElementData {
  id?: string
  type?: ElementType
  options: ElementOptions
  printElementType: PrintElementTypeMeta
}

/** 水印配置 */
export interface WatermarkOptions {
  /** 水印模式：fixed=固定文本，binding=绑定字段 */
  mode?: 'fixed' | 'binding'
  /** 固定文本（mode=fixed 时使用） */
  content?: string
  /** 绑定字段（mode=binding 时使用） */
  binding?: string
  /** 测试值（设计态预览使用） */
  testData?: string
  /** 旋转角度 */
  rotate?: number
  /** 颜色 */
  color?: string
  /** 透明度 */
  opacity?: number
  /** 显示时间戳 */
  timestamp?: boolean
  /** 时间格式（timestamp=true 时使用，token 支持 YYYY/MM/DD/HH/mm/ss） */
  format?: string
  /** 平铺瓦片宽度（px，控制水印密度：越小越密，默认 260，下限 140） */
  tileWidth?: number
  /** 平铺瓦片高度（px，控制水印密度：越小越密，默认 180，下限 100） */
  tileHeight?: number
}

/** 运行时元素（设计器中带状态） */
export interface RuntimeElement {
  id: string
  options: ElementOptions
  printElementType: PrintElementTypeMeta
  selected?: boolean
  /** 运行时所属区域，序列化时剥离，缺省视为 content */
  zone?: ElementZone
}

/** 业务字段（宿主查询后传入，核心不内置字段字典） */
export interface PrintBusinessField {
  id?: string
  fieldKey: string
  fieldLabel: string
  /** 字段类型；'list' 表示明细列表字段（用于表格数据源选择） */
  fieldType: string
  sortOrder: number
}

/**
 * 绑定位置描述（用于属性面板自动渲染绑定控件）
 */
export interface BindingDescriptor {
  /** 绑定的属性路径（如 'options.formatter'、'options.tableRows[0].cells[0].formatter'） */
  targetPath: string
  /** 显示名称 */
  label: string
  /** 数据源上下文 */
  dataSource: 'main' | 'list' | 'subtotal' | 'summary'
  /** 绑定的列表字段（仅表格行需要） */
  listField?: string
  /** 提示文本 */
  placeholder?: string
  /** 是否允许清空 */
  clearable?: boolean
}
// ─── 宿主能力注入：开源核心不直接发起网络请求，以下能力由宿主实现后注入 ───

/** 截图请求载荷（设计器叠层对比用） */
export interface ScreenshotRequest {
  templateJson: TemplateData
  printData: Record<string, any>
}

/** 截图适配器：宿主依据模板 + 数据返回 PNG Blob */
export type RequestScreenshotFn = (req: ScreenshotRequest) => Promise<Blob>

/** 图片上传适配器：宿主上传文件并返回可访问的图片 URL */
export type UploadImageFn = (file: File) => Promise<string>

/**
 * 设计背景图上传适配器（由宿主实现注入）。
 * 入参为用户选择的图片文件；返回值必须是可直接 <img src> 访问的完整图片路径。
 * 与 UploadImageFn 语义独立：不配合 baseUrl，不要求相对路径。
 */
export type UploadDesignBackgroundFn = (file: File) => Promise<string>
