import { describe, it, expect } from 'vitest'
import { draftTemplate, ELEMENT_KINDS } from '../draft.js'
import { validateTemplateJson } from '../validate.js'

describe('draftTemplate', () => {
  it('空 spec（无 preset 且无 elements）报 elements error', () => {
    const r = draftTemplate({})
    expect(r.issues.some(i => i.level === 'error' && i.path === 'elements'
      && i.message.includes('preset') && i.message.includes('elements'))).toBe(true)
  })

  it('elements 缺失与为空数组同样报 error', () => {
    expect(draftTemplate({ elements: [] }).issues.some(i => i.level === 'error' && i.path === 'elements')).toBe(true)
  })

  it('只给 elements 的正常路径不受该 error 影响', () => {
    const r = draftTemplate({
      elements: [{ type: 'text', options: { left: 10, top: 10, width: 60, height: 8 }, formatter: '{no}' }],
    })
    expect(r.issues.some(i => i.level === 'error' && i.path === 'elements')).toBe(false)
    expect(r.template.elements).toHaveLength(1)
  })

  it('preset 路径不受空 spec error 影响', () => {
    const r = draftTemplate({ preset: 'label-40x30' })
    expect(r.issues.some(i => i.path === 'elements')).toBe(false)
    expect(r.template.elements.length).toBeGreaterThan(1)
  })

  it('产出可通过契约校验与体检的 A4 模板', () => {
    const r = draftTemplate({
      elements: [
        { type: 'text', options: { left: 10, top: 10, width: 60, height: 8 }, formatter: '{orderNo}' },
        {
          type: 'table',
          options: {
            left: 0, top: 20, width: 190, height: 80,
            tableColWidths: [90, 100],
            tableRows: [{
              id: 'r1', type: 'data', height: 8,
              cells: [{ id: 'c1', formatter: '{name}' }, { id: 'c2', formatter: '{qty}' }],
            }],
          },
        },
      ],
    })
    expect(r.issues.filter(i => i.level === 'error')).toEqual([])
    expect(r.expressionErrors).toEqual([])
    expect(r.template.unit).toBe('mm')
    expect(r.template.elements).toHaveLength(2)
    expect(validateTemplateJson(r.template).ok).toBe(true)
  })

  it('拒绝 html 元素类型（core 的封禁清单）', () => {
    const r = draftTemplate({ elements: [{ type: 'html', options: { left: 0, top: 0, width: 50, height: 10 } }] })
    expect(r.issues.some(i => i.level === 'error' && i.message.includes('html'))).toBe(true)
    expect(r.template.elements).toHaveLength(0)
  })

  it('不给 options 时沿用 core 元素工厂的默认几何，不虚报缺失', () => {
    const r = draftTemplate({ elements: [{ type: 'text' }] })
    // createDefaultOptions('text') 恒带 left/top/width/height，因此这里既不该补 0 也不该告警
    expect(r.template.elements[0].options.width).toBeGreaterThan(0)
    expect(r.issues.filter(i => i.level === 'warning' && i.path.endsWith('.width'))).toEqual([])
  })

  it('表达式非法时进 expressionErrors 而不是静默', () => {
    const r = draftTemplate({ elements: [{ type: 'text', formatter: '{MONEY(' }] })
    expect(r.expressionErrors.length).toBeGreaterThan(0)
  })

  it('草稿自身的问题会被回灌成 issues', () => {
    const r = draftTemplate({
      elements: [{ type: 'text', options: { left: 300, top: 10, width: 60, height: 8 } }],
    })
    expect(r.issues.some(i => i.message.includes('OUT_OF_PAPER'))).toBe(true)
  })

  it('元素类型清单覆盖 13 类并标注封禁项', () => {
    expect(ELEMENT_KINDS).toHaveLength(13)
    expect(ELEMENT_KINDS.find(k => k.type === 'html')?.blocked).toBe(true)
    expect(ELEMENT_KINDS.find(k => k.type === 'flowList')?.requiredOptionKeys).toContain('flowColumns')
  })

  it('全宽背景元素自动补 pageable=false，小元素不动', () => {
    const r = draftTemplate({
      elements: [
        // A4 内容区 190×277：全宽外框会被判为背景层
        { type: 'rect', options: { left: 0, top: 0, width: 190, height: 277 } },
        { type: 'text', options: { left: 10, top: 10, width: 60, height: 8 } },
      ],
    })
    const pagination = (r.template.elements[0].options as { pagination?: { pageable?: boolean } }).pagination
    expect(pagination?.pageable).toBe(false)
    expect((r.template.elements[1].options as { pagination?: unknown }).pagination).toBeUndefined()
    expect(r.issues.some(i => i.level === 'warning' && i.message.includes('pageable=false'))).toBe(true)
    expect(r.issues.filter(i => i.level === 'error')).toEqual([])
  })

  it('作者显式设置的 pagination 不被覆盖', () => {
    const r = draftTemplate({
      elements: [
        { type: 'rect', options: { left: 0, top: 0, width: 190, height: 277, pagination: { pageable: true, keepWithNext: false } } },
      ],
    })
    const pagination = (r.template.elements[0].options as { pagination?: { pageable?: boolean } }).pagination
    expect(pagination?.pageable).toBe(true)
  })
})
