// demo/src/samples/comprehensive-showcase.ts
// 综合示例模板：A4 横向 + 多级表头（跨列分组 / 跨行合并）+ 表格内图片、条形码、二维码同表混排。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import type { SampleTemplate } from './types'
import rawTemplate from '../template-comprehensive-showcase.json'

/** 业务字段树：单据抬头 + 明细行字段（图片/条码/二维码均为行内字段） */
export const COMPREHENSIVE_FIELDS: PrintBusinessField[] = [
  { id: 'cs-1', fieldKey: 'doc', fieldLabel: '单据信息', fieldType: 'string', sortOrder: 1 },
  { id: 'cs-2', fieldKey: 'doc.no', fieldLabel: '单据编号', fieldType: 'string', sortOrder: 2 },
  { id: 'cs-3', fieldKey: 'doc.date', fieldLabel: '单据日期', fieldType: 'date', sortOrder: 3 },
  { id: 'cs-4', fieldKey: 'doc.warehouse', fieldLabel: '收货仓库', fieldType: 'string', sortOrder: 4 },
  { id: 'cs-5', fieldKey: 'doc.keeper', fieldLabel: '制单人', fieldType: 'string', sortOrder: 5 },
  { id: 'cs-6', fieldKey: 'items', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 6 },
  { id: 'cs-7', fieldKey: 'items.seq', fieldLabel: '序号', fieldType: 'number', sortOrder: 7 },
  { id: 'cs-8', fieldKey: 'items.image', fieldLabel: '商品图片', fieldType: 'string', sortOrder: 8 },
  { id: 'cs-9', fieldKey: 'items.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 9 },
  { id: 'cs-10', fieldKey: 'items.spec', fieldLabel: '规格型号', fieldType: 'string', sortOrder: 10 },
  { id: 'cs-11', fieldKey: 'items.unit', fieldLabel: '单位', fieldType: 'string', sortOrder: 11 },
  { id: 'cs-12', fieldKey: 'items.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 12 },
  { id: 'cs-13', fieldKey: 'items.price', fieldLabel: '单价', fieldType: 'number', sortOrder: 13 },
  { id: 'cs-14', fieldKey: 'items.amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 14 },
  { id: 'cs-15', fieldKey: 'items.barcode', fieldLabel: '条形码', fieldType: 'string', sortOrder: 15 },
  { id: 'cs-16', fieldKey: 'items.qrcode', fieldLabel: '二维码', fieldType: 'string', sortOrder: 16 },
]

/** 静态打印数据：图片地址使用站点同源相对路径（public/images） */
export const COMPREHENSIVE_DATA: Record<string, any> = {
  doc: {
    no: 'ZH-20260921-008',
    date: '2026-09-21',
    warehouse: '华东一号仓（杭州）',
    keeper: '陈明',
  },
  items: [
    { seq: 1, image: '/images/goods-1.png', name: '蓝牙降噪头戴耳机', spec: 'WH-900 / 曜石黑', unit: '副', qty: 12, price: 399, amount: 4788, barcode: '6901234567891', qrcode: 'https://example.com/item/6901234567891' },
    { seq: 2, image: '/images/goods-2.png', name: '机械键盘（青轴）', spec: 'KB-104 / RGB 背光', unit: '把', qty: 8, price: 259, amount: 2072, barcode: '6902345678902', qrcode: 'https://example.com/item/6902345678902' },
    { seq: 3, image: 'http://localhost:9303/images/goods-3.png', name: '无线双模鼠标', spec: 'M-620 / 2.4G+蓝牙', unit: '个', qty: 20, price: 89, amount: 1780, barcode: '6903456789013', qrcode: 'https://example.com/item/6903456789013' },
    { seq: 4, image: 'http://localhost:9303/images/goods-4.png', name: '高速 U 盘', spec: 'U3-128G / USB3.2', unit: '个', qty: 30, price: 79, amount: 2370, barcode: '6904567890124', qrcode: 'https://example.com/item/6904567890124' },
  ],
}

/** 综合示例模板 */
export const COMPREHENSIVE_SHOWCASE_SAMPLE: SampleTemplate = {
  id: 'comprehensive-showcase',
  name: '综合示例模板',
  group: '单据',
  desc: 'A4 横向：多级表头（跨列分组 + 跨行合并），明细行同时展示商品图片、条形码与二维码。',
  paper: 'A4 横向 · 277mm 版心',
  fields: COMPREHENSIVE_FIELDS,
  data: COMPREHENSIVE_DATA,
  template: rawTemplate as unknown as TemplateData,
}
