// web/src/components/print/utils/migrate.ts
// 存量模板元素坐标 pt → mm 迁移（旧数据无 unit 标记，默认按 pt 处理）
import type { TemplateData, PrintElementData } from '../types.js'
import { ptToMm } from './units.js'

const PT_KEYS = ['left', 'top', 'width', 'height'] as const

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
  // 2.0.0 起首页叠加区已移除：残留该键的旧模板一律剥离，既不换算也不再进渲染
  const rest: Record<string, unknown> = { ...data }
  delete rest.firstPageOverlay
  if (rest.unit === 'mm') return rest as unknown as TemplateData
  const src = rest as unknown as TemplateData
  const convert = (els?: PrintElementData[]): PrintElementData[] => els?.map(convertElement) ?? []
  return {
    ...src,
    unit: 'mm',
    elements: convert(src.elements),
    header: src.header ? { ...src.header, elements: convert(src.header.elements) } : src.header,
    footer: src.footer ? { ...src.footer, elements: convert(src.footer.elements) } : src.footer,
  }
}
