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

/** 商品原型：图片在 4 张占位图间循环复用 */
interface GoodsProto {
  name: string
  spec: string
  unit: string
  qty: number
  price: number
}

const GOODS_PROTOS: GoodsProto[] = [
  { name: '蓝牙降噪头戴耳机', spec: 'WH-900 / 曜石黑', unit: '副', qty: 12, price: 399 },
  { name: '机械键盘（青轴）', spec: 'KB-104 / RGB 背光', unit: '把', qty: 8, price: 259 },
  { name: '无线双模鼠标', spec: 'M-620 / 2.4G+蓝牙', unit: '个', qty: 20, price: 89 },
  { name: '高速 U 盘', spec: 'U3-128G / USB3.2', unit: '个', qty: 30, price: 79 },
  { name: '27 英寸 4K 显示器', spec: 'MN-27U / IPS', unit: '台', qty: 6, price: 1299 },
  { name: 'Type-C 扩展坞', spec: 'DK-09 / 九合一', unit: '个', qty: 15, price: 169 },
  { name: '便携充电宝', spec: 'PB-20K / 20000mAh', unit: '个', qty: 18, price: 129 },
  { name: '高清网络摄像头', spec: 'CAM-1080 / 自动对焦', unit: '个', qty: 10, price: 199 },
  { name: '桌面立体声音箱', spec: 'SP-S5 / 蓝牙 5.3', unit: '对', qty: 12, price: 159 },
  { name: '无线充电板', spec: 'WC-15 / 15W 快充', unit: '个', qty: 25, price: 69 },
  { name: 'M.2 固态硬盘盒', spec: 'EN-NV3 / USB3.2', unit: '个', qty: 16, price: 75 },
  { name: '铝合金笔记本支架', spec: 'ST-AL / 六档可调', unit: '个', qty: 22, price: 59 },
  { name: 'USB-C 数据线（2 米）', spec: 'CB-C2 / 100W', unit: '条', qty: 40, price: 29 },
  { name: '磁吸防蓝光窥膜', spec: 'PF-14 / 14 英寸', unit: '片', qty: 14, price: 49 },
  { name: '无线演示翻页笔', spec: 'PP-R2 / 红光', unit: '支', qty: 18, price: 89 },
  { name: '移动硬盘（1TB）', spec: 'HD-1T / 2.5 英寸', unit: '块', qty: 10, price: 369 },
  { name: 'USB 电容麦克风', spec: 'MIC-C / 心形指向', unit: '套', qty: 8, price: 299 },
  { name: '平板触控笔', spec: 'PEN-T / 防误触磁吸', unit: '支', qty: 12, price: 219 },
  { name: '桌面理线器套装', spec: 'CX-06 / 硅胶 6 件', unit: '套', qty: 30, price: 19 },
  { name: 'WiFi6 千兆路由器', spec: 'RT-AX6 / 3000M', unit: '台', qty: 9, price: 329 },
]

/** 静态打印数据：图片地址使用站点同源相对路径（public/images）；20 条明细用于演示多页分页 */
export const COMPREHENSIVE_DATA: Record<string, any> = {
  doc: {
    no: 'ZH-20260921-008',
    date: '2026-09-21',
    warehouse: '华东一号仓（杭州）',
    keeper: '陈明',
  },
  items: GOODS_PROTOS.map((g, i) => {
    const seq = i + 1
    const barcode = `69${String(seq).padStart(11, '0')}`
    return {
      seq,
      image: `${import.meta.env.BASE_URL}images/goods-${(i % 4) + 1}.png`,
      name: g.name,
      spec: g.spec,
      unit: g.unit,
      qty: g.qty,
      price: g.price,
      amount: g.qty * g.price,
      barcode,
      qrcode: `https://example.com/item/${barcode}`,
    }
  }),
}

/** 综合示例模板 */
export const COMPREHENSIVE_SHOWCASE_SAMPLE: SampleTemplate = {
  id: 'comprehensive-showcase',
  name: '综合示例模板',
  group: '单据',
  desc: 'A4 横向：多级表头（跨列分组 + 跨行合并，每页自动重复），明细行同时展示商品图片、条形码与二维码。',
  paper: 'A4 横向 · 277mm 版心',
  fields: COMPREHENSIVE_FIELDS,
  data: COMPREHENSIVE_DATA,
  template: rawTemplate as unknown as TemplateData,
}
