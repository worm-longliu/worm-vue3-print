// 付款申请单：140×240mm 横向，动态明细每页 4 条、每页小计，付款方式同页按值合并。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import rawData from '../payment-request.data.json'
import rawTemplate from '../template-payment-request.json'
import type { SampleTemplate } from './types'

export const PAYMENT_REQUEST_FIELDS: PrintBusinessField[] = [
  { id: 'pr-1', fieldKey: 'applicationNo', fieldLabel: '单据编号', fieldType: 'string', sortOrder: 1 },
  { id: 'pr-2', fieldKey: 'department', fieldLabel: '申请部门', fieldType: 'string', sortOrder: 2 },
  { id: 'pr-3', fieldKey: 'applyDate', fieldLabel: '申请日期', fieldType: 'date', sortOrder: 3 },
  { id: 'pr-4', fieldKey: 'applicant', fieldLabel: '经办人', fieldType: 'string', sortOrder: 4 },
  { id: 'pr-5', fieldKey: 'attachmentCount', fieldLabel: '附件数量', fieldType: 'number', sortOrder: 5 },
  { id: 'pr-6', fieldKey: 'payeeName', fieldLabel: '收款单位', fieldType: 'string', sortOrder: 6 },
  { id: 'pr-7', fieldKey: 'bankName', fieldLabel: '开户银行', fieldType: 'string', sortOrder: 7 },
  { id: 'pr-8', fieldKey: 'bankAccount', fieldLabel: '开户账号', fieldType: 'string', sortOrder: 8 },
  { id: 'pr-9', fieldKey: 'taxNumber', fieldLabel: '税号', fieldType: 'string', sortOrder: 9 },
  { id: 'pr-10', fieldKey: 'projectName', fieldLabel: '项目名称', fieldType: 'string', sortOrder: 10 },
  { id: 'pr-11', fieldKey: 'contractNo', fieldLabel: '合同号', fieldType: 'string', sortOrder: 11 },
  { id: 'pr-12', fieldKey: 'contractTotal', fieldLabel: '合同总金额', fieldType: 'number', sortOrder: 12 },
  { id: 'pr-13', fieldKey: 'paidTotal', fieldLabel: '累计已支付金额', fieldType: 'number', sortOrder: 13 },
  { id: 'pr-14', fieldKey: 'items', fieldLabel: '付款项目明细', fieldType: 'list', sortOrder: 14 },
  { id: 'pr-15', fieldKey: 'items.summary', fieldLabel: '付款项目摘要', fieldType: 'string', sortOrder: 15 },
  { id: 'pr-16', fieldKey: 'items.amount', fieldLabel: '付款金额', fieldType: 'number', sortOrder: 16 },
  { id: 'pr-17', fieldKey: 'items.paymentMethod', fieldLabel: '付款方式', fieldType: 'string', sortOrder: 17 },
  { id: 'pr-18', fieldKey: 'items.remark', fieldLabel: '备注', fieldType: 'string', sortOrder: 18 },
]

export const PAYMENT_REQUEST_SAMPLE: SampleTemplate = {
  id: 'payment-request',
  name: '付款申请单',
  group: '单据',
  desc: '付款明细每页 4 条并输出本页合计，收款信息与审批栏跨页重复，付款方式在同页按值合并、跨页重显。',
  paper: '140×240mm 横向 · 3 页（4/4/2 条明细）',
  fields: PAYMENT_REQUEST_FIELDS,
  data: rawData,
  template: rawTemplate as unknown as TemplateData,
}
