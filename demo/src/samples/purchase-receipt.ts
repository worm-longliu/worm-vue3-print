// demo/src/samples/purchase-receipt.ts
// 示例一：采购收货单（沿用 demo 原有默认模板与业务字段/数据）
import { DEFAULT_DEMO_DATA } from '@worm-vue3-print/canvas'
import type { TemplateData } from '@worm-vue3-print/canvas'
import type { SampleTemplate } from './types'
import rawTemplate from '../template-purchase-receipt.json'
import { PURCHASE_RECEIPT_FIELDS } from '../business'
import { deriveBatchData } from '../batch-data'

/** 采购收货单示例：A5 横向 + 明细表格分页 + 每页小计 */
export const PURCHASE_RECEIPT_SAMPLE: SampleTemplate = {
  id: 'purchase-receipt',
  name: '采购收货单',
  group: '单据',
  desc: '供应商收货凭证：抬头信息区 + 明细表格 + 每页小计与整表合计，用于验证多页分页。',
  paper: 'A5 横向 · 190mm 版心',
  fields: PURCHASE_RECEIPT_FIELDS,
  data: DEFAULT_DEMO_DATA as Record<string, any>,
  batchData: deriveBatchData(DEFAULT_DEMO_DATA as Record<string, any>),
  template: rawTemplate as unknown as TemplateData,
}
