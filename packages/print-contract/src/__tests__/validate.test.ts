import { describe, it, expect } from 'vitest'
import { validateTemplateJson } from '../validate.js'

const textElement = {
  id: 'e1',
  type: 'text',
  options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}', fontSize: 10.5 },
  printElementType: { type: 'text', title: '文本' },
}
const base = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  header: { height: 0, elements: [] },
  footer: { height: 0, elements: [] },
  elements: [textElement],
}

describe('validateTemplateJson', () => {
  it('最小合法模板通过', () => {
    const r = validateTemplateJson(base)
    expect(r.ok).toBe(true)
    expect(r.issues.filter(i => i.level === 'error')).toEqual([])
  })

  it('非法纸张与负宽度给出带路径的 error', () => {
    const r = validateTemplateJson({
      ...base,
      paperSize: 'A6',
      elements: [{ ...textElement, options: { ...textElement.options, width: -5 } }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path === 'paperSize')).toBe(true)
    expect(r.issues.some(i => i.path === 'elements[0].options.width')).toBe(true)
  })

  it('废弃键只降级为 warning 且被点名', () => {
    const r = validateTemplateJson({
      ...base,
      elements: [{ ...textElement, options: { ...textElement.options, title: '旧标题' } }],
    })
    expect(r.ok).toBe(true)
    expect(r.deprecatedHits).toContain('elements[0].options.title')
    expect(r.issues.every(i => i.level === 'warning')).toBe(true)
  })

  it('未知 option 键不判失败但列进 unknownKeys（AI 幻觉键）', () => {
    const r = validateTemplateJson({
      ...base,
      elements: [{ ...textElement, options: { ...textElement.options, fontShadow: 3 } }],
    })
    expect(r.ok).toBe(true)
    expect(r.unknownKeys).toContain('elements[0].options.fontShadow')
  })

  it('缺 unit 的历史模板给 warning 而不是 error', () => {
    const r = validateTemplateJson({ ...base })
    expect(r.ok).toBe(true)
    expect(r.issues.some(i => i.path === 'unit' && i.level === 'warning')).toBe(true)
  })

  it('多页 wrapper 与拼版配置一并覆盖', () => {
    const r = validateTemplateJson({
      version: 1,
      pages: [{
        ...base,
        tiling: {
          enabled: true,
          sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
          gapX: 2, gapY: 2, columns: 0,
        },
      }],
    })
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path.endsWith('tiling.columns'))).toBe(true)
  })
})
