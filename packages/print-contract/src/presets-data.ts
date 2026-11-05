// 六个布局配方的数值数据，口径取自 skills/worm-vue3-print-mcp/references/layout-recipes.md。
// 区块 height 为 mm；fontSize/borderWidth 为 pt；坐标不写，由 presets.ts 展开代码按内容区计算。
// 表格 width/height 由展开代码按内容宽与区块高回填，tableColWidths 合计必须等于内容宽。
import type { DraftPreset } from './presets.js'

/** 单据明细表通用的四行骨架：header(重复)/data/subtotal/summary */
function docTableRows(colFormatters: {
  header: string[]
  data: string[]
  subtotal: string[]
  summary: string[]
}, rowHeightMm: number) {
  return [
    { id: 'header', type: 'header' as const, height: rowHeightMm, repeatOnPage: true, cells: colFormatters.header.map((f, i) => ({ id: `h${i}`, formatter: f })) },
    { id: 'data', type: 'data' as const, height: rowHeightMm, cells: colFormatters.data.map((f, i) => ({ id: `d${i}`, formatter: f })) },
    { id: 'subtotal', type: 'subtotal' as const, height: rowHeightMm, cells: colFormatters.subtotal.map((f, i) => ({ id: `s${i}`, formatter: f })) },
    { id: 'summary', type: 'summary' as const, height: rowHeightMm, cells: colFormatters.summary.map((f, i) => ({ id: `m${i}`, formatter: f })) },
  ]
}

