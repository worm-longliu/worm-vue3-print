// demo/src/samples/price-label.ts
// 示例三：价签打印——货架价签，A4 拼版一张纸铺 4 列 × 8 行共 32 枚
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 价签业务字段 */
export const PRICE_LABEL_FIELDS: PrintBusinessField[] = [
  { id: 'pl-1', fieldKey: 'shop', fieldLabel: '门店信息', fieldType: 'string', sortOrder: 1 },
  { id: 'pl-2', fieldKey: 'shop.name', fieldLabel: '门店名称', fieldType: 'string', sortOrder: 2 },
  { id: 'pl-3', fieldKey: 'product', fieldLabel: '商品信息', fieldType: 'string', sortOrder: 3 },
  { id: 'pl-4', fieldKey: 'product.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 4 },
  { id: 'pl-5', fieldKey: 'product.spec', fieldLabel: '规格', fieldType: 'string', sortOrder: 5 },
  { id: 'pl-6', fieldKey: 'product.unit', fieldLabel: '计价单位', fieldType: 'string', sortOrder: 6 },
  { id: 'pl-7', fieldKey: 'product.price', fieldLabel: '现价', fieldType: 'number', sortOrder: 7 },
  { id: 'pl-8', fieldKey: 'product.oldPrice', fieldLabel: '原价', fieldType: 'number', sortOrder: 8 },
  { id: 'pl-9', fieldKey: 'product.barcode', fieldLabel: '商品条码', fieldType: 'string', sortOrder: 9 },
]

const SHOP = { name: '鲜享生活超市' }

/** 静态打印数据（单份：一枚价签） */
export const PRICE_LABEL_DATA: Record<string, any> = {
  shop: { ...SHOP },
  product: {
    name: '东北长粒香米',
    spec: '5kg 装',
    unit: '袋',
    price: 49.90,
    oldPrice: 59.90,
    barcode: '6901234567892',
  },
}

/** 静态批量数据：8 枚价签 → 拼版铺进 A4（每纸 32 格，本例占满 8 格） */
export const PRICE_LABEL_BATCH_DATA: Record<string, any>[] = [
  PRICE_LABEL_DATA,
  {
    shop: { ...SHOP },
    product: { name: '特级初榨橄榄油', spec: '750ml', unit: '瓶', price: 89.00, oldPrice: 118.00, barcode: '6901234567908' },
  },
  {
    shop: { ...SHOP },
    product: { name: '全麦切片面包', spec: '400g', unit: '袋', price: 12.80, oldPrice: 15.80, barcode: '6901234567915' },
  },
  {
    shop: { ...SHOP },
    product: { name: '冷萃拿铁咖啡', spec: '280ml×4', unit: '箱', price: 39.90, oldPrice: 49.90, barcode: '6901234567922' },
  },
  {
    shop: { ...SHOP },
    product: { name: '古法酿造酱油', spec: '1.8L', unit: '桶', price: 26.50, oldPrice: 32.00, barcode: '6901234567939' },
  },
  {
    shop: { ...SHOP },
    product: { name: '原生木浆抽纸', spec: '3 层×24 包', unit: '提', price: 33.90, oldPrice: 45.00, barcode: '6901234567946' },
  },
  {
    shop: { ...SHOP },
    product: { name: '新西兰奇异果', spec: '单果 100g 起', unit: '个', price: 6.90, oldPrice: 8.90, barcode: '6901234567953' },
  },
  {
    shop: { ...SHOP },
    product: { name: '手打牛肉丸', spec: '500g', unit: '盒', price: 42.00, oldPrice: 52.00, barcode: '6901234567960' },
  },
]

const { el } = createElementFactory('pr')

/** 40×30 标签纸，版心 37×27；拼版到 A4 纵向（4 列 × 8 行 = 32 枚/张） */
const PRICE_LABEL_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'LABEL_40X30',
  orientation: 'portrait',
  margins: { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 },
  tiling: {
    enabled: true,
    sheetPaperSize: 'A4',
    sheetOrientation: 'portrait',
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    gapX: 2,
    gapY: 2,
    columns: 4,
  },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    // 纵向须留足分页安全余量（渲染管线为每页预留 2mm），否则末元素会被挤到第二页
    el('text', { left: 0, top: 0, width: 37, height: 4.4, formatter: '{product.name}', fontSize: 9, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 4.4, width: 37, height: 2.8, formatter: '{product.spec} / {product.unit}', fontSize: 6.5, color: '#666666', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 7.2, width: 37, height: 5.8, formatter: '¥{MONEY(product.price)}', fontSize: 16, fontWeight: 'bold', color: '#c8211e', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 13, width: 37, height: 2.6, formatter: '原价 ¥{MONEY(product.oldPrice)}', fontSize: 6.5, color: '#999999', textDecoration: 'line-through', textAlign: 'center', verticalAlign: 'middle' }),
    el('barcode', { left: 0, top: 15.6, width: 37, height: 5.4, formatter: '{product.barcode}', barcodeType: 'code128', barWidth: 2, printerDpi: 203, hideTitle: false }),
    el('text', { left: 0, top: 21, width: 37, height: 2.8, formatter: '{shop.name}', fontSize: 6, color: '#666666', textAlign: 'center', verticalAlign: 'middle' }),
  ],
}

/** 价签打印示例：货架价签，开启拼版一张 A4 铺 32 枚 */
export const PRICE_LABEL_SAMPLE: SampleTemplate = {
  id: 'price-label',
  name: '价签打印',
  group: '标签',
  desc: '货架价签：品名、规格、促销价与划线原价 + 商品条码，开启拼版后一张 A4 可铺 32 枚。',
  paper: '标签 40×30mm · 拼版 A4（4×8）',
  fields: PRICE_LABEL_FIELDS,
  data: PRICE_LABEL_DATA,
  batchData: PRICE_LABEL_BATCH_DATA,
  template: PRICE_LABEL_TEMPLATE,
}
