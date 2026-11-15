// demo/src/samples/index.ts
// 示例模板库注册表：全部示例使用静态内置数据，新增示例只需在对应注册表追加一项。
//
// 注册表按「是否依赖可选包」分两个文件：
// - ./host-samples.ts：不依赖可选包的示例，demo-common 四个宿主同步时只求值这一份；
// - 本文件：在宿主安全示例之上补图表类示例（依赖 @worm-vue3-print/echarts）。
//
// 新增示例的排版约束（渲染管线的硬规则，踩过一次就别再踩）：
// 1. 固定纸模板纵向要留 2mm 分页安全余量——内容底边贴着版心底边会被判到第二页，
//    拼版模板更会直接报「拼版要求每份标签恰好 1 页」而拒绝出纸。
// 2. 表格 tableColWidths 之和必须等于元素宽度、tableRows 行高之和必须等于元素高度，
//    每行单元格数必须等于列数（设计器加载时会按列宽/行高重算尺寸）。
// 3. 左右并排的元素块（横向不相交）要给同一个 options.groupId 组合起来：纵向预算按横向
//    相交分列累计，未组合的并排两块会被整宽尾行合计扣两次，紧尺寸标签因此被挤到第二页
//    （拼版模板则直接拒纸）。组合不改几何，只让整组同页、纵向只扣一次并集高度。
import type { SampleGroup, SampleTemplate } from './types'
import { HOST_SAMPLE_TEMPLATES } from './host-samples'
import { SALES_CHART_SAMPLE } from './sales-chart'
import { ECHARTS_SHOWCASE_SAMPLE } from './echarts-showcase'

export type { SampleTemplate, SampleGroup }

/** 图表类示例：依赖可选包 @worm-vue3-print/echarts，demo-common 宿主不同步 */
const CHART_SAMPLES: SampleTemplate[] = [SALES_CHART_SAMPLE, ECHARTS_SHOWCASE_SAMPLE]

/** 示例库：单据 → 标签 → 小票 → 图表 */
export const SAMPLE_TEMPLATES: SampleTemplate[] = [...HOST_SAMPLE_TEMPLATES, ...CHART_SAMPLES]

/** 分组顺序（弹窗筛选项） */
export const SAMPLE_GROUPS: SampleGroup[] = ['单据', '标签', '小票', '图表']

/** 按分组过滤 */
export function listSamples(group?: SampleGroup | '全部'): SampleTemplate[] {
  if (!group || group === '全部') return SAMPLE_TEMPLATES
  return SAMPLE_TEMPLATES.filter(s => s.group === group)
}

/** 按 id 取示例 */
export function getSampleById(id: string): SampleTemplate | undefined {
  return SAMPLE_TEMPLATES.find(s => s.id === id)
}
