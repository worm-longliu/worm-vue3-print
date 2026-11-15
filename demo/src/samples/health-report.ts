// demo/src/samples/health-report.ts
// 体检报告示例：5 页 A4 纵向多页面模板，每个检验项目独占一页。
// 表格（受检人信息 / 异常汇总 / 多级表头血常规 / 生化 / 尿常规 / 影像）、
// 图表（历年趋势折线 / 白细胞分类柱状 / 参考区间条，均为按业务数据生成的内联 SVG）、
// 文字描述（总检结论 / 健康建议 / 各专项检验意见）三类元素混排。
// 版式硬约束：版心 190×277mm，页眉 14mm、页脚 18mm，正文预算 245mm；
// 表格 tableColWidths 之和 = 元素宽度，tableRows 模板行高之和 = 元素高度，每行 cells 数 = 列数。
import type { TemplateData } from '@worm-vue3-print/common/vue3'
import { createElementFactory, type CellInput } from './element-helper'
import type { SampleTemplate } from './types'
import {
  HEALTH_REPORT_FIELDS,
  HEALTH_REPORT_DATA,
  HEALTH_REPORT_BATCH_DATA,
  buildHealthReportCharts,
} from './health-report.data'

const { el, row } = createElementFactory('hr')
const CHARTS = buildHealthReportCharts(HEALTH_REPORT_DATA)

const INK = '#26364a'
const SUB = '#6b7c8f'
const HEAD_BG = '#eef2f7'
const WARN = '#d0453b'

/** 表头单元格：统一浅底、居中、加粗；extra 用于多级表头的 rowspan / colspan */
const h = (text: string, extra: Record<string, unknown> = {}): CellInput => ({
  formatter: text, align: 'center', valign: 'middle',
  fontWeight: 'bold', backgroundColor: HEAD_BG, fontSize: 8.5,
  ...extra,
})

/** 数据单元格：左对齐为主，可覆盖对齐与颜色 */
const c = (formatter: string, extra: Record<string, unknown> = {}): CellInput => ({
  formatter, valign: 'middle', fontSize: 8.5, padding: 1, ...extra,
})

/** 被 rowspan / colspan 覆盖的占位格 */
const gap = (): CellInput => ({ merged: true })

/** 区块标题 */
const section = (title: string, top: number) =>
  el('text', {
    left: 0, top, width: 190, height: 7,
    formatter: title, fontSize: 10.5, fontWeight: 'bold', color: INK,
    verticalAlign: 'middle', backgroundColor: HEAD_BG,
  })

/** 文字描述：保留数据里的换行，长段落自动折行 */
const prose = (formatter: string, top: number, height: number, fontSize = 9) =>
  el('longText', {
    left: 0, top, width: 190, height,
    formatter, fontSize, lineHeight: 14, color: INK,
    keepLineBreaks: true, wordWrap: true,
    borderWidth: 0.5, borderColor: '#dfe6ee', contentPaddingLeft: 2,
  })

/**
 * 图表：用 image 元素承载内联 SVG data URL，画布与出纸端同口径显示，且不依赖图表插件。
 * 高度按 SVG viewBox 比例换算（190mm × 高/700），contain 恰好铺满、文字不变形。
 */
const chart = (url: string, top: number, height: number) =>
  el('image', {
    left: 0, top, width: 190, height,
    src: url,
    borderWidth: 0.5, borderColor: '#dfe6ee',
  })

/** 统一的页眉：机构、报告编号、受检人、标题、分隔线 */
function headerElements(): TemplateData['header']['elements'] {
  return [
    el('text', {
      left: 0, top: 0, width: 120, height: 5,
      formatter: '{report.org}', fontSize: 8.5, color: SUB, verticalAlign: 'middle',
    }),
    el('text', {
      left: 120, top: 0, width: 70, height: 5,
      formatter: '{report.no} · {report.name}', fontSize: 8.5, color: SUB,
      textAlign: 'right', verticalAlign: 'middle',
    }),
    el('text', {
      left: 0, top: 5, width: 190, height: 8,
      formatter: '{report.title}', fontSize: 15, fontWeight: 'bold',
      letterSpacing: 3, textAlign: 'center', verticalAlign: 'middle', color: INK,
    }),
    el('hline', { left: 0, top: 13, width: 190, height: 1, borderWidth: 0.8, borderColor: INK }),
  ]
}

