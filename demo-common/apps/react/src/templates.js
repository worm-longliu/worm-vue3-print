// 子 demo 自带的模板 / 字段 / 数据：整份文件可以直接抄进业务项目改造成你自己的数据源。
// 纸面口径与 core 渲染管线一致：单位 mm，tableColWidths 之和 = 表格元素宽度，
// tableRows 行高之和 = 表格元素高度，明细行用 rowType 'data' + '{goods.xxx}' 表达式绑定列表。

/** 元素工厂：同模板内 id 唯一 */
function factory(prefix) {
  let seq = 0
  return {
    el(type, options) {
      seq += 1
      return { id: `${prefix}-${seq}`, type, options, printElementType: { type, title: type } }
    },
    row(rowType, height, cells, extra = {}) {
      seq += 1
      const id = `${prefix}-${seq}`
      return { id, rowType, height, cells, ...extra }
    },
  }
}

/** 单元格：字符串即表达式，对象可带对齐与加粗 */
function cell(input) {
  if (typeof input === 'string') return { formatter: input }
  return input
}

// ───────────────────────── 示例一：销售出库单（A5，明细表格分页） ─────────────────────────
const so = factory('so')
const OUTBOUND_FIELDS = [
  { id: 'so-f1', fieldKey: 'company.name', fieldLabel: '公司名称', fieldType: 'string', sortOrder: 1 },
  { id: 'so-f2', fieldKey: 'customer.name', fieldLabel: '客户名称', fieldType: 'string', sortOrder: 2 },
  { id: 'so-f3', fieldKey: 'customer.contact', fieldLabel: '联系人', fieldType: 'string', sortOrder: 3 },
  { id: 'so-f4', fieldKey: 'order.no', fieldLabel: '出库单号', fieldType: 'string', sortOrder: 4 },
  { id: 'so-f5', fieldKey: 'order.date', fieldLabel: '出库日期', fieldType: 'date', sortOrder: 5 },
  { id: 'so-f6', fieldKey: 'order.total', fieldLabel: '合计金额', fieldType: 'number', sortOrder: 6 },
  { id: 'so-f7', fieldKey: 'goods', fieldLabel: '出库明细', fieldType: 'list', sortOrder: 7 },
  { id: 'so-f8', fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 8 },
  { id: 'so-f9', fieldKey: 'goods.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 9 },
  { id: 'so-f10', fieldKey: 'goods.amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 10 },
]
const OUTBOUND_DATA = {
  company: { name: '杭州示例智能装备有限公司' },
  customer: { name: '宁波精工机械制造有限公司', contact: '赵工' },
  order: { no: 'XSCK202609200086', date: '2026-09-20', total: 27933.0 },
  goods: [
    { name: '铝合金型材', qty: 120, amount: 3420.0 },
    { name: '不锈钢法兰', qty: 60, amount: 2760.0 },
    { name: '碳钢螺栓', qty: 800, amount: 960.0 },
    { name: '直线导轨', qty: 12, amount: 2232.0 },
    { name: '伺服电机', qty: 4, amount: 5120.0 },
    { name: '行星减速机', qty: 4, amount: 3440.0 },
    { name: '工业相机', qty: 2, amount: 4700.0 },
    { name: '气缸', qty: 8, amount: 1728.0 },
  ],
}
const OUTBOUND_TEMPLATE = {
  unit: 'mm',
  paperSize: 'A5',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: {
    height: 12,
    elements: [
      so.el('text', { left: 0, top: 0, width: 128, height: 5, formatter: '{company.name}', fontSize: 9, textAlign: 'center', verticalAlign: 'middle' }),
      so.el('text', { left: 0, top: 5, width: 128, height: 7, formatter: '销售出库单', fontSize: 16, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    ],
  },
  footer: {
    height: 8,
    elements: [
      so.el('text', { left: 0, top: 1, width: 88, height: 5, formatter: '{order.no}', fontSize: 8, color: '#666666', verticalAlign: 'middle' }),
      so.el('text', { left: 88, top: 1, width: 40, height: 5, formatter: '第 {pageIndex} 页 / 共 {totalPages} 页', fontSize: 8, color: '#666666', textAlign: 'right', verticalAlign: 'middle' }),
    ],
  },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    so.el('text', { left: 0, top: 0, width: 64, height: 5, formatter: '客户：{customer.name}', fontSize: 9, verticalAlign: 'middle' }),
    so.el('text', { left: 64, top: 0, width: 64, height: 5, formatter: '联系人：{customer.contact}', fontSize: 9, verticalAlign: 'middle' }),
    so.el('text', { left: 0, top: 5, width: 64, height: 5, formatter: '单号：{order.no}', fontSize: 9, verticalAlign: 'middle' }),
    so.el('text', { left: 64, top: 5, width: 64, height: 5, formatter: '日期：{order.date}', fontSize: 9, verticalAlign: 'middle' }),
    so.el('hline', { left: 0, top: 10.5, width: 128, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    so.el('table', {
      left: 0,
      top: 12,
      width: 128,
      height: 24,
      tableMode: 'dynamic',
      tableColWidths: [58, 24, 22, 24],
      tableDefaultFontSize: 8.5,
      tableDefaultPadding: 1,
      tablePagination: { enabled: true },
      tableRows: [
        so.row('header', 8, [cell({ formatter: '商品名称', align: 'left', fontWeight: 'bold' }), cell({ formatter: '数量', align: 'center', fontWeight: 'bold' }), cell({ formatter: '金额', align: 'center', fontWeight: 'bold' }), cell({ formatter: '备注', align: 'center', fontWeight: 'bold' })], { repeatOnPage: true }),
        so.row('data', 8, [cell('{goods.name}'), cell({ formatter: '{goods.qty}', align: 'right' }), cell({ formatter: '{MONEY(goods.amount)}', align: 'right' }), cell('')]),
        so.row('subtotal', 8, [cell({ formatter: '本页小计', align: 'left', fontWeight: 'bold' }), cell({ formatter: '{SUM(goods.qty)}', align: 'right', fontWeight: 'bold' }), cell({ formatter: '{MONEY(SUM(goods.amount))}', align: 'right', fontWeight: 'bold' }), cell('')]),
      ],
    }),
    so.el('text', { left: 0, top: 38, width: 70, height: 6, formatter: '合计金额：{MONEY(order.total)}', fontSize: 10, fontWeight: 'bold', verticalAlign: 'middle' }),
    so.el('barcode', { left: 78, top: 38, width: 50, height: 12, formatter: '{order.no}', barWidth: 1.2, displayValue: true, fontSize: 8 }),
  ],
}

// ───────────────────────── 示例二：资产标签（60×40 拼版 A4） ─────────────────────────
const at = factory('at')
const ASSET_FIELDS = [
  { id: 'at-f1', fieldKey: 'company.name', fieldLabel: '公司名称', fieldType: 'string', sortOrder: 1 },
  { id: 'at-f2', fieldKey: 'asset.code', fieldLabel: '资产编号', fieldType: 'string', sortOrder: 2 },
  { id: 'at-f3', fieldKey: 'asset.name', fieldLabel: '资产名称', fieldType: 'string', sortOrder: 3 },
  { id: 'at-f4', fieldKey: 'asset.model', fieldLabel: '规格型号', fieldType: 'string', sortOrder: 4 },
  { id: 'at-f5', fieldKey: 'asset.dept', fieldLabel: '使用部门', fieldType: 'string', sortOrder: 5 },
]
const ASSET_DATA = {
  company: { name: '杭州示例科技有限公司' },
  asset: { code: 'ZC-2026-01358', name: '笔记本电脑', model: 'ThinkBook 14 G6', dept: '研发中心' },
}
const ASSET_BATCH = [
  ASSET_DATA,
  { company: ASSET_DATA.company, asset: { code: 'ZC-2026-01359', name: '显示器', model: '27" 2K IPS', dept: '研发中心' } },
  { company: ASSET_DATA.company, asset: { code: 'ZC-2026-01402', name: '办公椅', model: '人体工学椅 A3', dept: '行政部' } },
]
const ASSET_TEMPLATE = {
  unit: 'mm',
  paperSize: 'LABEL_60X40',
  orientation: 'portrait',
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  tiling: {
    enabled: true, sheetPaperSize: 'A4', sheetOrientation: 'portrait',
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 }, gapX: 2, gapY: 2, columns: 3,
  },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    at.el('text', { left: 0, top: 0, width: 56, height: 3.8, formatter: '{company.name}', fontSize: 7.5, color: '#555555', textAlign: 'center', verticalAlign: 'middle' }),
    at.el('text', { left: 0, top: 3.8, width: 56, height: 5.5, formatter: '{asset.name}', fontSize: 11, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    at.el('qrcode', { left: 0, top: 10, width: 20, height: 19, formatter: '{asset.code}', qrCodeLevel: 'M' }),
    at.el('text', { left: 22, top: 10, width: 34, height: 4.2, formatter: '编号  {asset.code}', fontSize: 8, verticalAlign: 'middle' }),
    at.el('text', { left: 22, top: 14.2, width: 34, height: 4.2, formatter: '型号  {asset.model}', fontSize: 8, verticalAlign: 'middle' }),
    at.el('text', { left: 22, top: 18.4, width: 34, height: 4.2, formatter: '部门  {asset.dept}', fontSize: 8, verticalAlign: 'middle' }),
    at.el('text', { left: 0, top: 30.5, width: 56, height: 3, formatter: '扫码查看资产详情', fontSize: 6.5, color: '#888888', textAlign: 'center', verticalAlign: 'middle' }),
  ],
}

// ───────────────────────── 示例三：热敏小票（80mm 连续纸） ─────────────────────────
const tr = factory('tr')
const RECEIPT_FIELDS = [
  { id: 'tr-f1', fieldKey: 'store.name', fieldLabel: '门店名称', fieldType: 'string', sortOrder: 1 },
  { id: 'tr-f2', fieldKey: 'receipt.no', fieldLabel: '小票号', fieldType: 'string', sortOrder: 2 },
  { id: 'tr-f3', fieldKey: 'items', fieldLabel: '商品行', fieldType: 'list', sortOrder: 3 },
  { id: 'tr-f4', fieldKey: 'items.name', fieldLabel: '品名', fieldType: 'string', sortOrder: 4 },
  { id: 'tr-f5', fieldKey: 'total', fieldLabel: '应收合计', fieldType: 'number', sortOrder: 5 },
]
const RECEIPT_DATA = {
  store: { name: '示例便利超市（文一西路店）', address: '杭州市西湖区文一西路 100 号', tel: '400-000-0000' },
  receipt: { no: 'SP20260920-0007', cashier: '王芳', time: '2026-09-20 14:32' },
  items: [
    { name: '农夫山泉 550ml', qty: 2, price: 2.0, amount: 4.0 },
    { name: '全麦面包', qty: 1, price: 9.9, amount: 9.9 },
    { name: '拿铁（中杯）', qty: 1, price: 18.0, amount: 18.0 },
  ],
  total: 31.9,
}
const RECEIPT_TEMPLATE = {
  unit: 'mm',
  paperSize: 'THERMAL_80',
  orientation: 'portrait',
  margins: { top: 3, right: 2, bottom: 3, left: 2 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  firstPageOverlay: { height: 0, elements: [] },
  watermark: {},
  elements: [
    tr.el('text', { left: 0, top: 0, width: 76, height: 6, formatter: '{store.name}', fontSize: 14, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
    tr.el('text', { left: 0, top: 6, width: 76, height: 4, formatter: '{store.address}', fontSize: 8, textAlign: 'center', verticalAlign: 'middle' }),
    tr.el('hline', { left: 0, top: 10.5, width: 76, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    tr.el('text', { left: 0, top: 11.5, width: 38, height: 4, formatter: '小票号 {receipt.no}', fontSize: 8, verticalAlign: 'middle' }),
    tr.el('text', { left: 38, top: 11.5, width: 38, height: 4, formatter: '{receipt.time}', fontSize: 8, textAlign: 'right', verticalAlign: 'middle' }),
    tr.el('hline', { left: 0, top: 16, width: 76, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    tr.el('table', {
      left: 0,
      top: 17,
      width: 76,
      height: 12,
      tableMode: 'dynamic',
      tableColWidths: [40, 12, 12, 12],
      tableDefaultFontSize: 8,
      tableDefaultPadding: 1,
      tablePagination: { enabled: false },
      tableRows: [
        tr.row('header', 4, [cell({ formatter: '品名', align: 'left', fontWeight: 'bold' }), cell({ formatter: '数量', align: 'center', fontWeight: 'bold' }), cell({ formatter: '单价', align: 'right', fontWeight: 'bold' }), cell({ formatter: '金额', align: 'right', fontWeight: 'bold' })]),
        tr.row('data', 4, [cell('{items.name}'), cell({ formatter: '{items.qty}', align: 'center' }), cell({ formatter: '{items.price}', align: 'right' }), cell({ formatter: '{items.amount}', align: 'right' })]),
      ],
    }),
    tr.el('hline', { left: 0, top: 29.5, width: 76, height: 0.2, borderWidth: 0.4, borderColor: '#999999' }),
    tr.el('text', { left: 0, top: 30.5, width: 76, height: 5, formatter: '应收合计  {MONEY(total)}', fontSize: 11, fontWeight: 'bold', textAlign: 'right', verticalAlign: 'middle' }),
    tr.el('text', { left: 0, top: 36, width: 76, height: 4, formatter: '收银员 {receipt.cashier}', fontSize: 8, verticalAlign: 'middle' }),
    tr.el('barcode', { left: 8, top: 41, width: 60, height: 12, formatter: '{receipt.no}', barWidth: 1, displayValue: true, fontSize: 7 }),
  ],
}

/** 三个示例：单据 / 标签 / 小票，覆盖分页、拼版、连续纸三种出纸形态（group/paper/desc 供示例库卡片展示，口径同 demo） */
export const SAMPLES = [
  {
    id: 'outbound',
    name: '销售出库单（A5 分页）',
    group: '单据',
    paper: 'A5  portrait · 明细表格自动分页',
    desc: '表头字段 + 明细列表绑定，行数超出一页时按页重复表头与合计行。',
    fields: OUTBOUND_FIELDS,
    data: OUTBOUND_DATA,
    batchData: [OUTBOUND_DATA, { ...OUTBOUND_DATA, order: { ...OUTBOUND_DATA.order, no: 'XSCK202609200087' } }],
    template: OUTBOUND_TEMPLATE,
  },
  {
    id: 'asset',
    name: '资产标签（60×40 拼版）',
    group: '标签',
    paper: '60×40mm · 一纸多枚拼版',
    desc: '标签模板开启拼版后，批量数据按份铺满整张标签纸，一次出纸裁切即用。',
    fields: ASSET_FIELDS,
    data: ASSET_DATA,
    batchData: ASSET_BATCH,
    template: ASSET_TEMPLATE,
  },
  {
    id: 'receipt',
    name: '热敏小票（80mm 连续纸）',
    group: '小票',
    paper: 'THERMAL_80 连续纸',
    desc: '连续纸不设固定页高，按内容实际底部出纸，末尾带条码与金额合计。',
    fields: RECEIPT_FIELDS,
    data: RECEIPT_DATA,
    batchData: [RECEIPT_DATA],
    template: RECEIPT_TEMPLATE,
  },
]
