import type { ElementType } from '@worm-vue3-print/core/designer'
import { BLOCKED_ELEMENT_TYPES } from '@worm-vue3-print/core/designer'

export interface ElementKindInfo {
  type: ElementType
  /** core 封禁的元素类型（html 可注入任意标记，不进 AI 生成面） */
  blocked: boolean
  /** 该类型必须显式给出的 option 键，缺了会出空纸或排不进去 */
  requiredOptionKeys: string[]
  notes: string
}

const RAW: Array<Omit<ElementKindInfo, 'blocked'>> = [
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
]

export const ELEMENT_KINDS: readonly ElementKindInfo[] = RAW.map(info => ({
  ...info,
  blocked: BLOCKED_ELEMENT_TYPES.includes(info.type),
}))
