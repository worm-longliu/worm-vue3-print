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

describe('validateTemplateJson 结构强化（全流程手测发现的漏判）', () => {
  const withElement = (options: Record<string, unknown>, type = 'text') => ({
    ...base,
    elements: [{ id: 'e1', type, options, printElementType: { type } }],
  })

  it('元素类型拼错（Text）被拒，且报在元素 type 上', () => {
    const r = validateTemplateJson(withElement({ left: 0, top: 0, width: 50, height: 8 }, 'Text'))
    expect(r.ok).toBe(false)
    expect(r.issues.some(i => i.path === 'elements[0].type' && i.level === 'error')).toBe(true)
  })

  it('type 与 printElementType.type 不一致只给 warning', () => {
    const r = validateTemplateJson({
      ...base,
      elements: [{
        id: 'e1', type: 'text',
        options: { left: 0, top: 0, width: 50, height: 8 },
        printElementType: { type: 'table' },
      }],
    })
    expect(r.ok).toBe(true)
    expect(r.issues.some(i => i.level === 'warning' && i.path === 'elements[0]')).toBe(true)
  })

  it('字体声明必须有 family 与带 url 的 files', () => {
    const noFamily = validateTemplateJson({ ...base, fonts: [{ files: [{ url: '/f.woff2' }] }] })
    expect(noFamily.issues.some(i => i.path === 'fonts[0].family' && i.level === 'error')).toBe(true)

    const noUrl = validateTemplateJson({ ...base, fonts: [{ family: 'SimHei', files: [{ weight: 400 }] }] })
    expect(noUrl.issues.some(i => i.path === 'fonts[0].files[0].url' && i.level === 'error')).toBe(true)

    const badStyle = validateTemplateJson({
      ...base,
      fonts: [{ family: 'SimHei', files: [{ url: '/f.woff2', style: 'oblique' }] }],
    })
    expect(badStyle.issues.some(i => i.path.endsWith('style'))).toBe(true)

    const good = validateTemplateJson({
      ...base,
      fonts: [{ family: 'SimHei', label: '黑体', files: [{ url: '/f.woff2', weight: 400, style: 'normal' }] }],
    })
    expect(good.issues.filter(i => i.level === 'error')).toEqual([])
  })

  it('分边边框与分页配置按结构校验，不再整块放行', () => {
    const badBorder = validateTemplateJson(withElement({
      left: 0, top: 0, width: 50, height: 8, borders: { top: { width: '1' } },
    }))
    expect(badBorder.issues.some(i => i.path === 'elements[0].options.borders.top.width')).toBe(true)

    const badPagination = validateTemplateJson(withElement({
      left: 0, top: 0, width: 50, height: 8, pagination: { pageable: 'yes' },
    }))
    expect(badPagination.issues.some(i => i.path.endsWith('pagination.pageable'))).toBe(true)

    const good = validateTemplateJson(withElement({
      left: 0, top: 0, width: 50, height: 8,
      borders: { top: { width: 1, style: 'solid', color: '#333' } },
      pagination: { pageable: true, keepWithNext: false },
      tablePagination: { enabled: true },
    }))
    expect(good.issues.filter(i => i.level === 'error')).toEqual([])
  })

  it('tableRows 走单元格/行结构校验', () => {
    const badCells = validateTemplateJson(withElement({
      left: 0, top: 0, width: 50, height: 8,
      tableRows: [{ id: 'r1', type: 'data', height: 8, cells: { c1: {} } }],
    }, 'table'))
    expect(badCells.issues.some(i => i.path.includes('tableRows[0].cells'))).toBe(true)

    const badCellType = validateTemplateJson(withElement({
      left: 0, top: 0, width: 50, height: 8,
      tableRows: [{ id: 'r1', type: 'data', height: 8, cells: [{ id: 'c1', cellType: 'svg' }] }],
    }, 'table'))
    expect(badCellType.issues.some(i => i.path.endsWith('cells[0].cellType'))).toBe(true)
  })
})

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

  it('printerDpi 是数字而非字符串枚举（真实模板回归发现）', () => {
    const r = validateTemplateJson({
      ...base,
      elements: [{
        ...textElement,
        options: { ...textElement.options, barcodeType: 'code128', printerDpi: 203, barWidth: 2 },
      }],
    })
    expect(r.ok).toBe(true)
    // 字符串写法在 types.ts 里不存在，按非法处理，避免两套口径都放行
    const str = validateTemplateJson({
      ...base,
      elements: [{ ...textElement, options: { ...textElement.options, printerDpi: '203' } }],
    })
    expect(str.ok).toBe(false)
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
