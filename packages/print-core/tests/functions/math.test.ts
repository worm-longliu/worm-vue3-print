// packages/print-core/tests/functions/math.test.ts
import { describe, it, expect } from 'vitest'
import {
  addNumbers,
  subtractNumbers,
  multiplyNumbers,
  divideNumbers,
  round,
  roundUp,
  roundDown,
  roundHalfEven,
} from '../../src/functions/math.js'

describe('四则运算函数', () => {
  it('ADD 支持变参并按数值相加（字符串数字不拼接）', () => {
    expect(addNumbers('1.1', 2.2)).toBe(3.3)
    expect(addNumbers(1, 2, 3)).toBe(6)
    expect(addNumbers('3', 4)).toBe(7)
  })

  it('SUB 依次相减', () => {
    expect(subtractNumbers(10, 3)).toBe(7)
    expect(subtractNumbers(10, 1, 2)).toBe(7)
    expect(subtractNumbers('10', '0.9')).toBe(9.1)
  })

  it('MUL 消除二进制浮点噪声', () => {
    expect(multiplyNumbers(1.1, 3)).toBe(3.3)
    expect(multiplyNumbers(12.5, '3', 1.13)).toBe(42.375)
  })

  it('DIV 除数为 0 返回 0，不产生 Infinity / NaN', () => {
    expect(divideNumbers(10, 4)).toBe(2.5)
    expect(divideNumbers(10, 0)).toBe(0)
    expect(divideNumbers(10, null)).toBe(0)
  })

  it('非法入参按 0 处理', () => {
    expect(addNumbers('abc', 5)).toBe(5)
    expect(multiplyNumbers(null, 5)).toBe(0)
    expect(addNumbers()).toBe(0)
    expect(multiplyNumbers()).toBe(0)
    expect(subtractNumbers()).toBe(0)
  })
})

describe('ROUND 四舍五入', () => {
  it('修复 toFixed 的舍入陷阱', () => {
    // (1.005).toFixed(2) === '1.00'，正确结果应为 1.01
    expect(round(1.005, 2)).toBe(1.01)
    expect(round(2.675, 2)).toBe(2.68)
    expect(round(1.004, 2)).toBe(1)
    expect(round(1.006, 2)).toBe(1.01)
  })

  it('位数缺省为 2', () => {
    expect(round(1.005)).toBe(1.01)
    expect(round('3.14159')).toBe(3.14)
  })

  it('支持 0 位与负数位（整十/整百修约）', () => {
    expect(round(3.5, 0)).toBe(4)
    expect(round(1234, -2)).toBe(1200)
    expect(round(1250, -2)).toBe(1300)
  })

  it('负数按绝对值修约后带符号', () => {
    expect(round(-1.005, 2)).toBe(-1.01)
    expect(round(-1250, -2)).toBe(-1300)
  })

  it('非数值与空值兜底为 0', () => {
    expect(round('abc')).toBe(0)
    expect(round(null, 2)).toBe(0)
    expect(round(undefined)).toBe(0)
  })
})

describe('ROUNDUP / ROUNDDOWN', () => {
  it('进一法：只要舍去部分不为 0 就远离零进一位', () => {
    expect(roundUp(1.001, 2)).toBe(1.01)
    expect(roundUp(-1.001, 2)).toBe(-1.01)
    expect(roundUp(1.2, 0)).toBe(2)
    expect(roundUp(-1.2, 0)).toBe(-2)
  })

  it('去尾法：朝零方向舍去', () => {
    expect(roundDown(1.009, 2)).toBe(1)
    expect(roundDown(-1.009, 2)).toBe(-1)
    expect(roundDown(1.9, 0)).toBe(1)
  })

  it('正好整除时不额外进退', () => {
    expect(roundUp(1.2, 1)).toBe(1.2)
    expect(roundDown(1.2, 1)).toBe(1.2)
  })
})

describe('ROUNDBANK 四舍六入五成双（GB/T 8170）', () => {
  it('5 后皆为 0 时凑偶', () => {
    expect(roundHalfEven(0.125, 2)).toBe(0.12)
    expect(roundHalfEven(0.135, 2)).toBe(0.14)
    expect(roundHalfEven(2.5, 0)).toBe(2)
    expect(roundHalfEven(3.5, 0)).toBe(4)
  })

  it('5 后仍有非零则进位', () => {
    expect(roundHalfEven(0.1251, 2)).toBe(0.13)
    expect(roundHalfEven(2.51, 0)).toBe(3)
  })

  it('与四舍五入的差异用例', () => {
    expect(round(0.125, 2)).toBe(0.13)
    expect(roundHalfEven(0.125, 2)).toBe(0.12)
  })
})
