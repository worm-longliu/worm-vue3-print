import { describe, it, expect } from 'vitest'
import { draftTemplate, ELEMENT_KINDS } from '../draft.js'
import { validateTemplateJson } from '../validate.js'

describe('draftTemplate', () => {
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
})
