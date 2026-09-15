import { describe, it, expect } from 'vitest'
import { useDesignerState } from '../composables/useDesignerState'
import type { TemplateData } from '@worm-vue3-print/core/designer'

describe('designBackground 序列化透传', () => {
  it('updateTemplateData 后 getTemplateJson 保留背景与旋转角度', () => {
    const state = useDesignerState()
    state.updateTemplateData({
      ...state.templateData.value,
      designBackground: { src: 'https://host.example.com/bg.png', rotation: 270 },
    })
    const json = state.getTemplateJson()
    expect(json.designBackground).toEqual({ src: 'https://host.example.com/bg.png', rotation: 270 })
    expect(JSON.stringify(json)).toContain('designBackground')
  })

  it('loadTemplate 后背景被保留（toRuntimePool 整体展开透传）', () => {
    const state = useDesignerState()
    const incoming = {
      ...state.getTemplateJson(),
      designBackground: { src: 'https://host.example.com/bg2.png', rotation: 90 },
    } as TemplateData
    state.loadTemplate(incoming)
    expect(state.templateData.value.designBackground).toEqual({
      src: 'https://host.example.com/bg2.png',
      rotation: 90,
    })
  })

  it('移除背景后序列化 JSON 不含该字段', () => {
    const state = useDesignerState()
    state.updateTemplateData({
      ...state.templateData.value,
      designBackground: { src: 'https://host.example.com/bg.png', rotation: 0 },
    })
    const rest = { ...state.templateData.value }
    delete rest.designBackground
    state.updateTemplateData(rest)
    expect(JSON.stringify(state.getTemplateJson())).not.toContain('designBackground')
  })
})
