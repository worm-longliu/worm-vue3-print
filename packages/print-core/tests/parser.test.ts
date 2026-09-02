// packages/print-core/tests/parser.test.ts
import { describe, it, expect } from 'vitest'
import { parse } from '../src/parser.js'
import { tokenize } from '../src/lexer.js'

describe('parse', () => {
  function expr(input: string) {
    return parse(tokenize(input))
  }

  it('parses number literal', () => {
    expect(expr('42')).toEqual({ type: 'num', value: 42 })
  })

  it('parses string literal', () => {
    expect(expr('"hello"')).toEqual({ type: 'str', value: 'hello' })
  })

  it('parses boolean literal', () => {
    expect(expr('true')).toEqual({ type: 'bool', value: true })
  })

  it('parses identifier', () => {
    expect(expr('amount')).toEqual({ type: 'ident', name: 'amount' })
  })

  it('parses binary expression', () => {
    expect(expr('1 + 2')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'num', value: 1 },
      right: { type: 'num', value: 2 },
    })
  })

  it('parses comparison', () => {
    expect(expr('a > 10')).toEqual({
      type: 'binary',
      op: '>',
      left: { type: 'ident', name: 'a' },
      right: { type: 'num', value: 10 },
    })
  })

  it('parses logical and', () => {
    expect(expr('a && b')).toEqual({
      type: 'binary',
      op: '&&',
      left: { type: 'ident', name: 'a' },
      right: { type: 'ident', name: 'b' },
    })
  })

  it('parses ternary', () => {
    expect(expr('a ? b : c')).toEqual({
      type: 'ternary',
      cond: { type: 'ident', name: 'a' },
      consequent: { type: 'ident', name: 'b' },
      alternate: { type: 'ident', name: 'c' },
    })
  })

  it('parses member access', () => {
    expect(expr('supplier.name')).toEqual({
      type: 'member',
      object: { type: 'ident', name: 'supplier' },
      property: 'name',
      computed: false,
    })
  })

  it('parses function call', () => {
    expect(expr('MONEY(amount)')).toEqual({
      type: 'call',
      callee: { type: 'ident', name: 'MONEY' },
      args: [{ type: 'ident', name: 'amount' }],
    })
  })

  it('parses nested member and call', () => {
    expect(expr('supplier.getName()')).toEqual({
      type: 'call',
      callee: {
        type: 'member',
        object: { type: 'ident', name: 'supplier' },
        property: 'getName',
        computed: false,
      },
      args: [],
    })
  })

  it('parses array literal', () => {
    expect(expr('[1, 2, 3]')).toEqual({
      type: 'array',
      elements: [
        { type: 'num', value: 1 },
        { type: 'num', value: 2 },
        { type: 'num', value: 3 },
      ],
    })
  })

  it('parses object literal', () => {
    expect(expr('{ a: 1 }')).toEqual({
      type: 'object',
      properties: [{ key: 'a', value: { type: 'num', value: 1 } }],
    })
  })

  it('parses unary negation', () => {
    expect(expr('-x')).toEqual({
      type: 'unary',
      op: '-',
      arg: { type: 'ident', name: 'x' },
      prefix: true,
    })
  })

  it('parses logical not', () => {
    expect(expr('!x')).toEqual({
      type: 'unary',
      op: '!',
      arg: { type: 'ident', name: 'x' },
      prefix: true,
    })
  })

  it('respects operator precedence', () => {
    // 1 + 2 * 3 = 1 + (2 * 3)
    expect(expr('1 + 2 * 3')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'num', value: 1 },
      right: {
        type: 'binary',
        op: '*',
        left: { type: 'num', value: 2 },
        right: { type: 'num', value: 3 },
      },
    })
  })
})
