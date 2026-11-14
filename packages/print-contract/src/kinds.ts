import type { BuiltinElementType } from '@worm-vue3-print/core/designer'
import { BLOCKED_ELEMENT_TYPES, getElementPlugins } from '@worm-vue3-print/core/designer'

export interface ElementKindInfo {
  /** 元素类型字符串：内置项或运行时注册的插件类型（后者不一定在 TS 联合里） */
  type: string
  /** core 封禁的元素类型（html 可注入任意标记，不进 AI 生成面） */
  blocked: boolean
  /** 该类型必须显式给出的 option 键，缺了会出空纸或排不进去 */
  requiredOptionKeys: string[]
  notes: string
  /** 由插件注册的类型标记，便于 AI 与宿主区分内置能力 */
  pluginId?: string
}

/** 主体内置类型的说明文字：唯一的静态清单，注册态由 getElementKinds 叠加 */
const RAW: Array<Omit<ElementKindInfo, 'blocked'> & { type: BuiltinElementType }> = [
  { type: 'text', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '单行/短文本；formatter 用 {字段} 或 {FUNC(字段)}' },
  { type: 'longText', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '多行文本，默认 textFit=autoHeight 会撑高' },
  { type: 'table', requiredOptionKeys: ['left', 'top', 'width', 'height', 'tableRows', 'tableColWidths'], notes: '动态表格：data 行唯一，列宽合计须等于元素宽' },
  { type: 'flowList', requiredOptionKeys: ['left', 'top', 'width', 'height', 'flowColumns', 'dataSource'], notes: 'flowColumns 必填，不自动推导' },
  { type: 'image', requiredOptionKeys: ['left', 'top', 'width', 'height', 'src'], notes: 'src 为宿主可访问路径；fit 可选 contain/cover/fill/none/scale-down' },
  { type: 'barcode', requiredOptionKeys: ['left', 'top', 'width', 'height', 'formatter'], notes: '尺寸由条宽→dpi 结算，条宽优先、条高让位；printerDpi 建议 203/300/600' },
  { type: 'qrcode', requiredOptionKeys: ['left', 'top', 'width', 'height', 'formatter'], notes: 'qrCodeLevel L/M/Q/H；合规静区显式写 qrQuietZone=4' },
  { type: 'hline', requiredOptionKeys: ['left', 'top', 'width'], notes: '横线用 width 表达长度，height 不参与' },
  { type: 'vline', requiredOptionKeys: ['left', 'top', 'height'], notes: '竖线用 height 表达长度' },
  { type: 'rect', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '矩形/边框块' },
  { type: 'oval', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '椭圆' },
  { type: 'html', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '可注入任意标记，AI 生成面封禁' },
  { type: 'pageNumber', requiredOptionKeys: ['left', 'top', 'width', 'height'], notes: '页码变量到分页最终趟才求值，写 {pageIndex}/{totalPages}（core data-binder.ts:344）' },
  // 扩展元素种类（如 ECharts 图表）由插件描述符提供，getElementKinds() 按注册态叠加
]

const blocked = (type: string) => (BLOCKED_ELEMENT_TYPES as readonly string[]).includes(type)

/** 内置能力静态基线（无插件注册时等价于 getElementKinds()） */
export const ELEMENT_KINDS: readonly ElementKindInfo[] = RAW.map(info => ({
  ...info,
  blocked: blocked(info.type),
}))

/**
 * 动态种类清单：内置项 ∪ 当前进程已注册的插件类型。
 * print_element_kinds 与 print_draft_template 的 enum 共用此函数（设计文档 §0.4 / P1）。
 * 插件若注册了与内置同名的类型，以内置说明为准，避免插件覆盖主体语义。
 */
export function getElementKinds(): ElementKindInfo[] {
  const kinds = [...ELEMENT_KINDS]
  const known = new Set(kinds.map(k => k.type))
  for (const plugin of getElementPlugins()) {
    const { type, id, version, label, notes, requiredOptionKeys, blocked: pluginBlocked } = plugin.kind
    if (!type || known.has(type)) continue
    known.add(type)
    kinds.push({
      type,
      blocked: pluginBlocked ?? blocked(type),
      requiredOptionKeys: [...(requiredOptionKeys ?? ['left', 'top', 'width', 'height'])],
      notes: notes ?? `${label}（插件 ${id}@${version} 提供的自定义元素；专属属性见插件 optionMeta）`,
      pluginId: id,
    })
  }
  return kinds
}

/** 供 MCP 生成 JSON Schema enum：所有可用类型（含 blocked 项，拦截在 draftTemplate 内做） */
export function getElementKindTypes(): string[] {
  return getElementKinds().map(k => k.type)
}
