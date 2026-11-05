// web/src/components/print/utils/migrate.ts
// 存量模板元素坐标 pt → mm 迁移（旧数据无 unit 标记，默认按 pt 处理）
import type { TemplateData, PrintElementData } from '../types.js'
import { ptToMm } from './units.js'
import { isBlockedElementType } from './element-factory.js'

const PT_KEYS = ['left', 'top', 'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft'] as const

/** 元素类型可能落在 type 或 printElementType.type 两处（设计器模型与运行时模型同 JSON） */
function elementTypeOf(el: PrintElementData): string | undefined {
  return el.type ?? el.printElementType?.type
}

/** 剥离屏蔽元素：三区各自过滤，返回新对象，不改动入参 */
export function stripBlockedElements(data: TemplateData): TemplateData {
  const strip = (els?: PrintElementData[]): PrintElementData[] =>
    (els ?? []).filter(el => !isBlockedElementType(elementTypeOf(el)))
  return {
    ...data,
    elements: strip(data.elements),
    header: data.header ? { ...data.header, elements: strip(data.header.elements) } : data.header,
    footer: data.footer ? { ...data.footer, elements: strip(data.footer.elements) } : data.footer,
  }
}

/** 装载前统计被屏蔽元素数量，供宿主弹提示（与 stripBlockedElements 同判据） */
export function countBlockedElements(data?: TemplateData | null): number {
  if (!data) return 0
  const count = (els?: PrintElementData[]) => (els ?? []).filter(el => isBlockedElementType(elementTypeOf(el))).length
  return count(data.elements) + count(data.header?.elements) + count(data.footer?.elements)
}

function convertElement(el: PrintElementData): PrintElementData {
  const options = { ...el.options }
  for (const key of PT_KEYS) {
    const v = options[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      ;(options as Record<string, unknown>)[key] = round2(ptToMm(v))
    }
  }
  return { ...el, options }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function normalizeTemplateUnits(data: TemplateData): TemplateData {
  // 1.3.5 起首页叠加区已移除：残留该键的旧模板一律剥离，既不换算也不再进渲染
  const rest: Record<string, unknown> = { ...data }
  delete rest.firstPageOverlay
  // 屏蔽元素类型（html）一律剥离：画布上能看见却永不出纸的元素，导入后不该继续留着骗人
  const stripped = stripBlockedElements(rest as unknown as TemplateData)
  if (stripped.unit === 'mm') return stripped
  const src = stripped as unknown as TemplateData
  const convert = (els?: PrintElementData[]): PrintElementData[] => els?.map(convertElement) ?? []
  return {
    ...src,
    unit: 'mm',
    elements: convert(src.elements),
    header: src.header ? { ...src.header, elements: convert(src.header.elements) } : src.header,
    footer: src.footer ? { ...src.footer, elements: convert(src.footer.elements) } : src.footer,
  }
}
