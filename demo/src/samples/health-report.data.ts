// demo/src/samples/health-report.data.ts
// 体检报告示例的业务数据与字段树：所有数据静态内置，不依赖后端接口。
// 三张矢量图（历年趋势折线 / 白细胞分类柱状 / 参考区间条）由业务数据在生成期算出 SVG 字符串，
// 因此零框架四个宿主都能出图，且换数据即换图；SVG 只用 presentation 属性，不用内联 style，
// 避免设计器画布的表达式求值与 DOMPurify 消毒把图形吃掉。
import type { PrintBusinessField } from '@worm-vue3-print/common/vue3'

/** 检验结果行：flag 用 H/L 标出偏高偏低，示例表格据此做异常高亮 */
export interface ExamRow {
  seq: number
  item: string
  result: string
  unit: string
  ref: string
  flag: string
}

const exam = (rows: [string, string, string, string, string][]): ExamRow[] =>
  rows.map(([item, result, unit, ref, flag], i) => ({ seq: i + 1, item, result, unit, ref, flag }))

/** 业务字段树：抬头 / 结论 / 各检验列表及其行内字段 */
export const HEALTH_REPORT_FIELDS: PrintBusinessField[] = [
  { id: 'hr-1', fieldKey: 'report', fieldLabel: '报告信息', fieldType: 'string', sortOrder: 1 },
  { id: 'hr-2', fieldKey: 'report.org', fieldLabel: '体检机构', fieldType: 'string', sortOrder: 2 },
  { id: 'hr-3', fieldKey: 'report.no', fieldLabel: '报告编号', fieldType: 'string', sortOrder: 3 },
  { id: 'hr-4', fieldKey: 'report.name', fieldLabel: '受检人', fieldType: 'string', sortOrder: 4 },
  { id: 'hr-5', fieldKey: 'report.sex', fieldLabel: '性别', fieldType: 'string', sortOrder: 5 },
  { id: 'hr-6', fieldKey: 'report.age', fieldLabel: '年龄', fieldType: 'string', sortOrder: 6 },
  { id: 'hr-7', fieldKey: 'report.examDate', fieldLabel: '体检日期', fieldType: 'date', sortOrder: 7 },
  { id: 'hr-8', fieldKey: 'report.package', fieldLabel: '体检套餐', fieldType: 'string', sortOrder: 8 },
  { id: 'hr-9', fieldKey: 'report.doctor', fieldLabel: '总检医师', fieldType: 'string', sortOrder: 9 },
  { id: 'hr-10', fieldKey: 'report.reviewer', fieldLabel: '审核医师', fieldType: 'string', sortOrder: 10 },
  { id: 'hr-11', fieldKey: 'summary', fieldLabel: '总检结论', fieldType: 'string', sortOrder: 11 },
  { id: 'hr-12', fieldKey: 'summary.abnormalCount', fieldLabel: '异常项数', fieldType: 'number', sortOrder: 12 },
  { id: 'hr-13', fieldKey: 'summary.conclusion', fieldLabel: '结论正文', fieldType: 'string', sortOrder: 13 },
  { id: 'hr-14', fieldKey: 'summary.advice', fieldLabel: '健康建议', fieldType: 'string', sortOrder: 14 },
  { id: 'hr-15', fieldKey: 'vitals', fieldLabel: '一般检查', fieldType: 'list', sortOrder: 15 },
  { id: 'hr-16', fieldKey: 'clinical', fieldLabel: '科室检查', fieldType: 'list', sortOrder: 16 },
  { id: 'hr-17', fieldKey: 'blood', fieldLabel: '血常规', fieldType: 'list', sortOrder: 17 },
  { id: 'hr-18', fieldKey: 'blood.item', fieldLabel: '血常规项目', fieldType: 'string', sortOrder: 18 },
  { id: 'hr-19', fieldKey: 'blood.result', fieldLabel: '血常规结果', fieldType: 'string', sortOrder: 19 },
  { id: 'hr-20', fieldKey: 'blood.ref', fieldLabel: '血常规参考区间', fieldType: 'string', sortOrder: 20 },
  { id: 'hr-21', fieldKey: 'chemistry', fieldLabel: '生化检验', fieldType: 'list', sortOrder: 21 },
  { id: 'hr-22', fieldKey: 'urine', fieldLabel: '尿常规', fieldType: 'list', sortOrder: 22 },
  { id: 'hr-23', fieldKey: 'imaging', fieldLabel: '影像与心电', fieldType: 'list', sortOrder: 23 },
  { id: 'hr-24', fieldKey: 'abnormals', fieldLabel: '异常指标汇总', fieldType: 'list', sortOrder: 24 },
  { id: 'hr-25', fieldKey: 'trends', fieldLabel: '历年趋势', fieldType: 'list', sortOrder: 25 },
  { id: 'hr-26', fieldKey: 'wbc', fieldLabel: '白细胞分类', fieldType: 'list', sortOrder: 26 },
]

