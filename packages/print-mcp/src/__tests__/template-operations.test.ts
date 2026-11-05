import { describe, expect, it } from 'vitest'
import { applyTemplateOperations, projectTemplateSummary } from '../template-operations.js'

const template = {
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [
    { id: 'title', type: 'text', options: { left: 10, top: 10, width: 60, height: 8, formatter: '旧标题', fontSize: 12 }, printElementType: { type: 'text' } },
    { id: 'qrcode', type: 'qrcode', options: { left: 100, top: 20, width: 20, height: 20 }, printElementType: { type: 'qrcode' } },
  ],
}

describe('白名单模板 Patch', () => {
  it('一次应用更新和移动并返回变更路径，不修改输入', () => {
    const result = applyTemplateOperations(template, [
      { op: 'updateElement', elementId: 'title', changes: { formatter: '销售出库单', fontSize: 18 } },
      { op: 'moveElement', elementId: 'qrcode', x: 120, y: 30 },
    ])
    expect(result.templateJson).not.toBe(template)
    expect((result.templateJson as typeof template).elements[0]!.options).toMatchObject({ formatter: '销售出库单', fontSize: 18 })
    expect((result.templateJson as typeof template).elements[1]!.options).toMatchObject({ left: 120, top: 30 })
    expect(template.elements[0]!.options.formatter).toBe('旧标题')
    expect(result.changedPaths).toEqual([
      'elements[0].options.formatter', 'elements[0].options.fontSize',
      'elements[1].options.left', 'elements[1].options.top',
    ])
  })

  it('支持多页与页眉页脚元素', () => {
    const multi = { version: 1, pages: [{ ...template, elements: [], header: { height: 10, elements: [template.elements[0]] } }] }
    const result = applyTemplateOperations(multi, [{ op: 'moveElement', elementId: 'title', x: 1, y: 2 }])
    expect(result.changedPaths).toEqual(['pages[0].header.elements[0].options.left', 'pages[0].header.elements[0].options.top'])
  })

  it('元素缺失、重复或操作非法时整批拒绝', () => {
    expect(() => applyTemplateOperations(template, [{ op: 'moveElement', elementId: 'none', x: 1, y: 2 }])).toThrow('不存在')
    const duplicated = { ...template, elements: [template.elements[0], template.elements[0]] }
    expect(() => applyTemplateOperations(duplicated, [{ op: 'moveElement', elementId: 'title', x: 1, y: 2 }])).toThrow('重复')
    expect(() => applyTemplateOperations(template, [{ op: 'moveElement', elementId: 'title', x: Number.NaN, y: 2 }])).toThrow('有限数字')
    expect(() => applyTemplateOperations(template, [{ op: 'updateElement', elementId: 'title', changes: JSON.parse('{"__proto__":{"polluted":true}}') }])).toThrow()
    expect(() => applyTemplateOperations(template, [{ op: 'updateElement', elementId: 'title', changes: ['invalid'] as unknown as Record<string, unknown> }])).toThrow('对象')
  })
})

describe('模板摘要投影', () => {
  it('返回页面与元素索引，不泄露完整模板', () => {
    const summary = projectTemplateSummary(template, {})
    expect(summary).toMatchObject({ paperSize: 'A4', pageCount: 1 })
    const elements = (summary as { elements: Array<Record<string, unknown>> }).elements
    expect(elements).toHaveLength(2)
    expect(elements[0]).toMatchObject({ id: 'title', type: 'text', path: 'elements[0]' })
    expect(summary).not.toHaveProperty('templateJson')
  })

  it('支持元素过滤和字段白名单', () => {
    const summary = projectTemplateSummary(template, { elementIds: ['title'], includeFields: ['formatter'] })
    expect((summary as { elements: unknown[] }).elements).toEqual([
      expect.objectContaining({ id: 'title', options: { formatter: '旧标题' } }),
    ])
  })

  it('拒绝重复或空白的元素 ID', () => {
    expect(() => projectTemplateSummary(template, { elementIds: ['title', 'title'] })).toThrow('重复')
    expect(() => projectTemplateSummary(template, { elementIds: [' '] })).toThrow('空白')
  })
})
