// web/src/components/print/__tests__/expression-eval.spec.ts
import { describe, it, expect } from 'vitest'
import { safeEval, evaluateTemplate, EXTENDED_FUNCTIONS } from '../utils/expression-eval'

describe('evaluateTemplate 模板求值（A 语法）', () => {
  it('纯文本直接返回', () => {
    expect(evaluateTemplate('hello', {})).toBe('hello')
  })
  it('纯字段 {name}', () => {
    expect(evaluateTemplate('{name}', { name: '张三' })).toBe('张三')
  })
  it('点分 {supplier.name}', () => {
    expect(evaluateTemplate('{supplier.name}', { supplier: { name: '乐檬' } })).toBe('乐檬')
  })
  it('函数 {MONEY(total)}', () => {
    expect(evaluateTemplate('{MONEY(total)}', { total: 1299 })).toBe('1,299.00')
  })
  it('文本+函数 金额: {MONEY(amount)} 元', () => {
    expect(evaluateTemplate('金额: {MONEY(amount)} 元', { amount: 1299 })).toBe('金额: 1,299.00 元')
  })
  it('条件 {IF(qty>10, "大额", "小额")}', () => {
    expect(evaluateTemplate('{IF(qty>10, "大额", "小额")}', { qty: 15 })).toBe('大额')
  })
  it('聚合 {SUM(amount)} 用 rows', () => {
    expect(evaluateTemplate('{SUM(amount)}', { rows: [{ amount: 100 }, { amount: 20 }] })).toBe('120')
  })
  it('聚合+格式化 {MONEY(SUM(amount))}', () => {
    expect(evaluateTemplate('{MONEY(SUM(amount))}', { rows: [{ amount: 100 }, { amount: 20.5 }] })).toBe('120.50')
  })
  it('空字符串返回空', () => {
    expect(evaluateTemplate('', {})).toBe('')
  })
  it('求值失败保留原 {expr}', () => {
    expect(evaluateTemplate('{noSuch.x}', {})).toBe('{noSuch.x}')
  })
  it('undefined 值返回空', () => {
    expect(evaluateTemplate('{name}', { name: undefined })).toBe('')
  })
})

describe('EXTENDED_FUNCTIONS', () => {
  it('CONCAT 拼接多个值', () => {
    expect(EXTENDED_FUNCTIONS.CONCAT('a', 'b', 'c')).toBe('abc')
  })
  it('IFEMPTY 返回默认值', () => {
    expect(EXTENDED_FUNCTIONS.IFEMPTY('', '默认')).toBe('默认')
    expect(EXTENDED_FUNCTIONS.IFEMPTY(null, '默认')).toBe('默认')
    expect(EXTENDED_FUNCTIONS.IFEMPTY('有值', '默认')).toBe('有值')
  })
  it('ROUND 四舍五入', () => {
    expect(EXTENDED_FUNCTIONS.ROUND(1.235, 2)).toBe(1.24)
  })
  it('SUBSTR 截取子串', () => {
    expect(EXTENDED_FUNCTIONS.SUBSTR('hello', 1, 3)).toBe('ell')
  })
  it('LEN 长度', () => {
    expect(EXTENDED_FUNCTIONS.LEN('abc')).toBe(3)
  })
  it('DATE 格式化', () => {
    expect(EXTENDED_FUNCTIONS.DATE('2025-03-15', 'YYYY/MM/DD')).toBe('2025/03/15')
  })
  it('UPPER 大写数字', () => {
    const result = EXTENDED_FUNCTIONS.UPPER(1234)
    expect(result).toContain('壹')
    expect(result).toContain('元整')
  })
})

