import { describe, it, expect } from 'vitest'
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
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{
    id: 'e1', type: 'text',
    options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}' },
    printElementType: { type: 'text' },
  }],
}

describe('桌面纯计算工具集', () => {
  it('只注册 5 个内存工具', () => {
    expect(TOOLS.map(t => t.name).sort()).toEqual([
      'print_check_expression', 'print_draft_template', 'print_element_kinds',
      'print_inspect_layout', 'print_validate_template',
    ])
  })

  it('每个工具都带描述、注解与 JSON Schema 输入', () => {
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.annotations?.title).toBe('string')
      expect(tool.annotations?.readOnlyHint).toBe(true)
      expect(tool.annotations?.openWorldHint).toBe(false)
    }
  })

  it('模板校验与体检只声明必填的 templateJson', () => {
    for (const name of ['print_validate_template', 'print_inspect_layout']) {
      const schema = TOOLS.find(t => t.name === name)!.inputSchema
      expect(Object.keys(schema.properties as object)).toEqual(
        name === 'print_inspect_layout' ? ['templateJson', 'toleranceMm'] : ['templateJson'],
      )
      expect(schema.required).toContain('templateJson')
    }
  })
})

describe('print_element_kinds', () => {
  it('列出元素、函数、系统变量和单位约定', async () => {
    const data = JSON.parse((await call('print_element_kinds', {})).text)
    expect(data.kinds).toHaveLength(13)
    expect(data.kinds.find((k: { type: string }) => k.type === 'html').blocked).toBe(true)
    expect(data.functions).toContain('MONEY')
    expect(data.units).toContain('mm')
    expect(data.systemVariables).toEqual(['printDate', 'printTime', 'pageIndex', 'totalPages'])
  })
})

describe('print_validate_template', () => {
  it('合法模板返回 ok', async () => {
    const { text, isError } = await call('print_validate_template', { templateJson: validTemplate })
    expect(isError).toBe(false)
    expect(JSON.parse(text).ok).toBe(true)
  })

  it('缺少模板时返回可行动错误', async () => {
    const r = await call('print_validate_template', {})
    expect(r.isError).toBe(true)
    expect(r.text).toContain('templateJson')
  })

  it('非法输入返回结构化 issues', async () => {
    const data = JSON.parse((await call('print_validate_template', { templateJson: { paperSize: 'A99' } })).text)
    expect(data.ok).toBe(false)
    expect(data.issues.some((i: { path: string }) => i.path === 'paperSize')).toBe(true)
  })
})

describe('print_check_expression', () => {
  it('区分语法错与未知字段', async () => {
    const bad = JSON.parse((await call('print_check_expression', { expression: '{MONEY(' })).text)
    expect(bad.syntax).toBe('invalid')
    const unknown = JSON.parse((await call('print_check_expression', {
      expression: '{amount}', knownFields: ['qty'],
    })).text)
    expect(unknown.unknownFields).toEqual(['amount'])
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

  it('多页模板逐页体检并带页号', async () => {
    const data = JSON.parse((await call('print_inspect_layout', {
      templateJson: { version: 1, pages: [validTemplate, { ...validTemplate, elements: [] }] },
    })).text)
    expect(data.ok).toBe(true)
    expect(data.findings).toEqual([])
  })
})

describe('print_draft_template', () => {
  it('拒绝 html 元素', async () => {
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
