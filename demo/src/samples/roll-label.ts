// demo/src/samples/roll-label.ts
// 示例七：双列卷纸标签——60×45mm 物料标签，拼版到 122mm 宽卷纸页（每页 2 枚，自动分页）
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 物料标签业务字段 */
export const ROLL_LABEL_FIELDS: PrintBusinessField[] = [
  { id: 'rl-1', fieldKey: 'warehouse', fieldLabel: '仓库信息', fieldType: 'string', sortOrder: 1 },
  { id: 'rl-2', fieldKey: 'warehouse.name', fieldLabel: '仓库名称', fieldType: 'string', sortOrder: 2 },
  { id: 'rl-3', fieldKey: 'material', fieldLabel: '物料信息', fieldType: 'string', sortOrder: 3 },
  { id: 'rl-4', fieldKey: 'material.code', fieldLabel: '物料编码', fieldType: 'string', sortOrder: 4 },
  { id: 'rl-5', fieldKey: 'material.name', fieldLabel: '物料名称', fieldType: 'string', sortOrder: 5 },
  { id: 'rl-6', fieldKey: 'material.spec', fieldLabel: '规格型号', fieldType: 'string', sortOrder: 6 },
  { id: 'rl-7', fieldKey: 'material.unit', fieldLabel: '单位', fieldType: 'string', sortOrder: 7 },
  { id: 'rl-8', fieldKey: 'material.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 8 },
  { id: 'rl-9', fieldKey: 'material.batchNo', fieldLabel: '批次号', fieldType: 'string', sortOrder: 9 },
  { id: 'rl-10', fieldKey: 'material.date', fieldLabel: '日期', fieldType: 'date', sortOrder: 10 },
  { id: 'rl-11', fieldKey: 'material.qrcode', fieldLabel: '二维码内容', fieldType: 'string', sortOrder: 11 },
]

const WAREHOUSE = { name: '华东中心仓' }

/** 静态打印数据（单份：一枚标签） */
export const ROLL_LABEL_DATA: Record<string, any> = {
  warehouse: { ...WAREHOUSE },
  material: {
    code: 'WL-2026-00318',
    name: '不锈钢内六角螺栓',
    spec: 'M8×30 304',
    unit: '盒',
    qty: 20,
    batchNo: 'PC-2609-014',
    date: '2026-09-12',
    qrcode: 'WL-2026-00318|PC-2609-014',
  },
}

/** 静态批量数据：8 枚标签 → 拼版每页 2 列 × 1 行，自动分页为 4 页（对应卷纸上 4 截） */
export const ROLL_LABEL_BATCH_DATA: Record<string, any>[] = [
  ROLL_LABEL_DATA,
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00319', name: '镀锌平垫圈', spec: 'M8 镀锌', unit: '包', qty: 50, batchNo: 'PC-2609-015', date: '2026-09-12', qrcode: 'WL-2026-00319|PC-2609-015' },
  },
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00326', name: '轴承深沟球', spec: '6204-2RS', unit: '个', qty: 120, batchNo: 'PC-2609-021', date: '2026-09-15', qrcode: 'WL-2026-00326|PC-2609-021' },
  },
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00331', name: '同步带轮', spec: '5M-20T-25', unit: '件', qty: 36, batchNo: 'PC-2609-023', date: '2026-09-16', qrcode: 'WL-2026-00331|PC-2609-023' },
  },
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00340', name: '环氧树脂胶', spec: '50ml 双组', unit: '支', qty: 200, batchNo: 'PC-2609-028', date: '2026-09-18', qrcode: 'WL-2026-00340|PC-2609-028' },
  },
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00345', name: '铝箔胶带', spec: '50mm×25m', unit: '卷', qty: 80, batchNo: 'PC-2609-030', date: '2026-09-19', qrcode: 'WL-2026-00345|PC-2609-030' },
  },
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00352', name: '尼龙扎带', spec: '4×300 黑色', unit: '包', qty: 300, batchNo: 'PC-2609-033', date: '2026-09-21', qrcode: 'WL-2026-00352|PC-2609-033' },
  },
  {
    warehouse: { ...WAREHOUSE },
    material: { code: 'WL-2026-00360', name: '线槽盖板', spec: '40×1m PVC', unit: '根', qty: 60, batchNo: 'PC-2609-036', date: '2026-09-22', qrcode: 'WL-2026-00360|PC-2609-036' },
  },
]

const { el } = createElementFactory('rl')

/**
 * 60×45 标签纸，版心 56×41；拼版到 122×45mm 卷纸页（每页 2 列 × 1 行）。
 * 页高必须等于单枚标签高：卷纸标签机按标签间隙逐截走纸，一页即一截，
 * N 枚标签由渲染引擎按 perSheet 自动分页（如 20 枚 → 10 页）。
 */
const ROLL_LABEL_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'CUSTOM',
  customWidth: 60,
  customHeight: 45,
  orientation: 'portrait',
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  tiling: {
    enabled: true,
    sheetPaperSize: 'CUSTOM',
    sheetOrientation: 'portrait',
    sheetCustomWidth: 122,
    sheetCustomHeight: 45,
    sheetMargin: { top: 0, right: 0, bottom: 0, left: 0 },
    gapX: 2,
    gapY: 2,
    columns: 2,
  },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  watermark: {},
  elements: [
    // 纵向须留足分页安全余量（渲染管线为每页预留 2mm），否则末元素会被挤到第二页
    el('text', { left: 0, top: 0, width: 56, height: 3.6, formatter: '{warehouse.name}', fontSize: 7, color: '#555555', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 3.6, width: 56, height: 5.4, formatter: '{material.name}', fontSize: 11, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    el('hline', { left: 0, top: 9.4, width: 56, height: 0.2, borderWidth: 0.4, borderColor: '#9a9a9a' }),
    el('barcode', { left: 0, top: 10, width: 56, height: 8.6, formatter: '{material.code}', barcodeType: 'code128', barWidth: 2, printerDpi: 203, hideTitle: false }),
    el('qrcode', { left: 0, top: 19.6, width: 14, height: 14, formatter: '{material.qrcode}', qrCodeLevel: 'M' }),
    el('text', { left: 16, top: 19.6, width: 40, height: 3.4, formatter: '规格  {material.spec}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 16, top: 23, width: 40, height: 3.4, formatter: '数量  {material.qty} {material.unit}', fontSize: 8, fontWeight: 'bold', verticalAlign: 'middle' }),
    el('text', { left: 16, top: 26.4, width: 40, height: 3.4, formatter: '批次  {material.batchNo}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 16, top: 29.8, width: 40, height: 3.4, formatter: '日期  {material.date}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 34.8, width: 56, height: 3, formatter: '扫码查看物料详情', fontSize: 6.5, color: '#888888', textAlign: 'center', verticalAlign: 'middle' }),
  ],
}

/** 双列卷纸标签示例：60×45 物料标签，拼版 122mm 宽卷纸每页 2 枚、按份数自动分页 */
export const ROLL_LABEL_SAMPLE: SampleTemplate = {
  id: 'roll-label',
  name: '双列卷纸标签',
  group: '标签',
  desc: '仓储物料标签：品名、条码、二维码与批次数量，拼版到 122mm 宽双列卷纸，每页 2 枚、随份数自动分页。',
  paper: '标签 60×45mm · 拼版 122×45mm 卷纸（每页 2 枚，自动分页）',
  fields: ROLL_LABEL_FIELDS,
  data: ROLL_LABEL_DATA,
  batchData: ROLL_LABEL_BATCH_DATA,
  template: ROLL_LABEL_TEMPLATE,
}