describe('safeEval 基础能力', () => {
  it('字面量与算术运算', () => {
    expect(safeEval('1 + 2 * 3', {})).toBe(7)
    expect(safeEval('(1 + 2) * 3', {})).toBe(9)
    expect(safeEval('10 % 3', {})).toBe(1)
    expect(safeEval("'a' + 'b'", {})).toBe('ab')
    expect(safeEval('true', {})).toBe(true)
    expect(safeEval('null', {})).toBe(null)
  })
  it('上下文标识符与成员访问', () => {
    expect(safeEval('row.qty * row.price', { row: { qty: 3, price: 2.5 } })).toBe(7.5)
    expect(safeEval("row['name']", { row: { name: '货物' } })).toBe('货物')
    expect(safeEval('data[0].name', { data: [{ name: 'A' }] })).toBe('A')
    expect(safeEval('index + 1', { index: 4 })).toBe(5)
  })
  it('比较 / 逻辑 / 三元', () => {
    expect(safeEval('index % 2 === 0', { index: 4 })).toBe(true)
    expect(safeEval('row.qty > 10 && row.qty < 100', { row: { qty: 50 } })).toBe(true)
    expect(safeEval('!row.done || row.qty >= 1', { row: { done: true, qty: 0 } })).toBe(false)
    expect(safeEval("index % 2 === 0 ? 'even' : 'odd'", { index: 3 })).toBe('odd')
  })
  it('对象字面量（rowStyle 场景）', () => {
    expect(safeEval("index % 2 === 1 ? { background: '#f5f5f5' } : {}", { index: 1 }))
      .toEqual({ background: '#f5f5f5' })
    expect(safeEval("{ color: row.qty > 10 ? 'red' : 'black', fontWeight: 'bold' }", { row: { qty: 20 } }))
      .toEqual({ color: 'red', fontWeight: 'bold' })
  })
  it('数组字面量', () => {
    expect(safeEval('[1, 2, 3][1]', {})).toBe(2)
  })
  it('金额拼接用顶级函数 FORMAT 替代 toFixed', () => {
    expect(safeEval("'¥' + FORMAT(Number(value))", { value: '12.345' })).toBe('¥12.35')
  })
  it('对象方法调用不支持（需用顶级函数）', () => {
    expect(() => safeEval("row.name.toUpperCase()", { row: { name: 'abc' } })).toThrow()
    expect(() => safeEval("'  x  '.trim()", {})).toThrow()
  })
  it('白名单全局对象', () => {
    expect(safeEval('Math.round(2.6)', {})).toBe(3)
    expect(safeEval("parseInt('42')", {})).toBe(42)
    expect(safeEval("parseFloat('3.14') + 1", {})).toBeCloseTo(4.14)
    expect(safeEval('String(123)', {})).toBe('123')
    expect(safeEval("isNaN(Number('x'))", {})).toBe(true)
  })
})

describe('safeEval 安全拦截', () => {
  it('拒绝访问未注册全局（window/document/globalThis）', () => {
    expect(() => safeEval('window.alert(1)', {})).toThrow()
    expect(() => safeEval('document.cookie', {})).toThrow()
    expect(() => safeEval('globalThis', {})).toThrow()
  })
  it('拒绝危险属性（constructor/__proto__/prototype）', () => {
    expect(() => safeEval("''.constructor", {})).toThrow()
    expect(() => safeEval("row['constructor']", { row: {} })).toThrow()
    expect(() => safeEval('row.__proto__', { row: {} })).toThrow()
    expect(() => safeEval('Number.prototype', {})).toThrow()
  })
  it('拒绝赋值 / new / 函数定义 / 语句', () => {
    expect(() => safeEval('row.x = 1', { row: {} })).toThrow()
    expect(() => safeEval('new Date()', {})).toThrow()
    expect(() => safeEval('() => 1', {})).toThrow()
    expect(() => safeEval('function f() {}', {})).toThrow()
    expect(() => safeEval('1; 2', {})).toThrow()
  })
  it('拒绝非白名单方法', () => {
    expect(() => safeEval("'x'.constructor('alert(1)')()", {})).toThrow()
    expect(() => safeEval('row.hasOwnProperty("x")', { row: {} })).toThrow()
  })
})