/** 静态打印数据：单份报告，五页内容全部由同一份数据绑定 */
export const HEALTH_REPORT_DATA: Record<string, any> = {
  report: {
    org: '康和健康管理中心 · 体检部',
    title: '健康体检报告',
    no: 'TJ2026111500286',
    date: '2026-11-15',
    examDate: '2026-11-12',
    name: '张明远',
    sex: '男',
    age: '42 岁',
    phone: '138****6621',
    package: '精英综合套餐（男）',
    doctor: '李文华',
    reviewer: '周敏',
    verifyUrl: 'https://example.com/report/TJ2026111500286',
  },
  summary: {
    abnormalCount: 5,
    conclusion:
      '一、主要阳性发现：低密度脂蛋白胆固醇 4.12 mmol/L 偏高，总胆固醇 6.28 mmol/L 偏高；' +
      '空腹血糖 6.42 mmol/L 处于空腹血糖受损区间；体重指数 27.4 kg/m² 属超重；' +
      '血压 138/88 mmHg 属正常高值。\n' +
      '二、其余检查：血常规、尿常规、肝肾功能、甲状腺功能、胸片与心电图均未见明显异常；' +
      '腹部超声提示轻度脂肪肝。\n' +
      '三、综合评估：存在血脂异常、糖代谢异常及超重等心血管代谢危险因素，' +
      '建议 3 个月内生活方式干预后复查血脂与空腹血糖。',
    advice:
      '1. 饮食：减少饱和脂肪与精制糖摄入，每日食盐不超过 5g，增加全谷物、蔬菜与优质蛋白。\n' +
      '2. 运动：每周不少于 150 分钟中等强度有氧运动，配合每周 2 次抗阻训练，目标减重 3~5kg。\n' +
      '3. 复查：3 个月后复查血脂四项、空腹血糖与糖化血红蛋白；如持续升高请至内分泌科门诊评估。\n' +
      '4. 作息：戒烟限酒，保证每日 7 小时睡眠，避免长期熬夜与久坐。',
  },
  vitals: exam([
    ['身高', '172.5', 'cm', '—', ''],
    ['体重', '81.6', 'kg', '—', ''],
    ['体重指数 BMI', '27.4', 'kg/m²', '18.5~23.9', 'H'],
    ['收缩压', '138', 'mmHg', '90~139', ''],
    ['舒张压', '88', 'mmHg', '60~89', ''],
    ['脉搏', '76', '次/分', '60~100', ''],
  ]),
  clinical: [
    { dept: '内科', item: '心肺听诊', result: '未见异常', desc: '心律齐，双肺呼吸音清' },
    { dept: '内科', item: '腹部触诊', result: '未见异常', desc: '腹软，肝脾未触及' },
    { dept: '外科', item: '甲状腺', result: '未见异常', desc: '未触及肿大及结节' },
    { dept: '眼科', item: '眼底检查', result: '未见异常', desc: '双侧眼底动脉未见硬化征' },
    { dept: '耳鼻喉', item: '常规检查', result: '未见异常', desc: '咽部无充血，双耳鼓膜完整' },
  ],
  blood: exam([
    ['白细胞计数 WBC', '6.72', '10⁹/L', '3.50~9.50', ''],
    ['红细胞计数 RBC', '4.86', '10¹²/L', '4.30~5.80', ''],
    ['血红蛋白 HGB', '148', 'g/L', '130~175', ''],
    ['血小板计数 PLT', '236', '10⁹/L', '125~350', ''],
    ['中性粒细胞百分比', '58.2', '%', '40.0~75.0', ''],
    ['淋巴细胞百分比', '32.4', '%', '20.0~50.0', ''],
    ['单核细胞百分比', '6.1', '%', '3.0~10.0', ''],
    ['嗜酸性粒细胞百分比', '2.6', '%', '0.4~8.0', ''],
    ['嗜碱性粒细胞百分比', '0.7', '%', '0.0~1.0', ''],
  ]),
  chemistry: exam([
    ['总胆固醇 TC', '6.28', 'mmol/L', '<5.18', 'H'],
    ['甘油三酯 TG', '1.94', 'mmol/L', '<1.70', 'H'],
    ['低密度脂蛋白 LDL-C', '4.12', 'mmol/L', '<3.37', 'H'],
    ['高密度脂蛋白 HDL-C', '1.08', 'mmol/L', '>1.04', ''],
    ['空腹血糖 GLU', '6.42', 'mmol/L', '3.90~6.10', 'H'],
    ['糖化血红蛋白 HbA1c', '5.9', '%', '4.0~6.0', ''],
    ['丙氨酸氨基转移酶 ALT', '34', 'U/L', '9~50', ''],
    ['天门冬氨酸氨基转移酶 AST', '26', 'U/L', '15~40', ''],
    ['血清肌酐 CREA', '78', 'μmol/L', '57~97', ''],
    ['尿酸 UA', '398', 'μmol/L', '208~428', ''],
    ['尿素 UREA', '5.2', 'mmol/L', '3.1~8.0', ''],
  ]),
  urine: exam([
    ['尿蛋白 PRO', '阴性', '—', '阴性', ''],
    ['尿葡萄糖 GLU', '阴性', '—', '阴性', ''],
    ['尿潜血 BLD', '阴性', '—', '阴性', ''],
    ['尿酮体 KET', '阴性', '—', '阴性', ''],
    ['尿比重 SG', '1.018', '—', '1.005~1.030', ''],
    ['酸碱度 pH', '6.0', '—', '4.5~8.0', ''],
    ['尿白细胞 LEU', '阴性', '—', '阴性', ''],
  ]),
  imaging: [
    { dept: '放射科', item: '胸部正位片', result: '未见异常', desc: '双肺纹理清晰，心影大小正常' },
    { dept: '超声科', item: '腹部彩超', result: '轻度脂肪肝', desc: '肝回声增强，建议随访' },
    { dept: '超声科', item: '甲状腺彩超', result: '未见异常', desc: '双侧甲状腺形态回声正常' },
    { dept: '心电室', item: '常规心电图', result: '窦性心律', desc: '心率 76 次/分，未见 ST-T 改变' },
  ],
  abnormals: [
    { dept: '生化', item: '总胆固醇 TC', result: '6.28 mmol/L', ref: '<5.18', advice: '低脂饮食，3 个月复查' },
    { dept: '生化', item: '低密度脂蛋白 LDL-C', result: '4.12 mmol/L', ref: '<3.37', advice: '内分泌科评估' },
    { dept: '生化', item: '甘油三酯 TG', result: '1.94 mmol/L', ref: '<1.70', advice: '限酒限糖' },
    { dept: '生化', item: '空腹血糖 GLU', result: '6.42 mmol/L', ref: '3.90~6.10', advice: '复查糖化血红蛋白' },
    { dept: '一般检查', item: '体重指数 BMI', result: '27.4 kg/m²', ref: '18.5~23.9', advice: '减重 3~5kg' },
  ],
  trends: [
    { year: '2022', ldl: 2.86, glucose: 5.24 },
    { year: '2023', ldl: 3.12, glucose: 5.46 },
    { year: '2024', ldl: 3.58, glucose: 5.82 },
    { year: '2025', ldl: 3.84, glucose: 6.08 },
    { year: '2026', ldl: 4.12, glucose: 6.42 },
  ],
  wbc: [
    { name: '中性粒', value: 58.2 },
    { name: '淋巴', value: 32.4 },
    { name: '单核', value: 6.1 },
    { name: '嗜酸', value: 2.6 },
    { name: '嗜碱', value: 0.7 },
  ],
}

