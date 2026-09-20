// demo/src/samples/sales-outbound.ts
// 示例七：销售出库单——A5 纵向单据，明细表格分页 + 每页小计 + 整表合计
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 销售出库单业务字段 */
export const SALES_OUTBOUND_FIELDS: PrintBusinessField[] = [
  { id: 'so-1', fieldKey: 'company', fieldLabel: '公司信息', fieldType: 'string', sortOrder: 1 },
  { id: 'so-2', fieldKey: 'company.name', fieldLabel: '公司名称', fieldType: 'string', sortOrder: 2 },
  { id: 'so-3', fieldKey: 'customer', fieldLabel: '客户信息', fieldType: 'string', sortOrder: 3 },
  { id: 'so-4', fieldKey: 'customer.name', fieldLabel: '客户名称', fieldType: 'string', sortOrder: 4 },
  { id: 'so-5', fieldKey: 'customer.contact', fieldLabel: '联系人', fieldType: 'string', sortOrder: 5 },
  { id: 'so-6', fieldKey: 'customer.phone', fieldLabel: '联系电话', fieldType: 'string', sortOrder: 6 },
  { id: 'so-7', fieldKey: 'customer.address', fieldLabel: '收货地址', fieldType: 'string', sortOrder: 7 },
  { id: 'so-8', fieldKey: 'order', fieldLabel: '单据信息', fieldType: 'string', sortOrder: 8 },
  { id: 'so-9', fieldKey: 'order.no', fieldLabel: '出库单号', fieldType: 'string', sortOrder: 9 },
  { id: 'so-10', fieldKey: 'order.date', fieldLabel: '出库日期', fieldType: 'date', sortOrder: 10 },
  { id: 'so-11', fieldKey: 'order.salesman', fieldLabel: '业务员', fieldType: 'string', sortOrder: 11 },
  { id: 'so-12', fieldKey: 'order.keeper', fieldLabel: '仓管员', fieldType: 'string', sortOrder: 12 },
  { id: 'so-13', fieldKey: 'order.remark', fieldLabel: '备注', fieldType: 'string', sortOrder: 13 },
  { id: 'so-14', fieldKey: 'order.total', fieldLabel: '合计金额', fieldType: 'number', sortOrder: 14 },
  { id: 'so-15', fieldKey: 'goods', fieldLabel: '出库明细', fieldType: 'list', sortOrder: 15 },
  { id: 'so-16', fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 16 },
  { id: 'so-17', fieldKey: 'goods.spec', fieldLabel: '规格', fieldType: 'string', sortOrder: 17 },
  { id: 'so-18', fieldKey: 'goods.unit', fieldLabel: '单位', fieldType: 'string', sortOrder: 18 },
  { id: 'so-19', fieldKey: 'goods.price', fieldLabel: '单价', fieldType: 'number', sortOrder: 19 },
  { id: 'so-20', fieldKey: 'goods.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 20 },
  { id: 'so-21', fieldKey: 'goods.amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 21 },
]

/** 静态打印数据：12 条明细，用于验证分页与每页小计 */
export const SALES_OUTBOUND_DATA: Record<string, any> = {
  company: { name: '杭州示例智能装备有限公司' },
  customer: {
    name: '宁波精工机械制造有限公司',
    contact: '赵工',
    phone: '0574-8822 6677',
    address: '宁波市北仑区海天路 168 号 2 号厂房',
  },
  order: {
    no: 'XSCK202609200086',
    date: '2026-09-20',
    salesman: '林越',
    keeper: '何斌',
    remark: '请按送货单核对型号后签收，外包装破损请当场拍照留存。',
    total: 27933.00,
  },
  goods: [
    { name: '铝合金型材', spec: '6061-T6', unit: '米', price: 28.50, qty: 120, amount: 3420.00 },
    { name: '不锈钢法兰', spec: 'DN50', unit: '片', price: 46.00, qty: 60, amount: 2760.00 },
    { name: '碳钢螺栓', spec: 'M12×40', unit: '套', price: 1.20, qty: 800, amount: 960.00 },
    { name: '橡胶密封圈', spec: 'NBR50', unit: '个', price: 0.85, qty: 500, amount: 425.00 },
    { name: '直线导轨', spec: 'HGR20', unit: '根', price: 186.00, qty: 12, amount: 2232.00 },
    { name: '伺服电机', spec: '750W', unit: '台', price: 1280.00, qty: 4, amount: 5120.00 },
    { name: '行星减速机', spec: 'PLF60', unit: '台', price: 860.00, qty: 4, amount: 3440.00 },
    { name: '工业相机', spec: '2000 万像素', unit: '台', price: 2350.00, qty: 2, amount: 4700.00 },
    { name: '工业镜头', spec: '25mm', unit: '个', price: 680.00, qty: 2, amount: 1360.00 },
    { name: '条形光源', spec: '300mm', unit: '条', price: 158.00, qty: 6, amount: 948.00 },
    { name: '同步带', spec: '5M-500', unit: '条', price: 42.00, qty: 20, amount: 840.00 },
    { name: '气缸', spec: 'SC63×100', unit: '只', price: 216.00, qty: 8, amount: 1728.00 },
  ],
}

const { el, row } = createElementFactory('so')

/** A5 纵向，版心 128×190；页眉 12mm（每页重复）、页脚 8mm（页码） */
const SALES_OUTBOUND_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'A5',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: {
    height: 12,
    elements: [
      el('text', { left: 0, top: 0, width: 128, height: 5, formatter: '{company.name}', fontSize: 9, textAlign: 'center', verticalAlign: 'middle' }),
      el('text', { left: 0, top: 5, width: 128, height: 7, formatter: '销售出库单', fontSize: 16, fontWeight: 'bold', letterSpacing: 4, textAlign: 'center', verticalAlign: 'middle' }),
    ],
  },
  footer: {
    height: 8,
    elements: [
      el('text', { left: 0, top: 1, width: 88, height: 5, formatter: '{company.name}', fontSize: 8, color: '#666666', verticalAlign: 'middle' }),
      el('text', { left: 88, top: 1, width: 40, height: 5, formatter: '第 {pageIndex} 页 / 共 {totalPages} 页', fontSize: 8, color: '#666666', textAlign: 'right', verticalAlign: 'middle' }),
    ],
  },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    el('table', {
      left: 0,
      top: 0,
      width: 128,
      height: 21,
      tableMode: 'dynamic',
      tableColWidths: [22, 42, 22, 42],
      tableDefaultFontSize: 9,
      tableDefaultPadding: 1,
      tablePagination: { enabled: false },
      tableRows: [
        row('header', 7, [
          { formatter: '客户名称', fontWeight: 'bold' },
          '{customer.name}',
          { formatter: '出库单号', fontWeight: 'bold' },
          '{order.no}',
        ]),
        row('header', 7, [
          { formatter: '联系人', fontWeight: 'bold' },
          '{customer.contact}  {customer.phone}',
          { formatter: '出库日期', fontWeight: 'bold' },
          '{order.date}',
        ]),
        row('header', 7, [
          { formatter: '收货地址', fontWeight: 'bold' },
          '{customer.address}',
          { formatter: '业务员', fontWeight: 'bold' },
          '{order.salesman}',
        ]),
      ],
    }),
    el('table', {
      left: 0,
      top: 23,
      width: 128,
      height: 30,
      tableMode: 'dynamic',
      dataSource: 'goods',
      tableColWidths: [50, 24, 14, 16, 12, 12],
      tableDefaultFontSize: 8.5,
      tableDefaultPadding: 1,
      tablePagination: { enabled: true },
      tableRows: [
        row('header', 8, [
          { formatter: '商品名称', align: 'center', fontWeight: 'bold' },
          { formatter: '规格', align: 'center', fontWeight: 'bold' },
          { formatter: '单位', align: 'center', fontWeight: 'bold' },
          { formatter: '单价', align: 'center', fontWeight: 'bold' },
          { formatter: '数量', align: 'center', fontWeight: 'bold' },
          { formatter: '金额', align: 'center', fontWeight: 'bold' },
        ], { repeatOnPage: true }),
        row('data', 8, [
          { formatter: '{goods.name}', align: 'left' },
          { formatter: '{goods.spec}', align: 'left' },
          { formatter: '{goods.unit}', align: 'center' },
          { formatter: '{MONEY(goods.price)}', align: 'right' },
          { formatter: '{goods.qty}', align: 'right' },
          { formatter: '{MONEY(goods.amount)}', align: 'right' },
        ]),
        row('subtotal', 7, [
          { formatter: '本页小计', align: 'left', fontWeight: 'bold' },
          '',
          '',
          '',
          { formatter: '{SUM(goods.qty)}', align: 'right', fontWeight: 'bold' },
          { formatter: '{MONEY(SUM(goods.amount))}', align: 'right', fontWeight: 'bold' },
        ]),
        row('summary', 7, [
          { formatter: '合计', align: 'left', fontWeight: 'bold' },
          '',
          '',
          '',
          { formatter: '{SUM(goods.qty)}', align: 'right', fontWeight: 'bold' },
          { formatter: '{MONEY(SUM(goods.amount))}', align: 'right', fontWeight: 'bold' },
        ]),
      ],
    }),
    el('text', { left: 0, top: 56, width: 128, height: 6, formatter: '金额大写：{UPPER(order.total)}', fontSize: 10, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 63, width: 128, height: 6, formatter: '备注：{order.remark}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 72, width: 42, height: 6, formatter: '制单人：{order.salesman}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 43, top: 72, width: 42, height: 6, formatter: '仓管员：{order.keeper}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 86, top: 72, width: 42, height: 6, formatter: '收货人签字：', fontSize: 9, verticalAlign: 'middle' }),
  ],
}

/** 销售出库单示例 */
export const SALES_OUTBOUND_SAMPLE: SampleTemplate = {
  id: 'sales-outbound',
  name: '销售出库单',
  group: '单据',
  desc: '出库凭证：抬头信息区 + 明细表格（每页小计 + 整表合计）+ 金额大写与签字栏，演示多页分页。',
  paper: 'A5 纵向 · 128mm 版心',
  fields: SALES_OUTBOUND_FIELDS,
  data: SALES_OUTBOUND_DATA,
  template: SALES_OUTBOUND_TEMPLATE,
}
