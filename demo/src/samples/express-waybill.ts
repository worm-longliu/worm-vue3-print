// demo/src/samples/express-waybill.ts
// 示例四：快递电子面单——100×150mm 一联面单（自定义纸）
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 快递面单业务字段 */
export const EXPRESS_WAYBILL_FIELDS: PrintBusinessField[] = [
  { id: 'ew-1', fieldKey: 'express', fieldLabel: '快递公司', fieldType: 'string', sortOrder: 1 },
  { id: 'ew-2', fieldKey: 'express.company', fieldLabel: '公司名称', fieldType: 'string', sortOrder: 2 },
  { id: 'ew-3', fieldKey: 'express.product', fieldLabel: '产品类型', fieldType: 'string', sortOrder: 3 },
  { id: 'ew-4', fieldKey: 'express.hotline', fieldLabel: '客服热线', fieldType: 'string', sortOrder: 4 },
  { id: 'ew-5', fieldKey: 'waybill', fieldLabel: '运单信息', fieldType: 'string', sortOrder: 5 },
  { id: 'ew-6', fieldKey: 'waybill.no', fieldLabel: '运单号', fieldType: 'string', sortOrder: 6 },
  { id: 'ew-7', fieldKey: 'waybill.qrcode', fieldLabel: '查件二维码', fieldType: 'string', sortOrder: 7 },
  { id: 'ew-8', fieldKey: 'waybill.goodsName', fieldLabel: '托寄物', fieldType: 'string', sortOrder: 8 },
  { id: 'ew-9', fieldKey: 'waybill.weight', fieldLabel: '重量（kg）', fieldType: 'number', sortOrder: 9 },
  { id: 'ew-10', fieldKey: 'waybill.count', fieldLabel: '件数', fieldType: 'number', sortOrder: 10 },
  { id: 'ew-11', fieldKey: 'waybill.remark', fieldLabel: '备注', fieldType: 'string', sortOrder: 11 },
  { id: 'ew-12', fieldKey: 'waybill.printedAt', fieldLabel: '打印时间', fieldType: 'string', sortOrder: 12 },
  { id: 'ew-13', fieldKey: 'waybill.destCode', fieldLabel: '目的地代码', fieldType: 'string', sortOrder: 13 },
  { id: 'ew-14', fieldKey: 'sender', fieldLabel: '寄件方', fieldType: 'string', sortOrder: 14 },
  { id: 'ew-15', fieldKey: 'sender.name', fieldLabel: '寄件人', fieldType: 'string', sortOrder: 15 },
  { id: 'ew-16', fieldKey: 'sender.phone', fieldLabel: '寄件电话', fieldType: 'string', sortOrder: 16 },
  { id: 'ew-17', fieldKey: 'sender.province', fieldLabel: '寄件省份', fieldType: 'string', sortOrder: 17 },
  { id: 'ew-18', fieldKey: 'sender.city', fieldLabel: '寄件城市', fieldType: 'string', sortOrder: 18 },
  { id: 'ew-19', fieldKey: 'sender.address', fieldLabel: '寄件地址', fieldType: 'string', sortOrder: 19 },
  { id: 'ew-20', fieldKey: 'receiver', fieldLabel: '收件方', fieldType: 'string', sortOrder: 20 },
  { id: 'ew-21', fieldKey: 'receiver.name', fieldLabel: '收件人', fieldType: 'string', sortOrder: 21 },
  { id: 'ew-22', fieldKey: 'receiver.phone', fieldLabel: '收件电话', fieldType: 'string', sortOrder: 22 },
  { id: 'ew-23', fieldKey: 'receiver.province', fieldLabel: '收件省份', fieldType: 'string', sortOrder: 23 },
  { id: 'ew-24', fieldKey: 'receiver.city', fieldLabel: '收件城市', fieldType: 'string', sortOrder: 24 },
  { id: 'ew-25', fieldKey: 'receiver.district', fieldLabel: '收件区县', fieldType: 'string', sortOrder: 25 },
  { id: 'ew-26', fieldKey: 'receiver.address', fieldLabel: '收件地址', fieldType: 'string', sortOrder: 26 },
]

/** 静态打印数据 */
export const EXPRESS_WAYBILL_DATA: Record<string, any> = {
  express: { company: '迅达速运', product: '标准快递', hotline: '400-820-0000' },
  waybill: {
    no: 'XD7788009900123',
    qrcode: 'https://example.com/track/XD7788009900123',
    goodsName: '数码配件',
    weight: 1.35,
    count: 2,
    remark: '易碎轻放，请勿倒置',
    printedAt: '2026-09-20 15:42',
    destCode: '571-03-08',
  },
  sender: {
    name: '张伟',
    phone: '138****1234',
    province: '浙江省',
    city: '杭州市',
    address: '余杭区文一西路 998 号 3 幢 502 室',
  },
  receiver: {
    name: '李娜',
    phone: '139****5678',
    province: '广东省',
    city: '深圳市',
    district: '南山区',
    address: '科技园南区高新南七道 12 号 A 座 1801',
  },
}

