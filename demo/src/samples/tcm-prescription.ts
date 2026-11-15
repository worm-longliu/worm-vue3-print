// demo/src/samples/tcm-prescription.ts
// 示例十三：中药处方笺——药材按「每行 4 列」流式排布，长药名自动跨两列（GitHub issue #5 的场景）
// 版式说明：A5 版心 132mm 分 4 列（列宽 30mm、间距 4mm），11 味药一行排 4 味；
// 「炙黄芪（先煎）30g」「鸡血藤（后下）20g」这类长单元比一列宽，开「内容过长时跨列」后各吃掉两个列位，
// 当前行列位不够就把整味药挪到下一行行首（绝不切词），单元仍锚在列界上所以左右都齐。
// 药材明细来自 data.drugs，单元模板 {name} {spec} 与表格单元格共用同一套表达式。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/common/vue3'
import { createElementFactory } from './element-helper'
import type { SampleTemplate } from './types'

/** 处方业务字段：药材明细是列表容器（fieldType='list'），供流式列表取数据源 */
export const TCM_PRESCRIPTION_FIELDS: PrintBusinessField[] = [
  { id: 'tcm-1', fieldKey: 'hospital', fieldLabel: '医疗机构', fieldType: 'string', sortOrder: 1 },
  { id: 'tcm-2', fieldKey: 'department', fieldLabel: '科室', fieldType: 'string', sortOrder: 2 },
  { id: 'tcm-3', fieldKey: 'patient', fieldLabel: '患者姓名', fieldType: 'string', sortOrder: 3 },
  { id: 'tcm-4', fieldKey: 'sex', fieldLabel: '性别', fieldType: 'string', sortOrder: 5 },
  { id: 'tcm-5', fieldKey: 'age', fieldLabel: '年龄', fieldType: 'string', sortOrder: 6 },
  { id: 'tcm-6', fieldKey: 'prescNo', fieldLabel: '处方号', fieldType: 'string', sortOrder: 7 },
  { id: 'tcm-7', fieldKey: 'diagnosis', fieldLabel: '临床诊断', fieldType: 'string', sortOrder: 8 },
  { id: 'tcm-8', fieldKey: 'drugs', fieldLabel: '药材明细', fieldType: 'list', sortOrder: 9 },
  { id: 'tcm-9', fieldKey: 'drugs.name', fieldLabel: '药名', fieldType: 'string', sortOrder: 10 },
  { id: 'tcm-10', fieldKey: 'drugs.spec', fieldLabel: '剂量', fieldType: 'string', sortOrder: 11 },
  { id: 'tcm-11', fieldKey: 'note', fieldLabel: '医嘱', fieldType: 'string', sortOrder: 12 },
  { id: 'tcm-12', fieldKey: 'doctor', fieldLabel: '医师', fieldType: 'string', sortOrder: 13 },
  { id: 'tcm-13', fieldKey: 'amount', fieldLabel: '费用合计', fieldType: 'number', sortOrder: 14 },
]

/** 静态打印数据：11 味药，其中两味带炮制备注（长单元），最后一行只剩 3 味演示整味换行 */
export const TCM_PRESCRIPTION_DATA: Record<string, any> = {
  hospital: '杭州市中医医院·中医门诊',
  department: '内科',
  patient: '王秀兰',
  sex: '女',
  age: '58 岁',
  prescNo: 'CM202608120037',
  diagnosis: '气虚血瘀证',
  drugs: [
    { name: '黄芪', spec: '20g' },
    { name: '当归尾', spec: '15g' },
    { name: '赤芍', spec: '10g' },
    { name: '川芎', spec: '10g' },
    { name: '炙黄芪（先煎）', spec: '30g' },
    { name: '地龙', spec: '10g' },
    { name: '桃仁', spec: '10g' },
    { name: '红花', spec: '10g' },
    { name: '丹参', spec: '15g' },
    { name: '鸡血藤（后下）', spec: '20g' },
    { name: '甘草', spec: '6g' },
  ],
  note: '共 11 味，水煎分早晚两次温服，七剂。忌生冷辛辣。',
  doctor: '李医生',
  amount: 168.5,
}

