// packages/print-core/tests/template-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseTemplate, renderTemplate, compileTemplate } from '../src/template-parser.js'
import { evaluate } from '../src/evaluator.js'
import { parse } from '../src/parser.js'
import { tokenize } from '../src/lexer.js'

describe('parseTemplate', () => {
  it('parses pure text', () => {
    expect(parseTemplate('hello world')).toEqual({
      type: 'template',
      parts: [{ type: 'text', value: 'hello world' }],
    })
  })

  it('parses single expression', () => {
    const ast = parseTemplate('{amount}')
    expect(ast.parts).toHaveLength(1)
    expect(ast.parts[0].type).toBe('expr')
  })

  it('parses text + expression + text', () => {
    const ast = parseTemplate('金额: {amount} 元')
    expect(ast.parts).toHaveLength(3)
    expect(ast.parts[0]).toEqual({ type: 'text', value: '金额: ' })
    expect(ast.parts[1].type).toBe('expr')
    expect(ast.parts[2]).toEqual({ type: 'text', value: ' 元' })
  })

  it('parses multiple expressions', () => {
    const ast = parseTemplate('{a} + {b} = {c}')
    expect(ast.parts).toHaveLength(5)
    expect(ast.parts.filter(p => p.type === 'expr')).toHaveLength(3)
  })

  it('parses escaped braces', () => {
    const ast = parseTemplate('\\{not expr\\}')
    expect(ast.parts).toEqual([{ type: 'text', value: '{not expr}' }])
  })
})

describe('renderTemplate', () => {
  function render(template: string, ctx: Record<string, any>, fns: Record<string, any> = {}) {
    const ast = parseTemplate(template)
    return renderTemplate(ast, ctx, fns)
  }

  it('renders pure text', () => {
    expect(render('hello', {})).toBe('hello')
  })

  it('renders variable', () => {
    expect(render('{amount}', { amount: 100 })).toBe('100')
  })

  it('renders nested variable', () => {
    expect(render('{supplier.name}', { supplier: { name: 'ACME' } })).toBe('ACME')
  })

  it('renders text + expression + text', () => {
    expect(render('金额: {amount} 元', { amount: 1234.5 })).toBe('金额: 1234.5 元')
  })

  it('renders with custom function', () => {
    const fns = { MONEY: (x: number) => x.toFixed(2) }
    expect(render('{MONEY(amount)}', { amount: 1234.5 }, fns)).toBe('1234.50')
  })

  it('renders system variable', () => {
    const fns = { pageIndex: () => 1 }
    expect(render('{pageIndex()}', {}, fns)).toBe('1')
  })
})

describe('compileTemplate', () => {
  it('compiles once, renders many times', () => {
    const render = compileTemplate('金额: {MONEY(amount)} 元', {
      MONEY: (x: number) => x.toFixed(2),
    })
    expect(render({ amount: 100 })).toBe('金额: 100.00 元')
    expect(render({ amount: 200 })).toBe('金额: 200.00 元')
  })
})