/** 统一的页脚：免责说明、连续页码、报告验真二维码 */
function footerElements(): TemplateData['footer']['elements'] {
  return [
    el('hline', { left: 0, top: 0, width: 190, height: 1, borderWidth: 0.6, borderColor: '#dfe6ee' }),
    el('text', {
      left: 0, top: 2, width: 150, height: 5,
      formatter: '本报告仅供健康参考，不作为临床诊断依据；如有不适请及时就医。',
      fontSize: 7.5, color: SUB, verticalAlign: 'middle',
    }),
    el('text', {
      left: 0, top: 8, width: 150, height: 5,
      formatter: '体检日期：{report.examDate}　总检医师：{report.doctor}　审核：{report.reviewer}',
      fontSize: 7.5, color: SUB, verticalAlign: 'middle',
    }),
    el('text', {
      left: 110, top: 12, width: 50, height: 5,
      formatter: '第 {pageIndex} 页 / 共 {totalPages} 页',
      fontSize: 8, color: INK, textAlign: 'right', verticalAlign: 'middle',
    }),
    el('qrcode', {
      left: 168, top: 1, width: 16, height: 16,
      formatter: '{report.verifyUrl}',
    }),
  ]
}

/** 单页模板：五页纸张、页边距、页眉页脚完全一致（多页面模板的硬校验） */
function page(name: string, elements: TemplateData['elements']): TemplateData {
  return {
    unit: 'mm',
    paperSize: 'A4',
    orientation: 'portrait',
    name,
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 14, elements: headerElements() },
    footer: { height: 18, elements: footerElements() },
    watermark: {},
    elements,
  }
}

// ── 第 1 页：封面 / 受检人信息 / 总检结论 / 异常汇总 ───────────────────────────
const PAGE_1 = page('封面与总检结论', [
  section('一、受检人信息', 0),
  el('table', {
    left: 0, top: 8, width: 190, height: 32,
    tableMode: 'dynamic', tableColWidths: [24, 71, 24, 71],
    tableDefaultFontSize: 9, tableDefaultPadding: 1,
    tablePagination: { enabled: false },
    tableRows: [
      row('header', 8, [h('姓名'), c('{report.name}'), h('性别'), c('{report.sex}')]),
      row('header', 8, [h('年龄'), c('{report.age}'), h('体检日期'), c('{report.examDate}')]),
      row('header', 8, [h('报告编号'), c('{report.no}'), h('联系电话'), c('{report.phone}')]),
      row('header', 8, [h('体检套餐'), c('{report.package}'), h('总检医师'), c('{report.doctor}')]),
    ],
  }),
  section('二、总检结论', 44),
  prose('{summary.conclusion}', 52, 46),
  section('三、健康建议', 102),
  prose('{summary.advice}', 110, 34),
  section('四、异常指标汇总（共 {summary.abnormalCount} 项）', 148),
  el('table', {
    left: 0, top: 156, width: 190, height: 23,
    tableMode: 'dynamic', dataSource: 'abnormals',
    tableColWidths: [22, 50, 34, 30, 54],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [h('科室'), h('异常项目'), h('本次结果'), h('参考区间'), h('处理建议')], { repeatOnPage: true }),
      row('data', 8, [
        c('{abnormals.dept}'), c('{abnormals.item}'),
        c('{abnormals.result}', { color: WARN, fontWeight: 'bold' }),
        c('{abnormals.ref}', { fontSize: 8 }), c('{abnormals.advice}', { fontSize: 8 }),
      ]),
      row('summary', 7, [
        c('合计：{summary.abnormalCount} 项异常，详见各专项页', { colspan: 5, fontWeight: 'bold' }),
        gap(), gap(), gap(), gap(),
      ]),
    ],
  }),
  el('text', {
    left: 0, top: 183, width: 190, height: 6,
    formatter: '总检医师：{report.doctor}　　审核医师：{report.reviewer}　　报告日期：{report.date}',
    fontSize: 9, color: INK, verticalAlign: 'middle',
  }),
])

