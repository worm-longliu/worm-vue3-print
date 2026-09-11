// web/src/components/print/composables/useGuides.ts
// 手动参考线管理:增删改 + 吸附目标生成,增删改入历史栈
import { computed, type Ref } from 'vue'
import type { TemplateData, AlignLine } from '@worm-vue3-print/core/designer'

let guideSeq = 0
function genId(): string {
  guideSeq += 1
  return `guide-${guideSeq}`
}

export function useGuides(templateData: Ref<TemplateData>, recordHistory: () => void) {
  const guides = computed(() => templateData.value.guides ?? [])

  function mutate(fn: (list: AlignLine[]) => AlignLine[]) {
    templateData.value = {
      ...templateData.value,
      guides: fn([...(templateData.value.guides ?? [])]),
    }
    recordHistory()
  }

  function addGuide(type: 'vertical' | 'horizontal', position: number) {
    mutate(list => { list.push({ type, position, id: genId() }); return list })
  }
  function moveGuide(id: string, position: number) {
    mutate(list => list.map(g => g.id === id ? { ...g, position } : g))
  }
  function removeGuide(id: string) {
    mutate(list => list.filter(g => g.id !== id))
  }
  function getGuidePositions(): { vertical: number[]; horizontal: number[] } {
    const v: number[] = [], h: number[] = []
    for (const g of guides.value) {
      if (g.type === 'vertical') v.push(g.position)
      else h.push(g.position)
    }
    return { vertical: v, horizontal: h }
  }

  return { guides, addGuide, moveGuide, removeGuide, getGuidePositions }
}
