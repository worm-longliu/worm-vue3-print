// demo/src/samples/battery-module-label.ts
// 示例十一：电池模块出货标签（含 SN 条码）——95×75mm 自定义单枚，四列栅格做整版排版
// 版式取自业务侧导出的真实模板，三处按用户要求调整：字体统一黑体、条码改为倍率 3 + 条高 7mm + 203dpi、
// 元素高按行高和校正（demo/samples/index.ts 的硬规则：行高和必须等于元素高，否则加载时被回写顶开版式）。
import type { TableCell, TableCellBorder, TableCellBorders, TemplateData } from '@worm-vue3-print/common/vue3'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

const { el, row } = createElementFactory('bml')

/** 整版格线一致：0.75pt 实线 #333333，四边同值 */
const EDGE: TableCellBorder = { width: 0.75, style: 'solid', color: '#333333' }
const BORDERS: TableCellBorders = { top: EDGE, right: EDGE, bottom: EDGE, left: EDGE }

/** 文本单元格：原模板全部单元格都是加粗 + 居中，只有「注意事项」正文左对齐 */
const cell = (formatter: string, extra: Partial<TableCell> = {}): Partial<TableCell> => ({
  formatter,
  fontWeight: 'bold',
  align: 'center',
  borders: BORDERS,
  ...extra,
})

/** 被 colspan 覆盖的占位格：缺了它整行会错位 */
const MERGED = (): Partial<TableCell> => ({ formatter: '', merged: true })

/** 注意事项原文（含空行，照抄不改） */
const CAUTIONS = '1.Before modules are stacked together to form one battery set, please ensure that modules are of the same batch No. \n\n2.It is recommended that the interval of different module production dates in the same battery set does not exceed 30 days. If exceeding 30 days, suggest to charge to same SOC before use.'

/**
 * SN 条码：24 字符走 CODE128，跨 3 列（可用宽 61.34mm）。
 * 声明为条宽倍率 3 + 条高 7mm + 203dpi；实测落纸：203dpi 下这 297 模块只给到 1 个打印点
 * = 0.1251mm/模块（A 版宽度侧上限 61.34÷297=0.2065mm，2 点的门槛是 74.4mm），条区按 7mm 兑现。
 * 想让 203dpi 落到 2 点（0.2503mm）需整行合并 + 关显示文本或抬行高，见示例「无 SN 标签格」。
 */
const SN_BARCODE = cell('054PC070S050M1G32Q500055', {
  colspan: 3,
  cellType: 'barcode',
  barcodeType: 'CODE128',
  barWidth: 3,
  barHeight: 7,
  barFontSize: 14,
  printerDpi: 203,
})

/** 四列宽之和 = 元素宽 85mm；行高之和 = 元素高 63.2mm（Chromium 实测整表含塌陷边框 64.44mm） */
const COL_WIDTHS = [21.4, 24.2, 17.9, 21.5]

export const BATTERY_MODULE_LABEL_TABLE_ROWS = [
  row('header', 5.5, [
    cell('Description'), cell('echargeable LIB'), cell('PN'), cell('33030000450'),
  ], { repeatOnPage: true }),
  row('header', 5.5, [
    cell('Model'), cell('HV5120-S1'), cell('G.W(Kg)'), cell('48.0'),
  ], { repeatOnPage: true }),
  row('header', 5.5, [
    cell('Quantity(SET)'), cell('1'), cell('Batch No.'), cell('Q5'),
  ], { repeatOnPage: true }),
  row('header', 5.5, [
    cell('Manufacturer'), cell('Far East Battery Jiangsu Co.,Ltd.', { colspan: 3 }), MERGED(), MERGED(),
  ], { repeatOnPage: true }),
  row('header', 13, [
    cell('SN'), SN_BARCODE, MERGED(), MERGED(),
  ], { repeatOnPage: true }),
  row('header', 5.5, [
    cell('Production Date'), cell('2026-03-03'), cell('SOC'), cell('45%'),
  ], { repeatOnPage: true }),
  /**
   * 「注意事项」按原文的两处换行符断行（旧口径把 \n 折叠成一整段）。
   * 该格字号 6pt：分页预算是「纸内区 71mm − 表格 top 2.5mm = 68.5mm」，实测同口径下
   * 7pt 整表 71.52mm、6.5pt 69.44mm 都越界 → 分页把整行推到第二张标签（单枚标签出两版）；
   * 6pt 实测整表 64.44mm，单枚一页、无单词被拆开（画布与预览实测该格 8 行）。
   * 行高声明取实测值 22.7mm，免得依赖自动撑高后与「行高和 = 元素高」对不上。
   */
  row('header', 22.7, [
    cell('Cautions'), cell(CAUTIONS, { colspan: 3, align: 'left', fontSize: 6 }), MERGED(), MERGED(),
  ], { repeatOnPage: true }),
]

/**
 * 单枚一页的固定纸标签：整版只有一张表格，内容全部是静态文本（不含 {字段} 占位），
 * 因此示例的字段树与打印数据为空，批量打印即同版式多份。
 */
export const BATTERY_MODULE_LABEL_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'CUSTOM',
  customWidth: 95,
  customHeight: 75,
  orientation: 'portrait',
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  watermark: {},
  guides: [],
  name: '电池模块标签',
  elements: [
    el('table', {
      left: 2.45,
      top: 2.5,
      width: 85,
      height: 63.2,
      tableMode: 'dynamic',
      tableColWidths: COL_WIDTHS,
      tableDefaultFontSize: 7,
      tableDefaultPadding: 1,
      tableDefaultColor: '#333333',
      tablePagination: { enabled: true },
      fields: [],
      tableRows: BATTERY_MODULE_LABEL_TABLE_ROWS,
    }),
  ],
} as unknown as TemplateData

/** 内容全静态：无业务字段可注入 */
export const BATTERY_MODULE_LABEL_DATA: Record<string, any> = {}

export const BATTERY_MODULE_LABEL_SAMPLE: SampleTemplate = {
  id: 'battery-module-label',
  name: '电池模块标签（含 SN 条码）',
  group: '标签',
  desc: '95×75mm 单枚出货标签：四列栅格 + SN 码 128 条码行，全黑体，条码倍率 3 / 条高 7mm / 203dpi',
  paper: '95×75mm 自定义纸（单枚一页）',
  fields: [],
  data: BATTERY_MODULE_LABEL_DATA,
  batchData: [BATTERY_MODULE_LABEL_DATA, BATTERY_MODULE_LABEL_DATA],
  template: BATTERY_MODULE_LABEL_TEMPLATE,
}
