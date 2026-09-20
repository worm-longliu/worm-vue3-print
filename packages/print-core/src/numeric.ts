// packages/print-core/src/numeric.ts
// 数值工具：表达式引擎与内置函数共用。
//
// 三个由来已久的痛点（打印单据场景下会被直接看见）：
// 1. 数据里的数字常常是字符串（JSON、后端字段），参与 `+` 会变成字符串拼接；
// 2. 二进制浮点误差：`0.1 + 0.2` → `0.30000000000000004`，直接印在单据上；
// 3. `Number.prototype.toFixed` 的舍入陷阱：`(1.005).toFixed(2)` → `1.00`（应为 1.01）。
//
// 因此这里统一做：数值化、十进制精确四则、按十进制字符串精确判定修约。

/** 修约位数上限（也是 `toFixed` 的安全区间） */
const MAX_DIGITS = 20
/** 十进制化时额外保留的小数位，用于吸收二进制表示误差（1.005 实际是 1.00499…） */
const EXTRA_SCALE = 8

/**
 * 把任意值转成数字：无法解析（空串、null、非数字字符串、数组/对象）一律返回兜底值。
 * 布尔按 JS 语义转 1 / 0。
 */
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const s = value.trim()
    if (s === '') return fallback
    const n = Number(s)
    return Number.isFinite(n) ? n : fallback
  }
  if (value == null) return fallback
  if (typeof value === 'boolean') return value ? 1 : 0
  return fallback
}

/**
 * 是否"像数字"：数字，或能完整解析为数字的非空字符串。
 * 用于 `+` 判定走数值相加还是字符串拼接（布尔与对象不算，避免误伤文本拼接）。
 */
export function isNumericLike(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') {
    const s = value.trim()
    return s !== '' && Number.isFinite(Number(s))
  }
  return false
}

/**
 * 裁剪二进制浮点噪声：0.30000000000000004 → 0.3，42.37499999999999 → 42.375。
 * 整数、非有限值、以及超出安全整数量级的大数原样返回（不引入新的误差）。
 */
export function normalizeFloat(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return value
  if (Math.abs(value) >= 1e15) return value
  return Number(value.toPrecision(12))
}

function decimalsOf(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0
  const s = String(n)
  if (s.includes('e') || s.includes('E')) return 0
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}

/**
 * 把「按最大小数位缩放后取整」的修约应用到算术结果上，消除二进制误差。
 * decimals 为期望的最大小数位（加法/减法取两侧较大者，乘法取两侧之和）。
 */
function rescale(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0
  const d = Math.min(Math.max(decimals, 0), 12)
  if (d === 0) return Math.round(value)
  const f = 10 ** d
  const scaled = value * f
  if (!Number.isFinite(scaled) || Math.abs(scaled) >= 1e15) return normalizeFloat(value)
  return Math.round(scaled) / f
}

export function decimalAdd(left: unknown, right: unknown): number {
  const a = toNumber(left)
  const b = toNumber(right)
  const raw = a + b
  return rescale(raw, Math.max(decimalsOf(a), decimalsOf(b)))
}

export function decimalSubtract(left: unknown, right: unknown): number {
  const a = toNumber(left)
  const b = toNumber(right)
  const raw = a - b
  return rescale(raw, Math.max(decimalsOf(a), decimalsOf(b)))
}

export function decimalMultiply(left: unknown, right: unknown): number {
  const a = toNumber(left)
  const b = toNumber(right)
  const raw = a * b
  return rescale(raw, decimalsOf(a) + decimalsOf(b))
}

/** 除法：除数为 0（或无法解析为数字）返回 0，避免 Infinity / NaN 印到单据上 */
export function decimalDivide(left: unknown, right: unknown): number {
  const a = toNumber(left)
  const b = toNumber(right)
  if (b === 0) return 0
  return normalizeFloat(a / b)
}

/** 取余：除数无效返回 0 */
export function decimalModulo(left: unknown, right: unknown): number {
  const a = toNumber(left)
  const b = toNumber(right)
  if (b === 0) return 0
  return normalizeFloat(a % b)
}

// ─── 修约 ───

export type RoundingMode = 'half-up' | 'up' | 'down' | 'half-even'

/** 修约位数归一化：缺省 2，超出 [-20, 20] 截断。负数表示修约到整十/整百（如 -2 → 百位） */
function normalizeDigits(digits: unknown): number {
  if (digits === undefined || digits === null) return 2
  const d = Math.trunc(toNumber(digits, 2))
  if (!Number.isFinite(d)) return 2
  return Math.min(Math.max(d, -MAX_DIGITS), MAX_DIGITS)
}

/**
 * 十进制精确修约。
 *
 * 先把数字按十进制字符串化（避开 1.005 → 1.00499… 的二进制误差），
 * 再用 BigInt 按十进制做整除与余数判定，最后还原为数字。
 *
 * - `half-up`：四舍五入（5 进位）
 * - `up`：进一法（远离零方向，只要有余数就进）
 * - `down`：去尾法（朝零方向）
 * - `half-even`：四舍六入五成双（GB/T 8170 数值修约；5 后非零则进，5 后皆零则凑偶）
 */
export function roundTo(value: unknown, digits: unknown, mode: RoundingMode): number {
  const n = toNumber(value, 0)
  const d = normalizeDigits(digits)
  if (n === 0) return 0

  // 超大数 toFixed 会返回科学计数法字符串（如 "1e+21"），十进制化失效，退化为浮点处理
  if (Math.abs(n) >= 1e21) return normalizeFloat(n)

  const scale = Math.max(d, 0) + EXTRA_SCALE
  const fixed = n.toFixed(scale)
  if (!/^-?\d+(\.\d+)?$/.test(fixed)) return normalizeFloat(n)

  const negative = fixed.startsWith('-')
  const digitsStr = fixed.replace('-', '').replace('.', '')
  let scaled = BigInt(digitsStr || '0')
  if (negative) scaled = -scaled

  // 目标单位 10^(-d)：scaled 表示 n × 10^scale，故除数为 10^(scale - d)
  const pow10 = 10n ** BigInt(scale - d)
  const sign = scaled < 0n ? -1n : 1n
  const abs = scaled < 0n ? -scaled : scaled
  let q = abs / pow10
  const r = abs % pow10
  const doubled = 2n * r

  if (mode === 'up') {
    // 进一法：只要舍去部分不为 0 就远离零进一位
    if (r !== 0n) q += 1n
  } else if (mode !== 'down' && doubled >= pow10) {
    // 舍去部分 >= 一半：half-up 一律进位；half-even 仅在凑偶时进位（q 为奇数）
    if (doubled > pow10 || mode === 'half-up' || q % 2n === 1n) q += 1n
  }

  const result = sign * q
  return normalizeFloat(d >= 0 ? Number(result) / 10 ** d : Number(result) * 10 ** -d)
}
