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
    elements: [],
    watermark: {},
    // 画布不再读写该字段；core 类型尚未删除其必填声明，经 unknown 桥接
  } as unknown as TemplateData
}
