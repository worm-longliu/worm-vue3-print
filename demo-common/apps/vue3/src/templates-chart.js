// 图表宿主示例库：与 ./demo 的图表样例同口径，只在安装了 @worm-vue3-print/echarts-common 的
// 宿主（当前为 vue3）生成；plugins 清单按 strict 校验声明图表插件 id。
// 由 demo-common/scripts/sync-demo-samples.mjs 从 demo/src/samples/common-chart-sample.ts 自动生成，请勿手改。

/** 图表类示例：需要宿主 import '@worm-vue3-print/echarts-common' 才有素材卡与画布渲染 */
export const CHART_SAMPLES = [
  // ───────────────────────── 图表示例1：图表元素（common 宿主）（A4 纵向 · 190mm 版心） ─────────────────────────
  {
    id: 'common-chart',
    name: '图表元素（common 宿主）',
    group: '图表',
    desc: '柱状图与饼图共用一份趋势数据；由 @worm-vue3-print/echarts-common 提供静态 SVG 画布与图形化属性面板',
    paper: 'A4 纵向 · 190mm 版心',
    fields: [
      { id: 'cc-1', fieldKey: 'title', fieldLabel: '图表标题', fieldType: 'string', sortOrder: 1 },
      { id: 'cc-2', fieldKey: 'trend', fieldLabel: '趋势数据', fieldType: 'list', sortOrder: 2 },
    ],
    data: {
      title: '2026 年销售趋势',
      trend: [
        { name: '1 月', sales: 120, profit: 40 },
        { name: '2 月', sales: 168, profit: 62 },
        { name: '3 月', sales: 145, profit: 51 },
        { name: '4 月', sales: 200, profit: 88 },
      ],
    },
    template: {
      unit: 'mm',
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] },
      footer: { height: 0, elements: [] },
      plugins: [{ id: '@worm-vue3-print/echarts', version: '2' }],
      elements: [
        {
          id: 'cc-title',
          type: 'text',
          printElementType: { type: 'text', title: '文本' },
          options: { left: 10, top: 8, width: 190, height: 8, fontSize: 14, fontWeight: 'bold', textAlign: 'center', formatter: '{title}' },
        },
        {
          id: 'cc-bar',
          type: 'barChart',
          printElementType: { type: 'barChart', title: '柱状图' },
          options: {
            left: 10,
            top: 20,
            width: 90,
            height: 55,
            chartOption: {
              title: { text: '销售额与利润' },
              tooltip: { trigger: 'axis' },
              grid: { left: '8%', right: '8%', bottom: '12%', top: '18%', containLabel: true },
              xAxis: { type: 'category', data: ['$data'] },
              yAxis: { type: 'value' },
              series: [{ type: 'bar', name: '销售额', data: ['$data'] }, { type: 'bar', name: '利润', data: ['$data'] }],
            },
            chartDataSource: 'trend',
            chartCategoryField: 'name',
            chartValueFields: ['sales', 'profit'],
          },
        },
        {
          id: 'cc-pie',
          type: 'pieChart',
          printElementType: { type: 'pieChart', title: '饼图' },
          options: {
            left: 110,
            top: 20,
            width: 90,
            height: 55,
            chartOption: {
              title: { text: '销售额占比' },
              tooltip: { trigger: 'item' },
              series: [{ type: 'pie', name: '销售额', data: ['$data'], radius: '62%' }],
            },
            chartDataSource: 'trend',
            chartCategoryField: 'name',
            chartValueFields: ['sales'],
          },
        },
      ],
    },
    batchData: [
      {
        title: '2026 年销售趋势',
        trend: [
          { name: '1 月', sales: 120, profit: 40 },
          { name: '2 月', sales: 168, profit: 62 },
          { name: '3 月', sales: 145, profit: 51 },
          { name: '4 月', sales: 200, profit: 88 },
        ],
      },
      {
        title: '2026 年销售趋势',
        trend: [
          { name: '1 月', sales: 120, profit: 40 },
          { name: '2 月', sales: 168, profit: 62 },
          { name: '3 月', sales: 145, profit: 51 },
          { name: '4 月', sales: 200, profit: 88 },
        ],
      },
      {
        title: '2026 年销售趋势',
        trend: [
          { name: '1 月', sales: 120, profit: 40 },
          { name: '2 月', sales: 168, profit: 62 },
          { name: '3 月', sales: 145, profit: 51 },
          { name: '4 月', sales: 200, profit: 88 },
        ],
      },
    ],
  },
]
