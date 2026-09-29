import type { TemplateData } from '@worm-vue3-print/core/designer'

/** 默认模板：与 canvas 的 createDefaultTemplate 同结构，保证两侧序列化一致 */
export function createDefaultTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    unit: 'mm',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    watermark: {},
  }
}
