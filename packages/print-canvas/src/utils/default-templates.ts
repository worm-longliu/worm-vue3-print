import type { TemplateData } from '../types'

/** 页码元素（所有模版共用）：页码包裹在文本元素中 */
function pageNumEl(left: number) {
  return {
    id: `dp_footer_${left}`,
    type: 'text' as const,
    options: {
      left, top: 0, width: 40, height: 7,
      formatter: '第{pageIndex}页/共{totalPages}页',
      fontSize: 9, textAlign: 'right' as const,
    },
    printElementType: { type: 'text' as const, title: '页码' },
  }
}

/** 表格商品列定义（所有业务类型共用） */
function goodsTableRows() {
  const headers = ['序号', '商品名称', '规格', '单位', '数量', '单价', '金额', '备注']
  return [
    {
      id: 'dpt_h', type: 'header' as const, height: 8, repeatOnPage: true,
      cells: headers.map((h, i) => ({
        id: `dpt_h_${i}`, formatter: h,
        align: (i === 0 || i >= 3 ? 'center' : undefined) as 'center' | undefined,
        valign: 'middle' as const, fontSize: 10, fontWeight: 'bold',
        backgroundColor: '#f5f5f5',
      })),
    },
    {
      id: 'dpt_d', type: 'data' as const, height: 7,
      cells: [
        { id: 'dpt_d_0', formatter: '{#index}', align: 'center' as const, valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_1', formatter: '{goods.name}', valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_2', formatter: '{goods.spec}', valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_3', formatter: '{goods.unit}', align: 'center' as const, valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_4', formatter: '{goods.qty}', align: 'right' as const, valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_5', formatter: '{goods.price}', align: 'right' as const, valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_6', formatter: '{goods.amount}', align: 'right' as const, valign: 'middle' as const, fontSize: 9 },
        { id: 'dpt_d_7', formatter: '{goods.remark}', valign: 'middle' as const, fontSize: 9 },
      ],
    },
    {
      id: 'dpt_s', type: 'summary' as const, height: 8,
      cells: [
        { id: 'dpt_s_0', formatter: '', colspan: 3, merged: true },
        { id: 'dpt_s_3', formatter: '合计', align: 'center' as const, valign: 'middle' as const, fontSize: 10, fontWeight: 'bold', backgroundColor: '#f5f5f5' },
        { id: 'dpt_s_4', formatter: '', merged: true },
        { id: 'dpt_s_5', formatter: '', merged: true },
        { id: 'dpt_s_6', formatter: '{order.total}', align: 'right' as const, valign: 'middle' as const, fontSize: 10, fontWeight: 'bold', backgroundColor: '#f5f5f5' },
        { id: 'dpt_s_7', formatter: '', merged: true },
      ],
    },
  ]
}

function goodsTable(top: number) {
  return {
    id: 'dpt_goods',
    type: 'table' as const,
    options: {
      left: 10, top, width: 190, height: 160,
      tableMode: 'dynamic' as const,
      dataSource: 'goods',
      tableRows: goodsTableRows(),
      tableColWidths: [15, 45, 25, 15, 25, 25, 25, 15],
      tableDefaultFontSize: 10,
      tableDefaultPadding: 4,
    },
    printElementType: { type: 'table' as const, title: '商品明细' },
  }
}

/** 文本元素快捷构造 */
function textEl(id: string, opts: {
  left: number; top: number; width: number; height?: number;
  content: string; fontSize?: number; fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right'
}) {
  return {
    id,
    type: 'text' as const,
    options: {
      left: opts.left, top: opts.top, width: opts.width, height: opts.height ?? 7,
      content: opts.content, fontSize: opts.fontSize ?? 10,
      ...(opts.fontWeight ? { fontWeight: opts.fontWeight } : {}),
      ...(opts.textAlign ? { textAlign: opts.textAlign } : {}),
    },
    printElementType: { type: 'text' as const, title: opts.content.slice(0, 6) },
  }
}

function hline(id: string, top: number) {
  return {
    id,
    type: 'hline' as const,
    options: { left: 10, top, width: 190, height: 0, borderWidth: 1 },
    printElementType: { type: 'hline' as const, title: '分隔线' },
  }
}

