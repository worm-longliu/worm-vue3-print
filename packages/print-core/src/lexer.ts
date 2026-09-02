// packages/print-core/src/lexer.ts
import type { Token, TokenType } from './types.js'

const DANGEROUS_PROPS = new Set([
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
])

const RESERVED_WORDS = new Set([
  'new', 'function', 'class', 'this', 'delete', 'typeof', 'void',
  'in', 'of', 'var', 'let', 'const', 'return', 'if', 'while', 'for',
])

export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const ch = input[i]

    // 跳过空白
    if (/\s/.test(ch)) {
      i++
      continue
    }

    // 数字
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < n && /[0-9]/.test(input[i + 1]))) {
      let j = i
      while (j < n && /[0-9.]/.test(input[j])) j++
      tokens.push({ type: 'num', value: input.slice(i, j), position: i })
      i = j
      continue
    }

    // 字符串
    if (ch === "'" || ch === '"') {
      let j = i + 1
      let s = ''
      while (j < n && input[j] !== ch) {
        if (input[j] === '\\' && j + 1 < n) {
          s += input[j + 1]
          j += 2
        } else {
          s += input[j]
          j++
        }
      }
      if (j >= n) throw new Error('字符串未闭合')
      tokens.push({ type: 'str', value: s, position: i })
      i = j + 1
      continue
    }

    // 标识符
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_$]/.test(input[j])) j++
      const word = input.slice(i, j)

      if (RESERVED_WORDS.has(word)) {
        throw new Error(`不允许使用关键字: ${word}`)
      }
      if (DANGEROUS_PROPS.has(word)) {
        throw new Error(`禁止访问: ${word}`)
      }

      // true/false 作为 bool
      if (word === 'true' || word === 'false') {
        tokens.push({ type: 'bool', value: word, position: i })
      } else {
        tokens.push({ type: 'ident', value: word, position: i })
      }
      i = j
      continue
    }

    // 多字符运算符
    const three = input.slice(i, i + 3)
    if (three === '===' || three === '!==') {
      tokens.push({ type: 'punc', value: three, position: i })
      i += 3
      continue
    }

    const two = input.slice(i, i + 2)
    if (two === '=>') throw new Error('不允许函数定义')
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      tokens.push({ type: 'punc', value: two, position: i })
      i += 2
      continue
    }

    // 单字符
    if (ch === '=') throw new Error('不允许赋值')
    if (ch === ';') throw new Error('不允许多条语句')
    if ('+-*/%()[]{},:.?!<>'.includes(ch)) {
      tokens.push({ type: 'punc', value: ch, position: i })
      i++
      continue
    }

    throw new Error(`非法字符: ${ch}`)
  }

  return tokens
}