/** 批量数据：第二张方子药材更少，验证「同一模板换数据不空版、不错列」 */
export const TCM_PRESCRIPTION_BATCH_DATA: Record<string, any>[] = [
  TCM_PRESCRIPTION_DATA,
  {
    ...TCM_PRESCRIPTION_DATA,
    patient: '陈国平',
    sex: '男',
    age: '42 岁',
    prescNo: 'CM202608120041',
    diagnosis: '肝郁脾虚证',
    drugs: [
      { name: '柴胡', spec: '10g' },
      { name: '白芍', spec: '15g' },
      { name: '麸炒白术（麸炒）', spec: '20g' },
      { name: '茯苓', spec: '15g' },
      { name: '炙甘草', spec: '6g' },
    ],
    note: '共 5 味，水煎服，十四剂。',
    doctor: '李医生',
    amount: 96.0,
  },
]

const { el } = createElementFactory('tcm')

/** A5 纵向处方笺：148×210，页边距各 8mm，版心 132×194 */
const TCM_PRESCRIPTION_TEMPLATE: TemplateData = {
  unit: 'mm',
  paperSize: 'A5',
  orientation: 'portrait',
  margins: { top: 8, right: 8, bottom: 8, left: 8 },
  header: {
    height: 15,
    elements: [
      el('text', { left: 0, top: 0, width: 132, height: 6, formatter: '{hospital}', fontSize: 13, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' }),
      el('text', { left: 0, top: 6.5, width: 132, height: 4, formatter: '科室：{department}　处方号：{prescNo}', fontSize: 8.5, textAlign: 'center', verticalAlign: 'middle', color: '#555555' }),
      el('hline', { left: 0, top: 12, width: 132, height: 1, borderWidth: 0.75, borderColor: '#333333' }),
    ],
  },
  footer: {
    height: 13,
    elements: [
      el('hline', { left: 0, top: 0, width: 132, height: 1, borderWidth: 0.75, borderColor: '#333333' }),
      el('text', { left: 0, top: 2, width: 66, height: 5, formatter: '医师：{doctor}', fontSize: 8.5, verticalAlign: 'middle' }),
      el('text', { left: 66, top: 2, width: 66, height: 5, formatter: '金额：¥{MONEY(amount)}', fontSize: 8.5, textAlign: 'right', verticalAlign: 'middle' }),
    ],
  },
  watermark: {},
  elements: [
    el('text', { left: 0, top: 0, width: 132, height: 4.5, formatter: '姓名：{patient}　性别：{sex}　年龄：{age}　诊断：{diagnosis}', fontSize: 9, verticalAlign: 'middle' }),
    el('text', { left: 0, top: 5.5, width: 10, height: 5, formatter: 'Rp', fontSize: 12.5, fontWeight: 'bold', verticalAlign: 'middle' }),
    // 流式列表：每行 4 列、行高 8mm（最小高）、间距 4mm；跨列打开，上限 2 列
    // 单元模板是一条完整表达式，列表路径写在里面，不需要再配数据源
    el('flowList', {
      left: 0, top: 12, width: 132, height: 32,
      formatter: '{drugs.name} {drugs.spec}',
      fontSize: 10.5, color: '#222222',
      flowColumns: 4, flowRowHeight: 8, flowGapX: 4,
      flowAutoSpan: true, flowMaxSpan: 2,
    }),
    el('longText', { left: 0, top: 46, width: 132, height: 8, formatter: '医嘱：{note}', fontSize: 9, lineHeight: 13, color: '#555555' }),
  ],
}

/** 中药处方笺示例：药材流式排布（每行 4 列 + 长药名自动跨两列） */
export const TCM_PRESCRIPTION_SAMPLE: SampleTemplate = {
  id: 'tcm-prescription',
  name: '中药处方笺',
  group: '单据',
  desc: '药材流式排布：每行 4 列、行高 8mm，长药名自动跨两列且整味换行不切词；单元模板与表格单元格共用同一套表达式。',
  paper: 'A5 纵向（页边距 8mm）',
  fields: TCM_PRESCRIPTION_FIELDS,
  data: TCM_PRESCRIPTION_DATA,
  batchData: TCM_PRESCRIPTION_BATCH_DATA,
  template: TCM_PRESCRIPTION_TEMPLATE,
}
