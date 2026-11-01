import { describe, it, expect } from 'vitest'
import { checkExpression, EXPRESSION_FUNCTIONS, SYSTEM_VARIABLES } from '../expression.js'

describe('checkExpression', () => {
  it('普通字段与嵌套函数合法，并识别出用到的函数', () => {
    const r = checkExpression('金额：{MONEY(SUM(amount))}', ['amount'])
    expect(r.ok).toBe(true)
    expect(r.syntax).toBe('valid')
    expect(r.functions.sort()).toEqual(['MONEY', 'SUM'])
    expect(r.unknownFields).toEqual([])
  })

  it('未闭合花括号判语法错', () => {
    const r = checkExpression('{MONEY(amount', ['amount'])
    expect(r.ok).toBe(false)
    expect(r.syntax).toBe('invalid')
    expect(r.errors.join()).toContain('花括号未闭合')
  })

  it('空表达式判错', () => {
    const r = checkExpression('{}')
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('空')
  })

  it('原型链探测被拒绝', () => {
    const r = checkExpression('{constructor.name}', [])
    expect(r.ok).toBe(false)
  })

  it('未知字段只警告，不判失败（宿主字典可能不全）', () => {
    const r = checkExpression('{notInDict}', ['amount'])
    expect(r.ok).toBe(true)
    expect(r.unknownFields).toEqual(['notInDict'])
  })

  it('函数清单来自 core 白名单，含聚合函数', () => {
    expect(EXPRESSION_FUNCTIONS).toContain('MONEY')
    expect(EXPRESSION_FUNCTIONS).toContain('IFEMPTY')
    expect(EXPRESSION_FUNCTIONS).toContain('SUM')
  })

  it('core 真实系统变量不被误报成未知字段', () => {
    // data-binder.ts:344-353 resolveSystemVariables 的真实名单
    for (const v of ['printDate', 'printTime', 'pageIndex', 'totalPages']) {
      const r = checkExpression(`{${v}}`, ['amount'])
      expect(r.unknownFields).toEqual([])
      expect(r.ok).toBe(true)
    }
    expect(SYSTEM_VARIABLES).toEqual(['printDate', 'printTime', 'pageIndex', 'totalPages'])
  })

  it('JS 模板字符串写法 ${...} 被拒（否则会打出字面 $）', () => {
    const r = checkExpression('${total}', ['total'])
    expect(r.ok).toBe(false)
    expect(r.errors.join()).toContain('${')
  })

  it('语法合法但求值期失败也被拦（证明试求值真的在跑）', () => {
    // 解析能过、标识符都在字典里，但 number.toUpperCase 在求值期炸：只有真跑了才检得出
    const r = checkExpression('{amount.toUpperCase()}', ['amount'])
    expect(r.syntax).toBe('valid')
    expect(r.unknownFields).toEqual([])
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.ok).toBe(false)
  })

  it('纯字面文本（无花括号）合法', () => {
    expect(checkExpression('合计').ok).toBe(true)
  })
})