/** 批量场景：第二位受检人换名换号、指标回落，验证同一多页模板换数据不串页 */
export const HEALTH_REPORT_BATCH_DATA: Record<string, any>[] = [
  HEALTH_REPORT_DATA,
  {
    ...HEALTH_REPORT_DATA,
    report: {
      ...HEALTH_REPORT_DATA.report,
      no: 'TJ2026111500287',
      name: '陈国平',
      age: '38 岁',
      verifyUrl: 'https://example.com/report/TJ2026111500287',
    },
    summary: {
      ...HEALTH_REPORT_DATA.summary,
      abnormalCount: 1,
      conclusion: '本次体检各项检验指标基本正常，仅体重指数 24.6 kg/m² 略高于参考区间，建议保持规律运动与均衡饮食。',
      advice: '保持每周 150 分钟中等强度运动，次年按期复查即可。',
    },
    chemistry: HEALTH_REPORT_DATA.chemistry.map((row: ExamRow) =>
      row.item === '总胆固醇 TC' ? { ...row, result: '4.86', flag: '' }
        : row.item === '低密度脂蛋白 LDL-C' ? { ...row, result: '3.02', flag: '' }
          : row.item === '空腹血糖 GLU' ? { ...row, result: '5.38', flag: '' }
            : row,
    ),
    trends: HEALTH_REPORT_DATA.trends.map((row: { year: string; ldl: number; glucose: number }) => ({
      ...row, ldl: +(row.ldl - 0.8).toFixed(2), glucose: +(row.glucose - 0.6).toFixed(2),
    })),
  },
]