// ── 第 2 页：一般检查（含参考区间条图）与科室检查 ─────────────────────────────
const PAGE_2 = page('一般检查', [
  section('一、一般检查 / 体格测量', 0),
  el('table', {
    left: 0, top: 8, width: 190, height: 16,
    tableMode: 'dynamic', dataSource: 'vitals',
    tableColWidths: [16, 52, 30, 26, 44, 22],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [h('序号'), h('检查项目'), h('结果'), h('单位'), h('参考区间'), h('提示')], { repeatOnPage: true }),
      row('data', 8, [
        c('{vitals.seq}', { align: 'center' }), c('{vitals.item}'),
        c('{vitals.result}', { align: 'right' }), c('{vitals.unit}', { align: 'center' }),
        c('{vitals.ref}', { align: 'center', fontSize: 8 }),
        c('{vitals.flag}', { align: 'center', color: WARN, fontWeight: 'bold' }),
      ]),
    ],
  }),
  section('二、主要指标与参考区间对照', 28),
  chart(CHARTS.vitals, 36, 46.7),
  section('三、科室检查记录', 86),
  el('table', {
    left: 0, top: 94, width: 190, height: 16,
    tableMode: 'dynamic', dataSource: 'clinical',
    tableColWidths: [24, 36, 28, 102],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [h('科室'), h('检查项目'), h('结果'), h('检查所见')], { repeatOnPage: true }),
      row('data', 8, [
        c('{clinical.dept}'), c('{clinical.item}'), c('{clinical.result}'), c('{clinical.desc}', { fontSize: 8 }),
      ]),
    ],
  }),
  section('四、一般检查小结', 114),
  prose(
    '体重指数 27.4 kg/m² 超出参考区间，血压 138/88 mmHg 处于正常高值，其余体格测量与各科查体未见异常。' +
    '\n建议控制总热量摄入并规律有氧运动，3 个月后复测体重、血压与血脂。',
    122, 24,
  ),
])

// ── 第 3 页：血常规（多级表头）+ 白细胞分类柱状图 ────────────────────────────
const PAGE_3 = page('血常规', [
  section('一、血常规（五分类）', 0),
  el('table', {
    left: 0, top: 8, width: 190, height: 24,
    tableMode: 'dynamic', dataSource: 'blood',
    tableColWidths: [16, 54, 28, 22, 42, 28],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [
        h('序号', { rowspan: 2 }),
        h('检验项目', { rowspan: 2 }),
        h('检验结果', { colspan: 2 }),
        gap(),
        h('参考与判定', { colspan: 2 }),
        gap(),
      ], { repeatOnPage: true }),
      row('header', 8, [gap(), gap(), h('结果'), h('单位'), h('参考区间'), h('提示')]),
      row('data', 8, [
        c('{blood.seq}', { align: 'center' }), c('{blood.item}'),
        c('{blood.result}', { align: 'right', fontWeight: 'bold' }),
        c('{blood.unit}', { align: 'center', fontSize: 8 }),
        c('{blood.ref}', { align: 'center', fontSize: 8 }),
        c('{blood.flag}', { align: 'center', color: WARN, fontWeight: 'bold' }),
      ]),
    ],
  }),
  section('二、白细胞分类占比', 36),
  chart(CHARTS.wbc, 44, 53.2),
  section('三、检验意见', 100),
  prose(
    '白细胞总数及五分类比例均在参考区间内，红细胞、血红蛋白与血小板未见异常，' +
    '本次血常规未提示感染、贫血或血小板异常。\n检验者：王倩　　审核者：{report.reviewer}',
    108, 24,
  ),
  el('text', {
    left: 0, top: 136, width: 190, height: 6,
    formatter: '标本类型：EDTA-K2 抗凝全血　　采集时间：{report.examDate} 08:12',
    fontSize: 8, color: SUB, verticalAlign: 'middle',
  }),
])

