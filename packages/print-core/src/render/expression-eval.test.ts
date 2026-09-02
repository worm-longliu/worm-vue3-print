// print-render/src/expression-eval.test.ts
import { describe, it, expect } from 'vitest'
import { evaluateTemplate, safeEval } from './expression-eval.js'

describe('evaluateTemplate 模板求值', () => {
  it('纯字面文本原样返回', () => {
    expect(evaluateTemplate('合计', {})).toBe('合计')
  })
  it('纯字段引用 {name}', () => {
    expect(evaluateTemplate('{name}', { name: '张三' })).toBe('张三')
  })
  it('点分字段 {supplier.name}', () => {
    expect(evaluateTemplate('{supplier.name}', { supplier: { name: '乐檬' } })).toBe('乐檬')
  })
  it('文本+函数 金额: {MONEY(amount)} 元', () => {
    expect(evaluateTemplate('金额: {MONEY(amount)} 元', { amount: 1299 })).toBe('金额: 1,299.00 元')
  })
  it('条件 {IF(qty>10, "大单", "小单")}', () => {
    expect(evaluateTemplate('{IF(qty>10, "大单", "小单")}', { qty: 15 })).toBe('大单')
  })
  it('聚合 {SUM(amount)} 用 rows 上下文', () => {
    const rows = [{ amount: 100 }, { amount: 20 }]
    expect(evaluateTemplate('{SUM(amount)}', { rows })).toBe('120')
  })
  it('聚合+格式化 {MONEY(SUM(amount))}', () => {
    const rows = [{ amount: 100 }, { amount: 20.5 }]
    expect(evaluateTemplate('{MONEY(SUM(amount))}', { rows })).toBe('120.50')
  })
  it('AVG/COUNT/MIN/MAX', () => {
    const rows = [{ v: 4 }, { v: 8 }, { v: 2 }]
    expect(evaluateTemplate('{COUNT(v)}', { rows })).toBe('3')
    expect(evaluateTemplate('{MIN(v)}', { rows })).toBe('2')
    expect(evaluateTemplate('{MAX(v)}', { rows })).toBe('8')
    const avg = evaluateTemplate('{AVG(v)}', { rows })
    expect(Number(avg)).toBeCloseTo(14 / 3)
  })
  it('空模板返回空', () => {
    expect(evaluateTemplate('', {})).toBe('')
  })
  it('求值失败时 {} 内保留原文', () => {
    expect(evaluateTemplate('{undefinedVar.x}', {})).toBe('{undefinedVar.x}')
  })
  it('多段混合 你好 {name}，{MONEY(amount)} 元', () => {
    expect(evaluateTemplate('你好 {name}，{MONEY(amount)} 元', { name: '张三', amount: 99 })).toBe('你好 张三，99.00 元')
  })
})

describe('safeEval 安全', () => {
  it('拒绝 process', () => {
    expect(() => safeEval('process.exit()', {})).toThrow()
  })
})
