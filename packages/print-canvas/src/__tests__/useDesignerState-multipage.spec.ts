import { describe, it, expect } from 'vitest'
import { useDesignerState } from '../composables/useDesignerState'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function page(name: string, height: number): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait', unit: 'mm',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    name,
    elements: [{ id: `${name}-e`, type: 'text', options: { left: 0, top: 0, width: 50, height, formatter: 'x' }, printElementType: { type: 'text' } }],
  }
}

describe('useDesignerState 多页面', () => {
  it('加载 wrapper：pages 展开，templateData=首页', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    expect(s.pages.value).toHaveLength(2)
    expect(s.activePageIndex.value).toBe(0)
    expect(s.templateData.value.name).toBe('封面')
  })

  it('switchPage：当前页写入 pages，切到目标页', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    s.templateData.value.name = '封面改'
    s.switchPage(1)
    expect(s.pages.value[0].name).toBe('封面改')
    expect(s.templateData.value.name).toBe('内容')
  })

  it('getTemplateJson：1 页裸值，多页 wrapper', () => {
    const single = useDesignerState({ initialTemplate: page('单页', 30) })
    expect('pages' in single.getTemplateJson()).toBe(false)

    const multi = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    const json = multi.getTemplateJson()
    expect('pages' in json).toBe(true)
    if ('pages' in json) {
      expect(json.pages).toHaveLength(2)
      expect(json.pages[0].name).toBe('封面')
    }
  })

  it('updateTemplateData：多页时纸张字段传播到所有页', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30), page('内容', 150)] } })
    s.updateTemplateData({ ...s.templateData.value, paperSize: 'A5' })
    s.switchPage(1)
    expect(s.templateData.value.paperSize).toBe('A5')
  })

  it('addPage/duplicatePage/deletePage/movePage 基础操作', () => {
    const s = useDesignerState({ initialTemplate: { version: 1, pages: [page('封面', 30)] } })
    s.addPage()
    expect(s.pages.value).toHaveLength(2)
    expect(s.templateData.value.paperSize).toBe(s.pages.value[0].paperSize) // 继承首页纸张

    // 新页为空页，先补一个元素再复制，以便验证 duplicatePage 重建元素 id
    s.addElement('text')
    const srcElementId = s.templateData.value.elements[0].id

    s.duplicatePage()
    expect(s.pages.value).toHaveLength(3)
    expect(s.templateData.value.elements[0].id).not.toBe(srcElementId)

    // 删除激活页之前的页：激活索引前移一位，仍停留在原页面
    s.deletePage(0)
    expect(s.pages.value).toHaveLength(2)
    expect(s.pages.value[0].name).toBe('页面 2')
    expect(s.activePageIndex.value).toBe(1)
    expect(s.templateData.value.name).toBe('页面 2 副本')

    // 右移到队首：pages=[页面 2 副本, 页面 2]，active 跟随被移页
    s.movePage(1, 0)
    expect(s.pages.value[0].name).toBe('页面 2 副本')
    expect(s.activePageIndex.value).toBe(0)
    expect(s.templateData.value).toBe(s.pages.value[0])
  })
})