// demo/src/samples/battery-module-label-no-sn.ts
// 示例十二：电池模块出货标签（无 SN 标签格）——条码保留，取消「SN」文字格并把条码格合并到整行
// 与「含 SN 条码」的差别都在 SN 那一行：原来「SN」占第 1 列、条码跨 3 列、文本字号 14；
// 这里条码跨满 4 列、文本字号 10（让出高度给条区，203dpi 下换到 2 个打印点）。
import type { TableCell, TableCellBorders, TemplateData } from '@worm-vue3-print/common/vue3'
import type { SampleTemplate } from './types'
import { BATTERY_MODULE_LABEL_TEMPLATE } from './battery-module-label'

/**
 * 从含 SN 版派生：深拷贝后改 SN 那一行——条码格 colspan 3 → 4、barFontSize 14 → 10，原「SN」标签格
 * 降级为 merged 占位格（沿用它的 id 与四边格线，保证每行格数仍等于列数，这是示例库与 HTML 表格的硬约束）。
 * 深拷贝是为了不与上一份示例共享行对象引用：设计器加载后会按渲染尺寸回写表格属性，共用会互相污染。
 */
function mergeBarcodeAcrossRow(): TemplateData {
  const copy = JSON.parse(JSON.stringify(BATTERY_MODULE_LABEL_TEMPLATE)) as any
  const options = copy.elements[0].options
  const snRow = options.tableRows.find((r: any) => r.cells.some((c: any) => c.cellType === 'barcode'))
  const [snLabel, barcode, ...merged] = snRow.cells as any[]
  const borders = snLabel.borders as TableCellBorders

  barcode.colspan = 4
  // 条码下方文本字号（相对条高 30）14 → 10：让出约 3.3 个模块的高度给条区，203dpi 下才换得到 2 个打印点
  barcode.barFontSize = 10
  const placeholder: Partial<TableCell> & { id: string } = {
    id: snLabel.id,
    borders,
    merged: true,
    rowspan: 1,
    colspan: 1,
    formatter: '',
  }
  snRow.cells = [barcode, ...merged, placeholder]

  copy.name = '电池模块标签（无 SN）'
  return copy as TemplateData
}

export const BATTERY_MODULE_LABEL_NO_SN_TEMPLATE: TemplateData = mergeBarcodeAcrossRow()

/** 与含 SN 版一样：内容全静态 */
export const BATTERY_MODULE_LABEL_NO_SN_DATA: Record<string, any> = {}

export const BATTERY_MODULE_LABEL_NO_SN_SAMPLE: SampleTemplate = {
  id: 'battery-module-label-no-sn',
  name: '电池模块标签（无 SN 标签格）',
  group: '标签',
  desc: '条码保留并合并到整行（跨 4 列）、文本字号 10，取消「SN」文字格；其余声明与含 SN 版一致',
  paper: '95×75mm 自定义纸（单枚一页）',
  fields: [],
  data: BATTERY_MODULE_LABEL_NO_SN_DATA,
  batchData: [BATTERY_MODULE_LABEL_NO_SN_DATA, BATTERY_MODULE_LABEL_NO_SN_DATA],
  template: BATTERY_MODULE_LABEL_NO_SN_TEMPLATE,
}
