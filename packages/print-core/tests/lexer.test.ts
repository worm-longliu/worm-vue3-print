// packages/print-core/tests/lexer.test.ts
import { describe, it, expect } from 'vitest'
import { tokenize } from '../src/lexer.js'

describe('tokenize', () => {
  it('tokenizes numbers', () => {
    expect(tokenize('123')).toEqual([
      { type: 'num', value: '123', position: 0 },
    ])
    expect(tokenize('3.14')).toEqual([
      { type: 'num', value: '3.14', position: 0 },
    ])
  })

  it('tokenizes strings', () => {
    expect(tokenize('"hello"')).toEqual([
      { type: 'str', value: 'hello', position: 0 },
    ])
    expect(tokenize("'world'")).toEqual([
      { type: 'str', value: 'world', position: 0 },
    ])
  })

  it('tokenizes booleans', () => {
    expect(tokenize('true')).toEqual([
      { type: 'bool', value: 'true', position: 0 },
    ])
    expect(tokenize('false')).toEqual([
      { type: 'bool', value: 'false', position: 0 },
    ])
  })

  it('tokenizes identifiers', () => {
    expect(tokenize('amount')).toEqual([
      { type: 'ident', value: 'amount', position: 0 },
    ])
    expect(tokenize('supplier.name')).toEqual([
      { type: 'ident', value: 'supplier', position: 0 },
      { type: 'punc', value: '.', position: 8 },
      { type: 'ident', value: 'name', position: 9 },
    ])
  })

  it('tokenizes operators', () => {
    expect(tokenize('1 + 2')).toEqual([
      { type: 'num', value: '1', position: 0 },
      { type: 'punc', value: '+', position: 2 },
      { type: 'num', value: '2', position: 4 },
    ])
  })

  it('tokenizes comparison operators', () => {
    expect(tokenize('a == b')).toEqual([
      { type: 'ident', value: 'a', position: 0 },
      { type: 'punc', value: '==', position: 2 },
      { type: 'ident', value: 'b', position: 5 },
    ])
    expect(tokenize('a !== b')).toEqual([
      { type: 'ident', value: 'a', position: 0 },
      { type: 'punc', value: '!==', position: 2 },
      { type: 'ident', value: 'b', position: 6 },
    ])
  })

  it('tokenizes function call', () => {
    expect(tokenize('MONEY(amount)')).toEqual([
      { type: 'ident', value: 'MONEY', position: 0 },
      { type: 'punc', value: '(', position: 5 },
      { type: 'ident', value: 'amount', position: 6 },
      { type: 'punc', value: ')', position: 12 },
    ])
  })

  it('throws on illegal character', () => {
    expect(() => tokenize('@')).toThrow('非法字符')
  })
})
