import { describe, it, expect, vi } from 'vitest'
import { TOOLS } from '../tools.js'

const call = async (name: string, args: Record<string, unknown>) => {
  const tool = TOOLS.find(t => t.name === name)
  if (!tool) throw new Error(`工具 ${name} 未注册`)
  const r = await tool.handler(args)
  const block = r.content[0]
  if (!block || block.type !== 'text') throw new Error(`工具 ${name} 未返回文本内容`)
  return { text: block.text, isError: !!r.isError }
}

const validTemplate = {
  paperSize: 'A4',
  orientation: 'portrait',
  unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{
    id: 'e1',
    type: 'text',
    options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}' },
    printElementType: { type: 'text' },
  }],
}

describe('MCP 工具注册表', () => {
  it('工具名唯一且为 snake_case', () => {
    const names = TOOLS.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(n => /^[a-z][a-z0-9_]*$/.test(n))).toBe(true)
  })

  it('契约层四件事 + 元素清单 + 渲染出口齐备', () => {
    expect(TOOLS.map(t => t.name).sort()).toEqual([
      'print_check_expression', 'print_draft_template', 'print_element_kinds',
      'print_inspect_layout', 'print_render_preview', 'print_validate_template',
    ])
  })

  it('每个工具都带描述与 JSON Schema 输入', () => {
    expect(TOOLS.every(t => t.description.length > 20)).toBe(true)
    expect(TOOLS.every(t => t.inputSchema.type === 'object')).toBe(true)
  })
})

describe('print_element_kinds', () => {
  it('列出 13 类并标注封禁项与函数白名单', async () => {
    const data = JSON.parse((await call('print_element_kinds', {})).text)
    expect(data.kinds).toHaveLength(13)
    expect(data.kinds.find((k: { type: string }) => k.type === 'html').blocked).toBe(true)
    expect(data.functions).toContain('MONEY')
    expect(data.units).toContain('mm')
    expect(data.expressionSyntax).toContain('{字段}')
  })
})

describe('print_validate_template', () => {
  it('合法模板返回 ok', async () => {
    const { text, isError } = await call('print_validate_template', { templateJson: validTemplate })
    expect(isError).toBe(false)
    expect(JSON.parse(text).ok).toBe(true)
  })

  it('非法输入返回结构化 error 而不是抛异常', async () => {
    const data = JSON.parse((await call('print_validate_template', { templateJson: { paperSize: 'A99' } })).text)
    expect(data.ok).toBe(false)
    expect(data.issues.some((i: { path: string }) => i.path === 'paperSize')).toBe(true)
  })
})

describe('print_check_expression', () => {
  it('区分语法错与未知字段', async () => {
    const bad = JSON.parse((await call('print_check_expression', { expression: '{MONEY(' })).text)
    expect(bad.syntax).toBe('invalid')
    const unknown = JSON.parse((await call('print_check_expression',
      { expression: '{amount}', knownFields: ['qty'] })).text)
    expect(unknown.unknownFields).toEqual(['amount'])
    expect(unknown.ok).toBe(true)
  })
})

describe('print_inspect_layout', () => {
  it('对越出纸张的元素给出 finding', async () => {
    const data = JSON.parse((await call('print_inspect_layout', {
      templateJson: {
        ...validTemplate,
        elements: [{ ...validTemplate.elements[0], options: { ...validTemplate.elements[0].options, left: 250 } }],
      },
    })).text)
    expect(data.ok).toBe(false)
    expect(data.findings.some((f: { code: string }) => f.code === 'OUT_OF_PAPER')).toBe(true)
  })

  it('只侵入页边距时 ok 仍为 true，只出 warning', async () => {
    const data = JSON.parse((await call('print_inspect_layout', {
      templateJson: {
        ...validTemplate,
        elements: [{ ...validTemplate.elements[0], options: { ...validTemplate.elements[0].options, left: 185, width: 15 } }],
      },
    })).text)
    expect(data.ok).toBe(true)
    expect(data.findings.every((f: { level: string }) => f.level === 'warning')).toBe(true)
  })

  it('多页模板逐页体检并把路径带上页号', async () => {
    const data = JSON.parse((await call('print_inspect_layout', {
      templateJson: { version: 1, pages: [validTemplate, { ...validTemplate, elements: [] }] },
    })).text)
    expect(data.ok).toBe(true)
    expect(data.findings).toEqual([])
  })
})

describe('print_draft_template', () => {  it('拒绝 html 元素', async () => {
    const data = JSON.parse((await call('print_draft_template', {
      spec: { elements: [{ type: 'html', options: { left: 0, top: 0, width: 10, height: 10 } }] },
    })).text)
    expect(data.issues.some((i: { level: string }) => i.level === 'error')).toBe(true)
  })

  it('草稿自带 unit=mm 且表达式校验通过', async () => {
    const data = JSON.parse((await call('print_draft_template', {
      spec: { elements: [{ type: 'text', options: { left: 10, top: 10, width: 60, height: 8 }, formatter: '{a}' }] },
    })).text)
    expect(data.expressionErrors).toEqual([])
    expect(data.template.unit).toBe('mm')
  })
})

describe('print_render_preview', () => {
  it('契约不合法时先被 validate 拦下，不浪费一次渲染', async () => {
    const data = JSON.parse((await call('print_render_preview', { templateJson: { paperSize: 'A99' } })).text)
    expect(data.stage).toBe('validate')
    expect(data.ok).toBe(false)
  })

  it('未配置渲染服务时降级为可读提示而不是静默', async () => {
    vi.stubEnv('PRINT_RENDER_BASE_URL', '')
    try {
      const { text, isError } = await call('print_render_preview', { templateJson: validTemplate })
      expect(isError).toBe(true)
      expect(text).toContain('PRINT_RENDER_BASE_URL')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