export const DRAFT_PRESETS: DraftPreset[] = [
  {
    id: 'doc-a4',
    scene: 'A4 单据（出货单/对账单/订单）：抬头 + 元信息栅格 + 明细表 + 合计 + 签名栏',
    paper: { paperSize: 'A4', orientation: 'portrait', margins: { top: 10, right: 10, bottom: 10, left: 10 } },
    blocks: [
      { slot: 'title', height: 8, element: { type: 'text', options: { formatter: '{company.name}', fontSize: 16, fontWeight: 'bold', textAlign: 'center' } } },
      { slot: 'docTitle', height: 6, element: { type: 'text', options: { formatter: '{doc.title}', fontSize: 14, fontWeight: 'bold', textAlign: 'center' } } },
      {
        slot: 'meta', height: 6,
        cols: [
          { ratio: 0.25, element: { type: 'text', options: { formatter: '单号：{order.no}', fontSize: 10 } } },
          { ratio: 0.25, element: { type: 'text', options: { formatter: '日期：{order.date}', fontSize: 10 } } },
          { ratio: 0.25, element: { type: 'text', options: { formatter: '客户：{order.customer}', fontSize: 10 } } },
          { ratio: 0.25, element: { type: 'text', options: { formatter: '经手人：{order.clerk}', fontSize: 10 } } },
        ],
      },
      {
        slot: 'meta', height: 6,
        cols: [
          { ratio: 0.25, element: { type: 'text', options: { formatter: '仓库：{order.warehouse}', fontSize: 10 } } },
          { ratio: 0.25, element: { type: 'text', options: { formatter: '联系方式：{order.phone}', fontSize: 10 } } },
          { ratio: 0.5, element: { type: 'text', options: { formatter: '备注：{order.remark}', fontSize: 10 } } },
        ],
      },
      { slot: 'divider', height: 0.5, element: { type: 'hline', options: { borderWidth: 0.4, borderColor: '#333333' } } },
      {
        slot: 'table', height: 32,
        element: {
          type: 'table',
          options: {
            dataSource: 'items',
            tableColWidths: [60, 40, 30, 60],
            tableDefaultFontSize: 10,
            tableDefaultColor: '#333333',
            tableDefaultPadding: 1,
            tableRows: docTableRows(
              {
                header: ['品名', '数量', '单价', '金额'],
                data: ['{name}', '{qty}', '{MONEY(price)}', '{MONEY(amount)}'],
                subtotal: ['本页小计', '', '', '{MONEY(SUM(amount))}'],
                summary: ['合计', '', '', '{MONEY(SUM(amount))}'],
              },
              8,
            ),
          },
        },
      },
      { slot: 'total', height: 8, element: { type: 'text', options: { formatter: '金额大写：{UPPER(order.total)}', fontSize: 12, fontWeight: 'bold' } } },
      {
        slot: 'signs', height: 10,
        cols: [
          { ratio: 1 / 3, element: { type: 'text', options: { formatter: '制单人：{order.maker}', fontSize: 10 } } },
          { ratio: 1 / 3, element: { type: 'text', options: { formatter: '仓管员：{order.keeper}', fontSize: 10 } } },
          { ratio: 1 / 3, element: { type: 'text', options: { formatter: '收货人签字：________', fontSize: 10 } } },
        ],
      },
      { slot: 'pageNumber', height: 6, element: { type: 'pageNumber', options: { formatter: '{pageIndex} / {totalPages}', fontSize: 9, textAlign: 'center' } } },
    ],
  },
  {
    id: 'doc-a5',
    scene: 'A5 单据（同 doc-a4 的紧凑版，元信息两栏）',
    paper: { paperSize: 'A5', orientation: 'portrait', margins: { top: 8, right: 8, bottom: 8, left: 8 } },
    blocks: [
      { slot: 'title', height: 7, element: { type: 'text', options: { formatter: '{company.name}', fontSize: 14, fontWeight: 'bold', textAlign: 'center' } } },
      { slot: 'docTitle', height: 6, element: { type: 'text', options: { formatter: '{doc.title}', fontSize: 12, fontWeight: 'bold', textAlign: 'center' } } },
      {
        slot: 'meta', height: 6,
        cols: [
          { ratio: 0.5, element: { type: 'text', options: { formatter: '单号：{order.no}', fontSize: 10 } } },
          { ratio: 0.5, element: { type: 'text', options: { formatter: '日期：{order.date}', fontSize: 10 } } },
        ],
      },
      {
        slot: 'meta', height: 6,
        cols: [
          { ratio: 0.5, element: { type: 'text', options: { formatter: '客户：{order.customer}', fontSize: 10 } } },
          { ratio: 0.5, element: { type: 'text', options: { formatter: '经手人：{order.clerk}', fontSize: 10 } } },
        ],
      },
      { slot: 'divider', height: 0.5, element: { type: 'hline', options: { borderWidth: 0.4, borderColor: '#333333' } } },
      {
        slot: 'table', height: 24,
        element: {
          type: 'table',
          options: {
            dataSource: 'items',
            tableColWidths: [56, 24, 24, 28],
            tableDefaultFontSize: 9,
            tableDefaultColor: '#333333',
            tableDefaultPadding: 1,
            tableRows: docTableRows(
              {
                header: ['品名', '数量', '单价', '金额'],
                data: ['{name}', '{qty}', '{MONEY(price)}', '{MONEY(amount)}'],
                subtotal: ['本页小计', '', '', '{MONEY(SUM(amount))}'],
                summary: ['合计', '', '', '{MONEY(SUM(amount))}'],
              },
              6,
            ),
          },
        },
      },
      { slot: 'total', height: 6, element: { type: 'text', options: { formatter: '金额大写：{UPPER(order.total)}', fontSize: 11, fontWeight: 'bold' } } },
      {
        slot: 'signs', height: 8,
        cols: [
          { ratio: 1 / 3, element: { type: 'text', options: { formatter: '制单人：{order.maker}', fontSize: 9 } } },
          { ratio: 1 / 3, element: { type: 'text', options: { formatter: '仓管员：{order.keeper}', fontSize: 9 } } },
          { ratio: 1 / 3, element: { type: 'text', options: { formatter: '收货人签字：____', fontSize: 9 } } },
        ],
      },
      { slot: 'pageNumber', height: 5, element: { type: 'pageNumber', options: { formatter: '{pageIndex} / {totalPages}', fontSize: 8, textAlign: 'center' } } },
    ],
  },
  {
    id: 'receipt-80mm',
    scene: '80mm 热敏小票（连续纸）：店头 + 单号信息 + 明细表 + 合计收款 + 二维码',
    paper: { paperSize: 'THERMAL_80', margins: { top: 2, right: 3, bottom: 2, left: 3 } },
    blocks: [
      { slot: 'title', height: 6, element: { type: 'text', options: { formatter: '{shop.name}', fontSize: 11, fontWeight: 'bold', textAlign: 'center' } } },
      { slot: 'shopInfo', height: 4, element: { type: 'text', options: { formatter: '{shop.address} {shop.phone}', fontSize: 7, textAlign: 'center' } } },
      {
        slot: 'meta', height: 5,
        cols: [
          { ratio: 0.4, element: { type: 'text', options: { formatter: '单号:{order.no}', fontSize: 8 } } },
          { ratio: 0.3, element: { type: 'text', options: { formatter: '收银:{order.clerk}', fontSize: 8 } } },
          { ratio: 0.3, element: { type: 'text', options: { formatter: '{printTime}', fontSize: 8 } } },
        ],
      },
      { slot: 'divider', height: 0.5, element: { type: 'hline', options: { borderWidth: 0.4, borderColor: '#333333' } } },
      {
        slot: 'table', height: 18,
        element: {
          type: 'table',
          options: {
            dataSource: 'items',
            tableColWidths: [38, 12, 12, 12],
            tableDefaultFontSize: 8,
            tableDefaultColor: '#333333',
            tableDefaultPadding: 0.5,
            tableRows: [
              { id: 'header', type: 'header', height: 6, repeatOnPage: true, cells: [{ id: 'h0', formatter: '品名' }, { id: 'h1', formatter: '数量' }, { id: 'h2', formatter: '单价' }, { id: 'h3', formatter: '金额' }] },
              { id: 'data', type: 'data', height: 6, cells: [{ id: 'd0', formatter: '{name}' }, { id: 'd1', formatter: '{qty}' }, { id: 'd2', formatter: '{MONEY(price)}' }, { id: 'd3', formatter: '{MONEY(amount)}' }] },
              { id: 'summary', type: 'summary', height: 6, cells: [{ id: 'm0', formatter: '合计' }, { id: 'm1', formatter: '' }, { id: 'm2', formatter: '' }, { id: 'm3', formatter: '{MONEY(SUM(amount))}' }] },
            ],
          },
        },
      },
      {
        slot: 'total', height: 6,
        cols: [
          { ratio: 0.4, element: { type: 'text', options: { formatter: '合计', fontSize: 10, fontWeight: 'bold' } } },
          { ratio: 0.6, element: { type: 'text', options: { formatter: '{MONEY(order.total)}', fontSize: 12, fontWeight: 'bold', textAlign: 'right' } } },
        ],
      },
      {
        slot: 'pay', height: 5,
        cols: [
          { ratio: 0.5, element: { type: 'text', options: { formatter: '收款:{order.paid}', fontSize: 8 } } },
          { ratio: 0.5, element: { type: 'text', options: { formatter: '找零:{order.change}', fontSize: 8 } } },
        ],
      },
      {
        slot: 'qrcode', height: 28,
        element: { type: 'qrcode', options: { left: 23, width: 28, formatter: '{order.qrcode}', qrCodeLevel: 'M', qrQuietZone: 4 } },
      },
      { slot: 'footer', height: 5, element: { type: 'text', options: { formatter: '欢迎再次光临', fontSize: 8, textAlign: 'center' } } },
    ],
  },
  {
    id: 'label-60x40',
    scene: '60×40 标签（热敏）：品名 + 净重金额 + 条码，配 203dpi',
    paper: { paperSize: 'LABEL_60X40', margins: { top: 2, right: 2, bottom: 2, left: 2 } },
    blocks: [
      { slot: 'title', height: 4.2, element: { type: 'text', options: { formatter: '{shop.name}', fontSize: 8, textAlign: 'center' } } },
      { slot: 'productName', height: 5.4, element: { type: 'text', options: { formatter: '{goods.name}', fontSize: 11, fontWeight: 'bold', textAlign: 'center' } } },
      { slot: 'priceNote', height: 4, element: { type: 'text', options: { formatter: '{goods.priceNote}', fontSize: 8 } } },
      {
        slot: 'weightPrice', height: 5,
        cols: [
          { ratio: 0.5, element: { type: 'text', options: { formatter: '净重:{goods.weight}', fontSize: 9 } } },
          { ratio: 0.5, element: { type: 'text', options: { formatter: '{MONEY(goods.amount)}', fontSize: 12, fontWeight: 'bold', color: '#c8211e', textAlign: 'right' } } },
        ],
      },
      { slot: 'divider', height: 0.5, element: { type: 'hline', options: { borderWidth: 0.4, borderColor: '#333333' } } },
      {
        slot: 'barcode', height: 8,
        element: { type: 'barcode', options: { left: 8, width: 40, formatter: '{goods.barcode}', barWidth: 2, printerDpi: 203 } },
      },
      { slot: 'packInfo', height: 3.2, element: { type: 'text', options: { formatter: '{goods.pack} {goods.shelfLife}', fontSize: 6.5 } } },
      { slot: 'traceCode', height: 3.2, element: { type: 'text', options: { formatter: '门店:{shop.code} 追溯:{goods.traceCode}', fontSize: 6.5 } } },
    ],
  },
  {
    id: 'label-40x30',
    scene: '40×30 标签（热敏，更紧凑）：品名 + 大字价格 + 条码',
    paper: { paperSize: 'LABEL_40X30', margins: { top: 2, right: 2, bottom: 2, left: 2 } },
    blocks: [
      { slot: 'productName', height: 5, element: { type: 'text', options: { formatter: '{goods.name}', fontSize: 9, fontWeight: 'bold' } } },
      { slot: 'price', height: 7, element: { type: 'text', options: { formatter: '{MONEY(goods.price)}', fontSize: 16, fontWeight: 'bold', color: '#c8211e', textAlign: 'center' } } },
      {
        slot: 'barcode', height: 5.5,
        element: { type: 'barcode', options: { left: 3, width: 30, formatter: '{goods.barcode}', barWidth: 2, printerDpi: 203 } },
      },
      { slot: 'note', height: 3, element: { type: 'text', options: { formatter: '{goods.note}', fontSize: 6 } } },
    ],
  },
  {
    id: 'waybill-100x150',
    scene: '100×150 快递面单（自定义纸）：寄件区 + 大字收件区 + 条码 + 签收栏',
    paper: { paperSize: 'CUSTOM', customWidth: 100, customHeight: 150, margins: { top: 3, right: 3, bottom: 3, left: 3 } },
    blocks: [
      { slot: 'sender', height: 6, element: { type: 'text', options: { formatter: '寄件:{sender.name} {sender.phone}', fontSize: 10, fontWeight: 'bold' } } },
      { slot: 'senderAddr', height: 12, element: { type: 'longText', options: { formatter: '{sender.address}', fontSize: 9 } } },
      { slot: 'divider', height: 0.5, element: { type: 'hline', options: { borderWidth: 0.4, borderColor: '#333333' } } },
      { slot: 'receiver', height: 8, element: { type: 'text', options: { formatter: '收件:{receiver.name} {receiver.phone}', fontSize: 14, fontWeight: 'bold' } } },
      { slot: 'receiverAddr', height: 20, element: { type: 'longText', options: { formatter: '{receiver.address}', fontSize: 12 } } },
      { slot: 'divider', height: 0.5, element: { type: 'hline', options: { borderWidth: 0.4, borderColor: '#333333' } } },
      {
        slot: 'barcode', height: 15,
        element: { type: 'barcode', options: { left: 12, width: 70, formatter: '{waybill.no}', barWidth: 2, printerDpi: 203 } },
      },
      { slot: 'sign', height: 8, element: { type: 'text', options: { formatter: '签收人：________  签收时间：________', fontSize: 10 } } },
      { slot: 'footer', height: 5, element: { type: 'text', options: { formatter: '打印:{printDate} {printTime} 客服:{shop.hotline}', fontSize: 7, color: '#666666' } } },
    ],
  },
]
