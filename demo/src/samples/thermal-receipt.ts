// demo/src/samples/thermal-receipt.ts
// 示例五：零售小票——80mm 热敏连续纸，出纸高度按内容推导
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 零售小票业务字段 */
export const THERMAL_RECEIPT_FIELDS: PrintBusinessField[] = [
  { id: 'tr-1', fieldKey: 'store', fieldLabel: '门店信息', fieldType: 'string', sortOrder: 1 },
  { id: 'tr-2', fieldKey: 'store.name', fieldLabel: '门店名称', fieldType: 'string', sortOrder: 2 },
  { id: 'tr-3', fieldKey: 'store.address', fieldLabel: '门店地址', fieldType: 'string', sortOrder: 3 },
  { id: 'tr-4', fieldKey: 'store.tel', fieldLabel: '门店电话', fieldType: 'string', sortOrder: 4 },
  { id: 'tr-5', fieldKey: 'order', fieldLabel: '订单信息', fieldType: 'string', sortOrder: 5 },
  { id: 'tr-6', fieldKey: 'order.no', fieldLabel: '小票号', fieldType: 'string', sortOrder: 6 },
  { id: 'tr-7', fieldKey: 'order.time', fieldLabel: '交易时间', fieldType: 'string', sortOrder: 7 },
  { id: 'tr-8', fieldKey: 'order.cashier', fieldLabel: '收银员', fieldType: 'string', sortOrder: 8 },
  { id: 'tr-9', fieldKey: 'order.payMethod', fieldLabel: '支付方式', fieldType: 'string', sortOrder: 9 },
  { id: 'tr-10', fieldKey: 'order.paid', fieldLabel: '实付金额', fieldType: 'number', sortOrder: 10 },
  { id: 'tr-11', fieldKey: 'order.change', fieldLabel: '找零', fieldType: 'number', sortOrder: 11 },
  { id: 'tr-12', fieldKey: 'order.memberNo', fieldLabel: '会员卡号', fieldType: 'string', sortOrder: 12 },
  { id: 'tr-13', fieldKey: 'order.points', fieldLabel: '本次积分', fieldType: 'number', sortOrder: 13 },
  { id: 'tr-14', fieldKey: 'order.total', fieldLabel: '合计金额', fieldType: 'number', sortOrder: 14 },
  { id: 'tr-15', fieldKey: 'order.qrcode', fieldLabel: '电子发票二维码', fieldType: 'string', sortOrder: 15 },
  { id: 'tr-16', fieldKey: 'items', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 16 },
  { id: 'tr-17', fieldKey: 'items.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 17 },
  { id: 'tr-18', fieldKey: 'items.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 18 },
  { id: 'tr-19', fieldKey: 'items.price', fieldLabel: '单价', fieldType: 'number', sortOrder: 19 },
  { id: 'tr-20', fieldKey: 'items.amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 20 },
]

/** 静态打印数据 */
export const THERMAL_RECEIPT_DATA: Record<string, any> = {
  store: { name: '好邻居便利店（文一西路店）', address: '杭州市余杭区文一西路 969 号', tel: '0571-8888 6688' },
  order: {
    no: '20260920000158',
    time: '2026-09-20 16:08:32',
    cashier: '王芳 / 1001',
    payMethod: '微信支付',
    paid: 50.00,
    change: 0.50,
    memberNo: '8802 3311 0099',
    points: 49,
    total: 49.50,
    qrcode: 'https://example.com/invoice/20260920000158',
  },
  items: [
    { name: '饮用天然水 550ml', qty: 2, price: 2.00, amount: 4.00 },
    { name: '红烧牛肉面 桶装', qty: 1, price: 5.50, amount: 5.50 },
    { name: '常温酸奶 205g', qty: 3, price: 6.50, amount: 19.50 },
    { name: '卤香鸡蛋', qty: 2, price: 2.50, amount: 5.00 },
    { name: '辣味豆干 108g', qty: 1, price: 3.50, amount: 3.50 },
    { name: '抽取式面巾纸', qty: 1, price: 12.00, amount: 12.00 },
  ],
}

const { el, row } = createElementFactory('rc')

/** 80mm 热敏纸，版心宽 76mm；纸高按内容推导 */
const THERMAL_RECEIPT_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'THERMAL_80',
  orientation: 'portrait',
  margins: { top: 3, right: 2, bottom: 3, left: 2 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    el('text', { left: 0, top: 0, width: 76, height: 6, formatter: '{store.name}', fontSize: 14, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 6, width: 76, height: 4, formatter: '{store.address}', fontSize: 8, textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 10, width: 76, height: 4, formatter: '服务热线：{store.tel}', fontSize: 8, textAlign: 'center', verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 14.5, width: 76, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    el('text', { left: 0, top: 15.5, width: 44, height: 4, formatter: '单号：{order.no}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 44, top: 15.5, width: 32, height: 4, formatter: '收银员：{order.cashier}', fontSize: 8, textAlign: 'right', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 19.5, width: 76, height: 4, formatter: '交易时间：{order.time}', fontSize: 8, verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 24, width: 76, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    el('table', {
      left: 0,
      top: 25.5,
      width: 76,
      height: 17.5,
      tableMode: 'dynamic',
      dataSource: 'items',
      tableColWidths: [38, 12, 13, 13],
      tableDefaultFontSize: 8,
      tableDefaultPadding: 0.8,
      tablePagination: { enabled: true },
      tableRows: [
        row('header', 6, [
          { formatter: '商品', align: 'left', fontWeight: 'bold' },
          { formatter: '数量', align: 'right', fontWeight: 'bold' },
          { formatter: '单价', align: 'right', fontWeight: 'bold' },
          { formatter: '金额', align: 'right', fontWeight: 'bold' },
        ]),
        row('data', 5.5, [
          { formatter: '{items.name}', align: 'left' },
          { formatter: '{items.qty}', align: 'right' },
          { formatter: '{MONEY(items.price)}', align: 'right' },
          { formatter: '{MONEY(items.amount)}', align: 'right' },
        ]),
        row('summary', 6, [
          { formatter: '合计', align: 'left', fontWeight: 'bold' },
          { formatter: '{SUM(items.qty)}', align: 'right', fontWeight: 'bold' },
          { formatter: '', align: 'right' },
          { formatter: '{MONEY(SUM(items.amount))}', align: 'right', fontWeight: 'bold' },
        ]),
      ],
    }),
    el('text', { left: 0, top: 45, width: 76, height: 4, formatter: '支付方式：{order.payMethod}', fontSize: 8.5, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 49, width: 76, height: 4, formatter: '实付：¥{MONEY(order.paid)}    找零：¥{MONEY(order.change)}', fontSize: 8.5, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 53, width: 76, height: 4, formatter: '会员卡号：{order.memberNo}    本次积分：{order.points}', fontSize: 8, verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 57.5, width: 76, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    el('qrcode', { left: 26, top: 59, width: 24, height: 24, formatter: '{order.qrcode}', qrCodeLevel: 'M' }),
    el('text', { left: 0, top: 84, width: 76, height: 5, formatter: '谢谢惠顾，欢迎下次光临！', fontSize: 10, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 89, width: 76, height: 4, formatter: '小票号 {order.no}   {order.time}', fontSize: 7.5, color: '#666666', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 93, width: 76, height: 4, formatter: '凭此小票 7 日内可办理退换货', fontSize: 7, color: '#999999', textAlign: 'center', verticalAlign: 'middle' }),
  ],
}

/** 零售小票示例 */
export const THERMAL_RECEIPT_SAMPLE: SampleTemplate = {
  id: 'thermal-receipt',
  name: '零售小票',
  group: '小票',
  desc: '门店购物小票：店头信息、明细表格、合计与支付找零、电子发票二维码，连续纸按内容出纸。',
  paper: '热敏纸 80mm · 连续纸',
  fields: THERMAL_RECEIPT_FIELDS,
  data: THERMAL_RECEIPT_DATA,
  template: THERMAL_RECEIPT_TEMPLATE,
}