const C = {
  ink: '#26364a', sub: '#6b7c8f', grid: '#dfe6ee',
  blue: '#2f6fb5', red: '#d0453b', green: '#2e8b6b', band: '#e9eff6',
}

/** 历年趋势折线图：LDL-C 与空腹血糖双线，右侧给出末次值与参考上限 */
function trendSvg(rows: { year: string; ldl: number; glucose: number }[]): string {
  const x0 = 48, x1 = 666, y0 = 22, y1 = 178
  const ldlMax = 5, gluMax = 8
  const xs = rows.map((_, i) => x0 + (x1 - x0) * i / (rows.length - 1))
  const yOf = (v: number, max: number) => y1 - (y1 - y0) * v / max
  const path = (key: 'ldl' | 'glucose', max: number) =>
    rows.map((r, i) => `${xs[i]},${yOf(r[key], max).toFixed(1)}`).join(' ')
  const grid = [0, 1, 2, 3, 4].map(i => {
    const y = y0 + (y1 - y0) * i / 4
    return `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>` +
      `<text x="${x0 - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${C.sub}">${(5 - i * 1.25).toFixed(2)}</text>`
  }).join('')
  const years = rows.map((r, i) =>
    `<text x="${xs[i]}" y="198" text-anchor="middle" font-size="12" fill="${C.sub}">${r.year}</text>`).join('')
  const dots = (key: 'ldl' | 'glucose', max: number, color: string) =>
    rows.map((r, i) => `<circle cx="${xs[i]}" cy="${yOf(r[key], max).toFixed(1)}" r="3.4" fill="${color}"/>`).join('')
  const last = rows[rows.length - 1]!
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 700 216" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="700" height="216" fill="#ffffff"/>` +
    `<text x="8" y="14" font-size="12" fill="${C.sub}">mmol/L</text>${grid}${years}` +
    `<polyline points="${path('ldl', ldlMax)}" fill="none" stroke="${C.blue}" stroke-width="2.4"/>` +
    `<polyline points="${path('glucose', gluMax)}" fill="none" stroke="${C.green}" stroke-width="2.4"/>` +
    dots('ldl', ldlMax, C.blue) + dots('glucose', gluMax, C.green) +
    `<rect x="470" y="6" width="12" height="4" fill="${C.blue}"/><text x="488" y="13" font-size="11" fill="${C.ink}">LDL-C</text>` +
    `<rect x="552" y="6" width="12" height="4" fill="${C.green}"/><text x="570" y="13" font-size="11" fill="${C.ink}">空腹血糖</text>` +
    `<text x="8" y="212" font-size="11" fill="${C.red}">2026 年 LDL-C ${last.ldl} ↑（参考 &lt;3.37）、空腹血糖 ${last.glucose} ↑（参考 &lt;6.10）</text>` +
    `</svg>`
}

