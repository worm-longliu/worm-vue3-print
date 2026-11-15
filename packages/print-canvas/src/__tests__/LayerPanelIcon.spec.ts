// 图层行的类型图标全覆盖：新增元素类型必须登记，否则落到通用 Shapes 兜底（flowList 就漏过一次）。
// canvas 图标已统一为 lucide：断言 data-icon 名称而不是 SVG path（lucide 升级不会碎）。
// 同一张表在 print-common 的 shell/__tests__/flow-list.spec.ts 里按相同字面量断言，任一侧改动即红。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LayerPanel from '../components/LayerPanel.vue'
import type { ElementType, RuntimeElement } from '@worm-vue3-print/core/designer'

/** 与 common 侧 LAYER_ICON 同源的字面量表 */
const EXPECTED: Record<string, string> = {
  text: 'Type', longText: 'TextAlignStart', table: 'Table', flowList: 'List', image: 'Image', barcode: 'Barcode',
  qrcode: 'QrCode', hline: 'Minus', vline: 'SeparatorVertical', rect: 'Square', oval: 'Circle', html: 'Code',
}

function mkEl(type: ElementType): RuntimeElement {
  return {
    id: `el-${type}`,
    options: { left: 0, top: 0, width: 10, height: 10, title: type },
    printElementType: { type, title: type },
  } as unknown as RuntimeElement
}

describe('图层面板类型图标', () => {
  it('12 类元素各有 lucide 图标，flowList 是 List 而不是 Shapes 兜底', () => {
    const w = mount(LayerPanel, {
      props: { elements: Object.keys(EXPECTED).map(t => mkEl(t as ElementType)), selectedIds: new Set<string>() },
    })
    const icons = w.findAll('.layer-icon').map(n => n.find('[data-icon]').attributes('data-icon'))
    expect(icons).toEqual(Object.values(EXPECTED))
    expect(icons).not.toContain(undefined)
    expect(icons).not.toContain('Shapes')
  })
})
