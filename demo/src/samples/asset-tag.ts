// demo/src/samples/asset-tag.ts
// 示例六：资产标签——二维码标签，A4 拼版一张纸铺 3 列 × 6 行共 18 枚
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 资产标签业务字段 */
export const ASSET_TAG_FIELDS: PrintBusinessField[] = [
  { id: 'at-1', fieldKey: 'company', fieldLabel: '公司信息', fieldType: 'string', sortOrder: 1 },
  { id: 'at-2', fieldKey: 'company.name', fieldLabel: '公司名称', fieldType: 'string', sortOrder: 2 },
  { id: 'at-3', fieldKey: 'asset', fieldLabel: '资产信息', fieldType: 'string', sortOrder: 3 },
  { id: 'at-4', fieldKey: 'asset.code', fieldLabel: '资产编号', fieldType: 'string', sortOrder: 4 },
  { id: 'at-5', fieldKey: 'asset.name', fieldLabel: '资产名称', fieldType: 'string', sortOrder: 5 },
  { id: 'at-6', fieldKey: 'asset.model', fieldLabel: '规格型号', fieldType: 'string', sortOrder: 6 },
  { id: 'at-7', fieldKey: 'asset.dept', fieldLabel: '使用部门', fieldType: 'string', sortOrder: 7 },
  { id: 'at-8', fieldKey: 'asset.keeper', fieldLabel: '责任人', fieldType: 'string', sortOrder: 8 },
  { id: 'at-9', fieldKey: 'asset.boughtAt', fieldLabel: '购置日期', fieldType: 'date', sortOrder: 9 },
]

const COMPANY = { name: '杭州示例科技有限公司' }

/** 静态打印数据（单份：一枚标签） */
export const ASSET_TAG_DATA: Record<string, any> = {
  company: { ...COMPANY },
  asset: {
    code: 'ZC-2026-01358',
    name: '笔记本电脑',
    model: 'ThinkBook 14 G6',
    dept: '研发中心',
    keeper: '陈默',
    boughtAt: '2026-03-12',
  },
}

/** 静态批量数据：6 枚资产标签 → 拼版铺进 A4（每纸 18 格，本例占满 6 格） */
export const ASSET_TAG_BATCH_DATA: Record<string, any>[] = [
  ASSET_TAG_DATA,
  {
    company: { ...COMPANY },
    asset: { code: 'ZC-2026-01359', name: '显示器', model: '27" 2K IPS', dept: '研发中心', keeper: '陈默', boughtAt: '2026-03-12' },
  },
  {
    company: { ...COMPANY },
    asset: { code: 'ZC-2026-01402', name: '办公椅', model: '人体工学椅 A3', dept: '行政部', keeper: '周敏', boughtAt: '2026-04-08' },
  },
  {
    company: { ...COMPANY },
    asset: { code: 'ZC-2026-01433', name: '激光打印机', model: 'M7605DW', dept: '财务部', keeper: '孙丽', boughtAt: '2026-05-20' },
  },
  {
    company: { ...COMPANY },
    asset: { code: 'ZC-2026-01511', name: '投影仪', model: 'CB-X06', dept: '市场部', keeper: '吴凡', boughtAt: '2026-06-15' },
  },
  {
    company: { ...COMPANY },
    asset: { code: 'ZC-2026-01570', name: '服务器机柜', model: '42U 网络机柜', dept: '运维部', keeper: '郑宇', boughtAt: '2026-07-02' },
  },
]

const { el } = createElementFactory('at')

/** 60×40 标签纸，版心 56×36；拼版到 A4 纵向（3 列 × 6 行 = 18 枚/张） */
const ASSET_TAG_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'LABEL_60X40',
  orientation: 'portrait',
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  tiling: {
    enabled: true,
    sheetPaperSize: 'A4',
    sheetOrientation: 'portrait',
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
    gapX: 2,
    gapY: 2,
    columns: 3,
  },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    // 纵向须留足分页安全余量（渲染管线为每页预留 2mm），否则末元素会被挤到第二页
    el('text', { left: 0, top: 0, width: 56, height: 3.8, formatter: '{company.name}', fontSize: 7.5, color: '#555555', textAlign: 'center', verticalAlign: 'middle' }),
    el('text', { left: 0, top: 3.8, width: 56, height: 5.5, formatter: '{asset.name}', fontSize: 11, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    el('qrcode', { left: 0, top: 10, width: 20, height: 19, formatter: '{asset.code}', qrCodeLevel: 'M' }),
    el('text', { left: 22, top: 10, width: 34, height: 4.2, formatter: '编号  {asset.code}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 22, top: 14.2, width: 34, height: 4.2, formatter: '型号  {asset.model}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 22, top: 18.4, width: 34, height: 4.2, formatter: '部门  {asset.dept}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 22, top: 22.6, width: 34, height: 4.2, formatter: '责任人 {asset.keeper}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 22, top: 26.8, width: 34, height: 3.6, formatter: '购置  {asset.boughtAt}', fontSize: 8, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 30.8, width: 56, height: 2.8, formatter: '扫码查看资产详情', fontSize: 6.5, color: '#888888', textAlign: 'center', verticalAlign: 'middle' }),
  ],
}

/** 资产标签示例 */
export const ASSET_TAG_SAMPLE: SampleTemplate = {
  id: 'asset-tag',
  name: '资产/设备标签',
  group: '标签',
  desc: '固定资产标签：二维码 + 编号、型号、部门、责任人与购置日期，拼版一张 A4 打 18 枚。',
  paper: '标签 60×40mm · 拼版 A4（3×6）',
  fields: ASSET_TAG_FIELDS,
  data: ASSET_TAG_DATA,
  batchData: ASSET_TAG_BATCH_DATA,
  template: ASSET_TAG_TEMPLATE,
}
