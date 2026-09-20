// packages/print-core/src/functions/math.ts
// 表达式内置函数：四则运算与数值修约。
// 底层实现在 ../numeric.js，与表达式引擎的运算符共用同一套数值语义。

import {
  decimalAdd,
  decimalDivide,
  decimalMultiply,
  decimalSubtract,
  roundTo,
} from '../numeric.js'

// ─── 四则运算 ───

/** ADD(a, b, …)：相加，无法解析为数字的参数按 0 处理 */
export function addNumbers(...values: unknown[]): number {
  return values.reduce<number>((acc, v) => decimalAdd(acc, v), 0)
}

/** SUB(a, b, …)：首项依次减去后续各项 */
export function subtractNumbers(...values: unknown[]): number {
  if (values.length === 0) return 0
  return values.slice(1).reduce<number>((acc, v) => decimalSubtract(acc, v), decimalAdd(values[0], 0))
}

/** MUL(a, b, …)：相乘 */
export function multiplyNumbers(...values: unknown[]): number {
  if (values.length === 0) return 0
  return values.reduce<number>((acc, v) => decimalMultiply(acc, v), 1)
}

/** DIV(a, b)：相除，除数为 0 返回 0（不产生 Infinity / NaN） */
export function divideNumbers(a: unknown, b: unknown): number {
  return decimalDivide(a, b)
}

// ─── 修约 ───

/**
 * ROUND(n, d)：四舍五入到 d 位小数（d 缺省 2；负数修约到整十/整百，如 -2 → 百位）
 */
export function round(value: unknown, digits?: unknown): number {
  return roundTo(value, digits, 'half-up')
}

/** ROUNDUP / CEIL(n, d)：进一法（远离零方向） */
export function roundUp(value: unknown, digits?: unknown): number {
  return roundTo(value, digits, 'up')
}

/** ROUNDDOWN / FLOOR(n, d)：去尾法（朝零方向） */
export function roundDown(value: unknown, digits?: unknown): number {
  return roundTo(value, digits, 'down')
}

/** ROUNDBANK(n, d)：四舍六入五成双（GB/T 8170 数值修约规则） */
export function roundHalfEven(value: unknown, digits?: unknown): number {
  return roundTo(value, digits, 'half-even')
}
