// packages/print-core/src/functions/format.ts

/**
 * 金额格式化：千分位 + 两位小数
 */
export function formatMoney(value: any): string {
  const num = Number(value)
  if (isNaN(num)) return String(value)

  const sign = num < 0 ? '-' : ''
  const abs = Math.abs(num)
  const [intPart, decPart] = abs.toFixed(2).split('.')

  // 千分位
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${formatted}.${decPart}`
}

/**
 * 日期格式化
 * 支持: YYYY, MM, DD, HH, mm, ss
 */
export function formatDate(value: any, fmt: string): string {
  let date: Date
  if (value instanceof Date) {
    date = value
  } else if (typeof value === 'number') {
    date = new Date(value)
  } else if (typeof value === 'string') {
    date = new Date(value)
  } else {
    return String(value)
  }

  if (isNaN(date.getTime())) return String(value)

  const pad = (n: number) => String(n).padStart(2, '0')

  return fmt
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
    .replace('ss', pad(date.getSeconds()))
}

/**
 * 数字转大写金额
 */
export function toUpperCaseAmount(value: any): string {
  const num = Number(value)
  if (isNaN(num)) return String(value)

  if (num === 0) return '零元整'

  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const units = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿']

  const sign = num < 0 ? '负' : ''
  const abs = Math.abs(num)
  const [intStr, decStr] = abs.toFixed(2).split('.')
  const intNum = parseInt(intStr, 10)

  // 整数部分
  let result = ''
  if (intNum > 0) {
    const intChars = intStr.split('').reverse()
    let groupIdx = 0
    let lastDigit = 0
    let needZero = false

    for (let i = 0; i < intChars.length; i++) {
      const d = parseInt(intChars[i], 10)
      const unit = units[groupIdx % 4]
      const bigUnit = bigUnits[Math.floor(groupIdx / 4)]

      if (d === 0) {
        if (lastDigit !== 0) needZero = true
      } else {
        if (needZero) {
          result = '零' + result
          needZero = false
        }
        result = digits[d] + unit + result
        lastDigit = d
      }

      // 在万、亿位后加大单位
      if (groupIdx % 4 === 3 && groupIdx > 0) {
        result = bigUnit + result
      }

      groupIdx++
    }
    result += '元'
  }

  // 小数部分
  const jiao = parseInt(decStr[0], 10)
  const fen = parseInt(decStr[1], 10)

  if (jiao === 0 && fen === 0) {
    result += '整'
  } else {
    if (jiao > 0) {
      result += digits[jiao] + '角'
    }
    if (fen > 0) {
      result += digits[fen] + '分'
    }
  }

  return sign + result
}

/**
 * 条件判断函数
 */
export function ifFn(condition: any, trueVal: any, falseVal: any): any {
  return condition ? trueVal : falseVal
}
