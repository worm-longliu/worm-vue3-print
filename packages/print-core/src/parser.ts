// packages/print-core/src/parser.ts
import type { Token, ASTNode } from './types.js'

export function parse(tokens: Token[]): ASTNode {
  const parser = new Parser(tokens)
  return parser.parse()
}

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): ASTNode {
    const node = this.parseTernary()
    if (this.pos < this.tokens.length) {
      throw new Error(`表达式存在多余内容: ${this.tokens[this.pos].value}`)
    }
    return node
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token {
    const t = this.tokens[this.pos++]
    if (!t) throw new Error('表达式意外结束')
    return t
  }

  private eatPunc(value: string): boolean {
    const t = this.peek()
    if (t && t.type === 'punc' && t.value === value) {
      this.pos++
      return true
    }
    return false
  }

  private expectPunc(value: string) {
    if (!this.eatPunc(value)) {
      const pos = this.peek()?.position ?? 0
      throw new Error(`位置 ${pos}: 期望 "${value}"`)
    }
  }

  // 三元运算符 ?: (优先级最低)
  private parseTernary(): ASTNode {
    const cond = this.parseLogicalOr()
    if (this.eatPunc('?')) {
      const consequent = this.parseTernary()
      this.expectPunc(':')
      const alternate = this.parseTernary()
      return { type: 'ternary', cond, consequent, alternate }
    }
    return cond
  }

  // ||
  private parseLogicalOr(): ASTNode {
    let left = this.parseLogicalAnd()
    while (this.eatPunc('||')) {
      const right = this.parseLogicalAnd()
      left = { type: 'binary', op: '||', left, right }
    }
    return left
  }

  // &&
  private parseLogicalAnd(): ASTNode {
    let left = this.parseEquality()
    while (this.eatPunc('&&')) {
      const right = this.parseEquality()
      left = { type: 'binary', op: '&&', left, right }
    }
    return left
  }

  // == != === !==
  private parseEquality(): ASTNode {
    let left = this.parseRelational()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'punc' && ['==', '!=', '===', '!=='].includes(t.value)) {
        this.pos++
        const right = this.parseRelational()
        left = { type: 'binary', op: t.value, left, right }
      } else {
        return left
      }
    }
  }

  // < > <= >=
  private parseRelational(): ASTNode {
    let left = this.parseAdditive()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'punc' && ['<', '>', '<=', '>='].includes(t.value)) {
        this.pos++
        const right = this.parseAdditive()
        left = { type: 'binary', op: t.value, left, right }
      } else {
        return left
      }
    }
  }

  // + - (二元)
  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'punc' && (t.value === '+' || t.value === '-')) {
        this.pos++
        const right = this.parseMultiplicative()
        left = { type: 'binary', op: t.value, left, right }
      } else {
        return left
      }
    }
  }

  // * / %
  private parseMultiplicative(): ASTNode {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (t?.type === 'punc' && ['*', '/', '%'].includes(t.value)) {
        this.pos++
        const right = this.parseUnary()
        left = { type: 'binary', op: t.value, left, right }
      } else {
        return left
      }
    }
  }

  // 一元 ! - +
  private parseUnary(): ASTNode {
    const t = this.peek()
    if (t?.type === 'punc' && ['!', '-', '+'].includes(t.value)) {
      this.pos++
      const arg = this.parseUnary()
      return { type: 'unary', op: t.value, arg, prefix: true }
    }
    return this.parsePostfix()
  }

  // 成员访问 x.y, x[i], 函数调用 f()
  private parsePostfix(): ASTNode {
    let node = this.parsePrimary()
    for (;;) {
      if (this.eatPunc('.')) {
        const prop = this.next()
        if (prop.type !== 'ident') {
          throw new Error(`位置 ${prop.position}: 成员访问需要属性名`)
        }
        node = {
          type: 'member',
          object: node,
          property: prop.value,
          computed: false,
        }
      } else if (this.eatPunc('[')) {
        const index = this.parseTernary()
        this.expectPunc(']')
        // computed member: obj[expr]
        // 简化处理：如果是字符串字面量，转为 computed: false
        if (index.type === 'str') {
          node = {
            type: 'member',
            object: node,
            property: index.value,
            computed: false,
          }
        } else {
          node = {
            type: 'member',
            object: node,
            property: (index as any).name ?? String((index as any).value),
            computed: true,
          }
        }
      } else if (this.peek()?.type === 'punc' && this.peek()?.value === '(' && (node.type === 'ident' || node.type === 'member')) {
        this.pos++
        const args = this.parseArgs()
        node = { type: 'call', callee: node, args }
      } else {
        return node
      }
    }
  }

  private parseArgs(): ASTNode[] {
    const args: ASTNode[] = []
    if (this.eatPunc(')')) return args
    for (;;) {
      args.push(this.parseTernary())
      if (this.eatPunc(')')) return args
      this.expectPunc(',')
    }
  }

  private parsePrimary(): ASTNode {
    const t = this.next()

    if (t.type === 'num') {
      const v = Number(t.value)
      if (isNaN(v)) throw new Error(`非法数字: ${t.value}`)
      return { type: 'num', value: v }
    }

    if (t.type === 'str') {
      return { type: 'str', value: t.value }
    }

    if (t.type === 'bool') {
      return { type: 'bool', value: t.value === 'true' }
    }

    if (t.type === 'ident') {
      return { type: 'ident', name: t.value }
    }

    if (t.value === '(') {
      const inner = this.parseTernary()
      this.expectPunc(')')
      return inner
    }

    if (t.value === '[') {
      const elements: ASTNode[] = []
      if (!this.eatPunc(']')) {
        for (;;) {
          elements.push(this.parseTernary())
          if (this.eatPunc(']')) break
          this.expectPunc(',')
        }
      }
      return { type: 'array', elements }
    }

    if (t.value === '{') {
      const properties: Array<{ key: string; value: ASTNode }> = []
      if (!this.eatPunc('}')) {
        for (;;) {
          const keyToken = this.next()
          if (keyToken.type !== 'ident' && keyToken.type !== 'str') {
            throw new Error(`位置 ${keyToken.position}: 对象键必须是标识符或字符串`)
          }
          this.expectPunc(':')
          properties.push({ key: keyToken.value, value: this.parseTernary() })
          if (this.eatPunc('}')) break
          this.expectPunc(',')
        }
      }
      return { type: 'object', properties }
    }

    throw new Error(`位置 ${t.position}: 意外的符号: ${t.value}`)
  }
}
