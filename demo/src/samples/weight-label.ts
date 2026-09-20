// demo/src/samples/weight-label.ts
// 示例二：称签打印（条码秤标签）——散装商品称重后即时打一枚价签
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 称签业务字段：门店 + 商品 + 称重结果 */
export const WEIGHT_LABEL_FIELDS: PrintBusinessField[] = [
  { id: 'wl-1', fieldKey: 'shop', fieldLabel: '门店信息', fieldType: 'string', sortOrder: 1 },
  { id: 'wl-2', fieldKey: 'shop.name', fieldLabel: '门店名称', fieldType: 'string', sortOrder: 2 },
  { id: 'wl-3', fieldKey: 'shop.code', fieldLabel: '门店编码', fieldType: 'string', sortOrder: 3 },
  { id: 'wl-4', fieldKey: 'product', fieldLabel: '商品信息', fieldType: 'string', sortOrder: 4 },
  { id: 'wl-5', fieldKey: 'product.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 5 },
  { id: 'wl-6', fieldKey: 'product.unitPrice', fieldLabel: '单价（元/500g）', fieldType: 'number', sortOrder: 6 },
  { id: 'wl-7', fieldKey: 'product.weight', fieldLabel: '净重（kg）', fieldType: 'number', sortOrder: 7 },
  { id: 'wl-8', fieldKey: 'product.amount', fieldLabel: '应付金额', fieldType: 'number', sortOrder: 8 },
  { id: 'wl-9', fieldKey: 'product.barcode', fieldLabel: '商品条码', fieldType: 'string', sortOrder: 9 },
  { id: 'wl-10', fieldKey: 'product.packedAt', fieldLabel: '包装日期', fieldType: 'date', sortOrder: 10 },
  { id: 'wl-11', fieldKey: 'product.expireAt', fieldLabel: '保质期至', fieldType: 'date', sortOrder: 11 },
  { id: 'wl-12', fieldKey: 'product.traceCode', fieldLabel: '追溯码', fieldType: 'string', sortOrder: 12 },
]

/** 静态打印数据（单份：一枚称签） */
export const WEIGHT_LABEL_DATA: Record<string, any> = {
  shop: { name: '鲜享生活超市 · 文一西路店', code: 'HZ-0321' },
  product: {
    name: '散装五常稻花香米',
    unitPrice: 6.90,
    weight: 1.236,
    amount: 17.06,
    barcode: '2201234567890',
    packedAt: '2026-09-20',
    expireAt: '2027-03-20',
    traceCode: 'TR2609200317',
  },
}

/** 静态批量数据：连续出 6 枚不同商品的称签 */
export const WEIGHT_LABEL_BATCH_DATA: Record<string, any>[] = [
  WEIGHT_LABEL_DATA,
  {
    shop: { name: '鲜享生活超市 · 文一西路店', code: 'HZ-0321' },
    product: {
      name: '黄心土豆',
      unitPrice: 2.58,
      weight: 0.842,
      amount: 4.34,
      barcode: '2201234567913',
      packedAt: '2026-09-20',
      expireAt: '2026-09-27',
      traceCode: 'TR2609200318',
    },
  },
  {
    shop: { name: '鲜享生活超市 · 文一西路店', code: 'HZ-0321' },
    product: {
      name: '普罗旺斯番茄',
      unitPrice: 5.98,
      weight: 0.615,
      amount: 7.36,
      barcode: '2201234567920',
      packedAt: '2026-09-20',
      expireAt: '2026-09-25',
      traceCode: 'TR2609200319',
    },
  },
  {
    shop: { name: '鲜享生活超市 · 文一西路店', code: 'HZ-0321' },
    product: {
      name: '红富士苹果',
      unitPrice: 7.80,
      weight: 1.508,
      amount: 23.52,
      barcode: '2201234567937',
      packedAt: '2026-09-20',
      expireAt: '2026-10-05',
      traceCode: 'TR2609200320',
    },
  },
  {
    shop: { name: '鲜享生活超市 · 文一西路店', code: 'HZ-0321' },
    product: {
      name: '冷鲜鸡胸肉',
      unitPrice: 11.90,
      weight: 0.466,
      amount: 11.09,
      barcode: '2201234567944',
      packedAt: '2026-09-20',
      expireAt: '2026-09-23',
      traceCode: 'TR2609200321',
    },
  },
  {
    shop: { name: '鲜享生活超市 · 文一西路店', code: 'HZ-0321' },
    product: {
      name: '云南香蕉',
      unitPrice: 3.98,
      weight: 1.072,
      amount: 8.53,
      barcode: '2201234567951',
      packedAt: '2026-09-20',
      expireAt: '2026-09-26',
      traceCode: 'TR2609200322',
    },
  },
]

const { el } = createElementFactory('wt')

/** 60×40 标签纸，版心 56×36（页边距 2mm） */
const WEIGHT_LABEL_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'LABEL_60X40',
  orientation: 'portrait',
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    // 纵向须留足分页安全余量（渲染管线为每页预留 2mm），否则末元素会被挤到第二页
    el('text', { left: 0, top: 0, width: 56, height: 4.2, formatter: '{shop.name}', fontSize: 8, textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 4.2, width: 56, height: 5.4, formatter: '{product.name}', fontSize: 11, fontWeight: 'bold', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 9.6, width: 56, height: 3.9, formatter: '单价 ¥{MONEY(product.unitPrice)} 元/500g', fontSize: 8, color: '#444444' }),
    el('text', { left: 0, top: 13.5, width: 28, height: 4.8, formatter: '净重 {product.weight} kg', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 28, top: 13.5, width: 28, height: 4.8, formatter: '¥{MONEY(product.amount)}', fontSize: 12, fontWeight: 'bold', color: '#c8211e', textAlign: 'right', verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 18.8, width: 56, height: 0.2, borderWidth: 0.4, borderColor: '#9a9a9a' }),
    el('barcode', { left: 0, top: 19.3, width: 56, height: 7.7, formatter: '{product.barcode}', barcodeType: 'code128', barWidth: 2, printerDpi: 203, hideTitle: false }),
    el('text', { left: 0, top: 27.3, width: 56, height: 3.1, formatter: '包装 {product.packedAt}  保质至 {product.expireAt}', fontSize: 6.5 }),
    el('text', { left: 0, top: 30.4, width: 56, height: 3.2, formatter: '门店 {shop.code}  追溯码 {product.traceCode}', fontSize: 6.5 }),
  ],
}

/** 称签打印示例：条码秤标签，一秤一签 */
export const WEIGHT_LABEL_SAMPLE: SampleTemplate = {
  id: 'weight-label',
  name: '称签打印',
  group: '标签',
  desc: '条码秤称重标签：品名、单价、净重、金额与商品条码，生鲜散装区即称即打。',
  paper: '标签纸 60×40mm · 单枚',
  fields: WEIGHT_LABEL_FIELDS,
  data: WEIGHT_LABEL_DATA,
  batchData: WEIGHT_LABEL_BATCH_DATA,
  template: WEIGHT_LABEL_TEMPLATE,
}
