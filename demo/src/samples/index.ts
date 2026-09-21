// demo/src/samples/index.ts
// 示例模板库注册表：全部示例使用静态内置数据，新增示例只需在此追加一项。
//
// 新增示例的排版约束（渲染管线的硬规则，踩过一次就别再踩）：
// 1. 固定纸模板纵向要留 2mm 分页安全余量——内容底边贴着版心底边会被判到第二页，
//    拼版模板更会直接报「拼版要求每份标签恰好 1 页」而拒绝出纸。
// 2. 表格 tableColWidths 之和必须等于元素宽度、tableRows 行高之和必须等于元素高度，
//    每行单元格数必须等于列数（设计器加载时会按列宽/行高重算尺寸）。
import type { SampleGroup, SampleTemplate } from './types'
import { PURCHASE_RECEIPT_SAMPLE } from './purchase-receipt'
import { SALES_OUTBOUND_SAMPLE } from './sales-outbound'
import { EXPRESS_WAYBILL_SAMPLE } from './express-waybill'
import { WEIGHT_LABEL_SAMPLE } from './weight-label'
import { PRICE_LABEL_SAMPLE } from './price-label'
import { ASSET_TAG_SAMPLE } from './asset-tag'
import { THERMAL_RECEIPT_SAMPLE } from './thermal-receipt'
import { COMPREHENSIVE_SHOWCASE_SAMPLE } from './comprehensive-showcase'

export type { SampleTemplate, SampleGroup }

/** 示例库：单据 → 标签 → 小票 */
export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  PURCHASE_RECEIPT_SAMPLE,
  SALES_OUTBOUND_SAMPLE,
  EXPRESS_WAYBILL_SAMPLE,
  COMPREHENSIVE_SHOWCASE_SAMPLE,
  WEIGHT_LABEL_SAMPLE,
  PRICE_LABEL_SAMPLE,
  ASSET_TAG_SAMPLE,
  THERMAL_RECEIPT_SAMPLE,
]

/** 分组顺序（弹窗筛选项） */
export const SAMPLE_GROUPS: SampleGroup[] = ['单据', '标签', '小票']

/** 按分组过滤 */
export function listSamples(group?: SampleGroup | '全部'): SampleTemplate[] {
  if (!group || group === '全部') return SAMPLE_TEMPLATES
  return SAMPLE_TEMPLATES.filter(s => s.group === group)
}

/** 按 id 取示例 */
export function getSampleById(id: string): SampleTemplate | undefined {
  return SAMPLE_TEMPLATES.find(s => s.id === id)
}
