import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useGuides } from '../composables/useGuides'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function mkTemplate(): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  }
}

describe('useGuides', () => {
  it('addGuide 增加参考线并触发 recordHistory', () => {
    const td = ref(mkTemplate())
    let historyCalls = 0
    const { guides, addGuide, getGuidePositions } = useGuides(td, () => { historyCalls++ })
    addGuide('vertical', 100)
    expect(guides.value.length).toBe(1)
    expect(historyCalls).toBe(1)
    expect(getGuidePositions().vertical).toEqual([100])
  })
  it('moveGuide 改位置', () => {
    const td = ref(mkTemplate())
    const { addGuide, moveGuide, guides } = useGuides(td, () => {})
    addGuide('horizontal', 50)
    moveGuide(guides.value[0]!.id!, 80)
    expect(guides.value[0]!.position).toBe(80)
  })
  it('removeGuide 删除', () => {
    const td = ref(mkTemplate())
    const { addGuide, removeGuide, guides } = useGuides(td, () => {})
    addGuide('vertical', 100)
    removeGuide(guides.value[0]!.id!)
    expect(guides.value.length).toBe(0)
  })
})