/** 白细胞分类柱状图：五类占比，超过 50% 的柱用主色，其余浅色 */
function wbcSvg(rows: { name: string; value: number }[]): string {
  const x0 = 48, y0 = 20, y1 = 164, max = 70
  const slot = (660 - x0) / rows.length
  const grid = [0, 1, 2, 3, 4].map(i => {
    const y = y0 + (y1 - y0) * i / 4
    return `<line x1="${x0}" y1="${y}" x2="666" y2="${y}" stroke="${C.grid}" stroke-width="1"/>` +
      `<text x="${x0 - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${C.sub}">${max - i * max / 4}</text>`
  }).join('')
  const bars = rows.map((r, i) => {
    const w = 54, x = x0 + slot * i + (slot - w) / 2
    const h = (y1 - y0) * r.value / max
    return `<rect x="${x}" y="${y1 - h}" width="${w}" height="${h}" fill="${r.value > 50 ? C.blue : '#9db9d8'}"/>` +
      `<text x="${x + w / 2}" y="${y1 - h - 6}" text-anchor="middle" font-size="11" fill="${C.ink}">${r.value}</text>` +
      `<text x="${x + w / 2}" y="182" text-anchor="middle" font-size="11" fill="${C.sub}">${r.name}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 700 196" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="700" height="196" fill="#ffffff"/>` +
    `<text x="8" y="14" font-size="12" fill="${C.sub}">%</text>${grid}${bars}</svg>`
}

/** 一般检查参考区间条：每行一条正常区间带 + 当前值游标，偏高项用红色 */
function vitalsSvg(rows: { name: string; min: number; max: number; value: number; text: string }[]): string {
  const x0 = 150, x1 = 640
  const bands = rows.map((r, i) => {
    const y = 28 + i * 46
    const scale = (v: number) => x0 + (x1 - x0) * (v - r.min * 0.8) / (r.max * 1.2 - r.min * 0.8)
    const a = scale(r.min), b = scale(r.max), p = scale(r.value)
    const over = r.value > r.max
    const color = over ? C.red : C.green
    return `<text x="8" y="${y + 16}" font-size="12" fill="${C.ink}">${r.name}</text>` +
      `<line x1="${x0}" y1="${y + 10}" x2="${x1}" y2="${y + 10}" stroke="${C.grid}" stroke-width="10"/>` +
      `<line x1="${a}" y1="${y + 10}" x2="${b}" y2="${y + 10}" stroke="${C.band}" stroke-width="10"/>` +
      `<circle cx="${p}" cy="${y + 10}" r="8" fill="${color}"/>` +
      `<text x="650" y="${y + 15}" font-size="11" fill="${color}">${r.text}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 700 172" preserveAspectRatio="none">` +
    `<rect x="0" y="0" width="700" height="172" fill="#ffffff"/>` +
    `<text x="8" y="14" font-size="11" fill="${C.sub}">灰带为参考区间，圆点为本次测量值</text>${bands}</svg>`
}

/** 按项目名从业务数据取本次测量值，图与表格读同一份数据 */
function valueOf(data: Record<string, any>, list: string, item: string): number {
  const row = (data[list] as ExamRow[]).find(r => r.item === item)
  return Number.parseFloat(row?.result ?? '0')
}

/**
 * SVG → data URL：作为 image 元素的 src 才能同时在设计器画布与出纸端显示。
 * html 元素被 core 的 stripBlockedElements 明确屏蔽（画布可见却永不出纸），不能用来承载图表。
 */
const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** 三张图随业务数据生成：返回可直接赋给 image.src 的矢量图地址 */
export function buildHealthReportCharts(data: Record<string, any>): Record<string, string> {
  const bmi = valueOf(data, 'vitals', '体重指数 BMI')
  const sbp = valueOf(data, 'vitals', '收缩压')
  const tc = valueOf(data, 'chemistry', '总胆固醇 TC')
  return {
    trend: svgDataUrl(trendSvg(data.trends)),
    wbc: svgDataUrl(wbcSvg(data.wbc)),
    vitals: svgDataUrl(vitalsSvg([
      { name: '体重指数 BMI', min: 18.5, max: 23.9, value: bmi, text: `${bmi} ${bmi > 23.9 ? '↑' : ''}` },
      { name: '收缩压 mmHg', min: 90, max: 139, value: sbp, text: `${sbp}` },
      { name: '总胆固醇 mmol/L', min: 3.1, max: 5.18, value: tc, text: `${tc} ${tc > 5.18 ? '↑' : ''}` },
    ])),
  }
}
