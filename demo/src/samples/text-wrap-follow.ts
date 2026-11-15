// demo/src/samples/text-wrap-follow.ts
// 示例十四：文本换行与跟随（V1.3.11 能力集合）——元素级「保留换行符」、关自动换行的单行溢出、
// 长文本缺省行高、跟随区竖线，以及「表格旁侧一栏不会被跟随拖走」（横向相交才跟随）。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/common/vue3'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

const { el, row } = createElementFactory('twf')

const PARAGRAPH = '温馨提示：本单据为一式三联，第一联存根、第二联客户、第三联财务；\n货物出门后七天内可凭单退换，逾期不候。'

/**
 * 只打印、不绑数据的纯静态示例：模板固定 A4 纵向，
 * 表格列宽和=元素宽（60+60=120）、行高和=元素高（10+10×3=40），每行 2 格。
 */
const template: TemplateData = {
  unit: 'mm',
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [
    el('table', {
      left: 10, top: 10, width: 120, height: 40,
      tableMode: 'static',
      tableColWidths: [60, 60],
      tableDefaultFontSize: 10,
      tableRows: [
        row('header', 10, ['项目', '金额']),
        row('data', 10, ['打印纸（A4）', '¥ 32.00']),
        row('data', 10, ['碳粉盒', '¥ 158.00']),
        row('data', 10, ['合计', '¥ 190.00']),
      ],
    } as any),
    // ① 保留换行符：\n 各占一行（属性台「自动换行」下方的同一行开关）
    el('longText', {
      left: 10, top: 55, width: 80, height: 26,
      fontSize: 10, formatter: PARAGRAPH, keepLineBreaks: true,
    } as any),
    // ② 关自动换行：单行溢出（要省略号请把显示形式设为「截断」）
    el('longText', {
      left: 10, top: 85, width: 80, height: 8,
      fontSize: 10, formatter: '关掉自动换行后这一行不再折行，超出框宽的部分直接溢出', wordWrap: false,
    } as any),
    // ③ 跟随区竖线：与表格横向相交，随表格实际底部一起走
    el('vline', { left: 95, top: 55, width: 1.8, height: 26 } as any),
    // ④ 表格旁侧一栏：与表格横向零交集，不会被「跟随」拖走（V1.3.11 修正）
    el('rect', { left: 140, top: 55, width: 50, height: 26, borderWidth: 0.75, borderColor: '#333333', borderStyle: 'solid' } as any),
    el('text', {
      left: 143, top: 58, width: 44, height: 20, fontSize: 9, formatter: '这一栏在表格右侧，\n不跟随表格移动',
    } as any),
  ],
}

export const TEXT_WRAP_FOLLOW_FIELDS: PrintBusinessField[] = []

export const TEXT_WRAP_FOLLOW_DATA: Record<string, any> = {}

export const TEXT_WRAP_FOLLOW_SAMPLE: SampleTemplate = {
  id: 'text-wrap-follow',
  name: '文本换行与跟随示例',
  group: '单据',
  desc: '一份模板看懂 V1.3.11 的四条出纸口径：保留换行符、关自动换行的单行溢出、长文本行高、跟随区只带走与表格对齐的元素',
  paper: 'A4 纵向 · 190mm 版心',
  fields: TEXT_WRAP_FOLLOW_FIELDS,
  data: TEXT_WRAP_FOLLOW_DATA,
  template,
}