// ── 第 4 页：生化检验 + 历年趋势折线图 ───────────────────────────────────────
const PAGE_4 = page('生化检验', [
  section('一、生化检验（血脂 / 糖代谢 / 肝肾功能）', 0),
  el('table', {
    left: 0, top: 8, width: 190, height: 23,
    tableMode: 'dynamic', dataSource: 'chemistry',
    tableColWidths: [16, 58, 28, 24, 42, 22],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [h('序号'), h('检验项目'), h('结果'), h('单位'), h('参考区间'), h('提示')], { repeatOnPage: true }),
      row('data', 8, [
        c('{chemistry.seq}', { align: 'center' }), c('{chemistry.item}'),
        c('{chemistry.result}', { align: 'right', fontWeight: 'bold' }),
        c('{chemistry.unit}', { align: 'center', fontSize: 8 }),
        c('{chemistry.ref}', { align: 'center', fontSize: 8 }),
        c('{chemistry.flag}', { align: 'center', color: WARN, fontWeight: 'bold' }),
      ]),
      row('summary', 7, [
        c('注：H 表示高于参考区间；肝肾功能各项本次均在正常范围。', { colspan: 6, fontSize: 8, color: SUB }),
        gap(), gap(), gap(), gap(), gap(),
      ]),
    ],
  }),
  section('二、历年血脂与血糖趋势', 35),
  chart(CHARTS.trend, 43, 58.6),
  section('三、检验意见', 105),
  prose(
    '总胆固醇、甘油三酯与低密度脂蛋白胆固醇持续升高，空腹血糖已进入空腹血糖受损区间，' +
    '提示心血管代谢风险上升；肝肾功能指标正常。\n建议 3 个月生活方式干预后复查血脂四项、' +
    '空腹血糖及糖化血红蛋白，必要时至内分泌科门诊进一步评估。',
    113, 30,
  ),
])

// ── 第 5 页：尿常规 / 影像与心电 / 复诊建议 ──────────────────────────────────
const PAGE_5 = page('尿常规与影像检查', [
  section('一、尿常规', 0),
  el('table', {
    left: 0, top: 8, width: 190, height: 16,
    tableMode: 'dynamic', dataSource: 'urine',
    tableColWidths: [16, 58, 28, 24, 42, 22],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [h('序号'), h('检验项目'), h('结果'), h('单位'), h('参考区间'), h('提示')], { repeatOnPage: true }),
      row('data', 8, [
        c('{urine.seq}', { align: 'center' }), c('{urine.item}'),
        c('{urine.result}', { align: 'right' }), c('{urine.unit}', { align: 'center', fontSize: 8 }),
        c('{urine.ref}', { align: 'center', fontSize: 8 }),
        c('{urine.flag}', { align: 'center', color: WARN }),
      ]),
    ],
  }),
  section('二、影像与心电检查', 28),
  el('table', {
    left: 0, top: 36, width: 190, height: 16,
    tableMode: 'dynamic', dataSource: 'imaging',
    tableColWidths: [24, 40, 32, 94],
    tableDefaultFontSize: 8.5, tableDefaultPadding: 1,
    tablePagination: { enabled: true },
    tableRows: [
      row('header', 8, [h('科室'), h('检查项目'), h('结果'), h('检查所见')], { repeatOnPage: true }),
      row('data', 8, [
        c('{imaging.dept}'), c('{imaging.item}'), c('{imaging.result}'), c('{imaging.desc}', { fontSize: 8 }),
      ]),
    ],
  }),
  section('三、复诊与随访建议', 56),
  prose(
    '尿常规各项阴性，肾功能未见损害；心电图与胸片正常，腹部超声提示轻度脂肪肝，' +
    '与血脂异常及超重相符。\n建议：① 3 个月复查血脂、血糖与肝脏超声；' +
    '② 每年完成一次全面健康体检；③ 出现胸闷、头晕或持续乏力请及时就诊。',
    64, 30,
  ),
  el('text', {
    left: 0, top: 98, width: 190, height: 6,
    formatter: '报告完成日期：{report.date}　　咨询电话：400-800-1234（工作日 8:30-17:30）',
    fontSize: 8.5, color: INK, verticalAlign: 'middle',
  }),
])

/** 多页面模板：每页一个检验项目，页码跨页连续 */
const TEMPLATE = {
  version: 1,
  pages: [PAGE_1, PAGE_2, PAGE_3, PAGE_4, PAGE_5],
} as unknown as TemplateData

/** 体检报告示例：表格 + 图表 + 文字描述，五页按检验项目分栏 */
export const HEALTH_REPORT_SAMPLE: SampleTemplate = {
  id: 'health-report',
  name: '健康体检报告',
  group: '单据',
  desc: '5 页 A4 多页面模板：封面总检结论、一般检查、血常规、生化、尿常规与影像各占一页；表格（多级表头 / 异常高亮 / 重复表头）+ 按数据生成的矢量图表 + 长文结论与建议。',
  paper: 'A4 纵向 × 5 页 · 每个检验项目独立成页',
  fields: HEALTH_REPORT_FIELDS,
  data: HEALTH_REPORT_DATA,
  batchData: HEALTH_REPORT_BATCH_DATA,
  template: TEMPLATE,
}