const PURCHASE_RECEIPT: TemplateData = {
  unit: 'mm', paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 10, elements: [pageNumEl(150)] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [
    textEl('dpr_title', { left: 55, top: 0, width: 80, content: '采购收货单', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }),
    hline('dpr_line1', 12),
    textEl('dpr_supplier', { left: 10, top: 16, width: 90, content: '供应商: {supplier.name}' }),
    textEl('dpr_phone', { left: 10, top: 24, width: 90, content: '电话: {supplier.phone}' }),
    textEl('dpr_addr', { left: 10, top: 32, width: 90, content: '地址: {supplier.address}' }),
    textEl('dpr_orderno', { left: 110, top: 16, width: 90, content: '单号: {order.no}', textAlign: 'right' }),
    textEl('dpr_orderdate', { left: 110, top: 24, width: 90, content: '日期: {order.date}', textAlign: 'right' }),
    hline('dpr_line2', 42),
    goodsTable(46),
    textEl('dpr_sign_recv', { left: 10, top: 220, width: 90, content: '收货人: _________' }),
    textEl('dpr_sign_buyer', { left: 110, top: 220, width: 90, content: '采购员: _________', textAlign: 'right' }),
    textEl('dpr_sign_audit', { left: 10, top: 230, width: 90, content: '审核人: _________' }),
    textEl('dpr_sign_date', { left: 110, top: 230, width: 90, content: '日期: _________', textAlign: 'right' }),
  ],
}

const WHOLESALE_SALES: TemplateData = {
  unit: 'mm', paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 10, elements: [pageNumEl(150)] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [
    textEl('dws_title', { left: 55, top: 0, width: 80, content: '批发销售单', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }),
    hline('dws_line1', 12),
    textEl('dws_customer', { left: 10, top: 16, width: 90, content: '客户: {receiver.name}' }),
    textEl('dws_phone', { left: 10, top: 24, width: 90, content: '电话: {receiver.phone}' }),
    textEl('dws_addr', { left: 10, top: 32, width: 90, content: '地址: {receiver.address}' }),
    textEl('dws_orderno', { left: 110, top: 16, width: 90, content: '单号: {order.no}', textAlign: 'right' }),
    textEl('dws_orderdate', { left: 110, top: 24, width: 90, content: '日期: {order.date}', textAlign: 'right' }),
    hline('dws_line2', 42),
    goodsTable(46),
    textEl('dws_sign_maker', { left: 10, top: 220, width: 60, content: '制单: _________' }),
    textEl('dws_sign_audit', { left: 80, top: 220, width: 60, content: '审核: _________' }),
    textEl('dws_sign_pay', { left: 150, top: 220, width: 50, content: '收款: _________' }),
  ],
}

const IN_OUT: TemplateData = {
  unit: 'mm', paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 10, elements: [pageNumEl(150)] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [
    textEl('dio_title', { left: 55, top: 0, width: 80, content: '出入库单', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }),
    hline('dio_line1', 12),
    textEl('dio_orderno', { left: 10, top: 16, width: 90, content: '单号: {order.no}' }),
    textEl('dio_type', { left: 110, top: 16, width: 90, content: '类型: {order.type}', textAlign: 'right' }),
    textEl('dio_date', { left: 10, top: 24, width: 90, content: '日期: {order.date}' }),
    hline('dio_line2', 34),
    goodsTable(38),
    textEl('dio_sign_handler', { left: 10, top: 220, width: 90, content: '经办人: _________' }),
    textEl('dio_sign_audit', { left: 110, top: 220, width: 90, content: '审核: _________', textAlign: 'right' }),
  ],
}

const INVENTORY: TemplateData = {
  unit: 'mm', paperSize: 'A4', orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 10, elements: [pageNumEl(150)] },
  firstPageOverlay: { height: 0, elements: [] },
  elements: [
    textEl('div_title', { left: 55, top: 0, width: 80, content: '库存盘点单', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }),
    hline('div_line1', 12),
    textEl('div_date', { left: 10, top: 16, width: 90, content: '盘点日期: _________' }),
    hline('div_line2', 26),
    goodsTable(30),
    textEl('div_sign_counter', { left: 10, top: 220, width: 90, content: '盘点人: _________' }),
    textEl('div_sign_audit', { left: 110, top: 220, width: 90, content: '审核: _________', textAlign: 'right' }),
  ],
}

export const DEFAULT_TEMPLATES: Record<string, TemplateData> = {
  purchase_receipt: PURCHASE_RECEIPT,
  wholesale_sales: WHOLESALE_SALES,
  in_out: IN_OUT,
  inventory: INVENTORY,
}