const { el } = createElementFactory('ew')

/** 自定义纸 100×150mm，版心 90×140 */
const EXPRESS_WAYBILL_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'CUSTOM',
  orientation: 'portrait',
  customWidth: 100,
  customHeight: 150,
  margins: { top: 5, right: 5, bottom: 5, left: 5 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    el('text', { left: 0, top: 0, width: 60, height: 6, formatter: '{express.company}', fontSize: 13, fontWeight: 'bold', verticalAlign: 'middle' }),
    el('text', { left: 60, top: 0, width: 30, height: 6, formatter: '{express.product}', fontSize: 10, textAlign: 'right', verticalAlign: 'middle' }),
    el('barcode', { left: 0, top: 6.5, width: 90, height: 13, formatter: '{waybill.no}', barcodeType: 'code128', barWidth: 2, printerDpi: 203, hideTitle: false }),
    el('text', { left: 0, top: 21, width: 90, height: 4.5, formatter: '收件人   {receiver.name}   {receiver.phone}', fontSize: 11, fontWeight: 'bold', verticalAlign: 'middle' }),
    el('longText', { left: 0, top: 25.5, width: 90, height: 10, formatter: '{receiver.province}{receiver.city}{receiver.district}{receiver.address}', fontSize: 9, lineHeight: 13 }),
    el('hline', { left: 0, top: 36, width: 90, height: 0.2, borderWidth: 0.4, borderColor: '#bbbbbb' }),
    el('text', { left: 0, top: 37, width: 90, height: 4, formatter: '寄件人   {sender.name}   {sender.phone}', fontSize: 9, verticalAlign: 'middle' }),
    el('longText', { left: 0, top: 41, width: 90, height: 8, formatter: '{sender.province}{sender.city}{sender.address}', fontSize: 8, color: '#444444', lineHeight: 12 }),
    el('hline', { left: 0, top: 50, width: 90, height: 0.2, borderWidth: 0.4, borderColor: '#bbbbbb' }),
    el('qrcode', { left: 0, top: 52, width: 24, height: 24, formatter: '{waybill.qrcode}', qrCodeLevel: 'M' }),
    el('text', { left: 27, top: 52, width: 63, height: 4.5, formatter: '托寄物：{waybill.goodsName}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 27, top: 56.5, width: 63, height: 4.5, formatter: '重量：{waybill.weight} kg   件数：{waybill.count}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 27, top: 61, width: 63, height: 4.5, formatter: '备注：{waybill.remark}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 27, top: 65.5, width: 63, height: 4.5, formatter: '签收人：____________', fontSize: 9, verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 71, width: 90, height: 0.2, borderWidth: 0.4, borderColor: '#dddddd' }),
    el('text', { left: 0, top: 72, width: 90, height: 4, formatter: '打印时间：{waybill.printedAt}', fontSize: 8, color: '#666666', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 76, width: 90, height: 4, formatter: '客服热线：{express.hotline}', fontSize: 8, color: '#666666', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 82, width: 90, height: 16, formatter: '{waybill.destCode}', fontSize: 22, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', borderWidth: 0.6, borderColor: '#333333' }),
    el('text', { left: 0, top: 99, width: 90, height: 4, formatter: '收件人存根联   {express.company}', fontSize: 7.5, color: '#999999', textAlign: 'center', verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 108, width: 90, height: 0.2, borderWidth: 0.4, borderColor: '#dddddd' }),
    el('text', { left: 0, top: 110, width: 90, height: 6, formatter: '签收时间：______年____月____日', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 117, width: 90, height: 6, formatter: '派件员：__________     收件人签收：__________', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 126, width: 90, height: 5, formatter: '本联为收件人存根，请核对包裹完好后再签收', fontSize: 8, color: '#999999', textAlign: 'center', verticalAlign: 'middle' }),
  ],
}

/** 快递电子面单示例 */
export const EXPRESS_WAYBILL_SAMPLE: SampleTemplate = {
  id: 'express-waybill',
  name: '快递电子面单',
  group: '单据',
  desc: '一联电子面单：运单条码、收寄双方信息、查件二维码、目的地大字与签收栏。',
  paper: '自定义纸 100×150mm',
  fields: EXPRESS_WAYBILL_FIELDS,
  data: EXPRESS_WAYBILL_DATA,
  template: EXPRESS_WAYBILL_TEMPLATE,
}
