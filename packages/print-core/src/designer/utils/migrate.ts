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
  if (data.unit === 'mm') return data
  const convert = (els?: PrintElementData[]): PrintElementData[] => els?.map(convertElement) ?? []
  return {
    ...data,
    unit: 'mm',
    elements: convert(data.elements),
    header: data.header ? { ...data.header, elements: convert(data.header.elements) } : data.header,
    footer: data.footer ? { ...data.footer, elements: convert(data.footer.elements) } : data.footer,
    firstPageOverlay: data.firstPageOverlay
      ? { ...data.firstPageOverlay, elements: convert(data.firstPageOverlay.elements) }
      : data.firstPageOverlay,
  }
}
