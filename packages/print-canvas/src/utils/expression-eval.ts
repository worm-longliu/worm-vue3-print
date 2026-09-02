// web/src/components/print/utils/expression-eval.ts
// 包装共享引擎，保持原有 API 兼容

import { engine } from './engine'
import {
  formatMoney,
  formatDate,
  toUpperCaseAmount,
  ifFn,
  sum,
  avg,
  count,
  min,
  max,
} from '@worm-vue3-print/core'

// 扩展函数库（保持原有导出）
export const EXTENDED_FUNCTIONS = {
  MONEY: formatMoney,
  CONCAT: (...args: any[]) => args.filter(v => v != null).join(''),
  IF: ifFn,
  FORMAT: (value: any) => {
    if (typeof value !== 'number') return String(value)
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  },
  SUBSTR: (str: string, start: number, len?: number) => String(str).slice(start, len ? start + len : undefined),
  LEN: (str: string) => String(str).length,
  ROUND: (num: number, decimals: number) => Number(Number(num).toFixed(decimals)),
  NOW: () => new Date().toISOString().split('T')[0],
  IFEMPTY: (value: any, defaultVal: string) => (value != null && value !== '' ? String(value) : defaultVal),
  PAD: (value: any, len: number, char: string) => String(value).padStart(len, char),
  REPLACE: (str: string, from: string, to: string) => String(str).replace(new RegExp(from, 'g'), to),
  JSON: (value: any) => JSON.stringify(value, null, 2),
  DATE: formatDate,
  UPPER: toUpperCaseAmount,
} satisfies Record<string, (...args: any[]) => any>

// 注册所有扩展函数到共享引擎
for (const [name, fn] of Object.entries(EXTENDED_FUNCTIONS)) {
  engine.registerFunction(name, fn)
}

// ─── 聚合函数 ───

function aggregate(fn: string, field: string, rows: Record<string, any>[]): number {
  switch (fn.toUpperCase()) {
    case 'SUM': return sum(rows, field)
    case 'AVG': return avg(rows, field)
    case 'COUNT': return count(rows, field)
    case 'MIN': return min(rows, field)
    case 'MAX': return max(rows, field)
    default: return 0
  }
}

/**
 * 在受限沙箱内求值表达式
 * @param expr 表达式字符串
 * @param context 上下文变量
 * @param _callableNames 保留参数，实际使用共享引擎
 */
export function safeEval(expr: string, context: Record<string, any>, _callableNames?: string[]): any {
  return engine.evaluate(expr, context)
}

/**
 * 模板字符串求值：{表达式} 内 safeEval 求值，外为字面文本。
 * 聚合函数 SUM/AVG/COUNT/MIN/MAX(field) 预处理（需 ctx.rows）。
 * 单个 {expr} 求值失败时保留原 {expr} 文本。
 */
export function evaluateTemplate(text: string, ctx: Record<string, any>): string {
  if (!text) return ''
  if (!text.includes('{')) return text
  const rows: Record<string, any>[] = Array.isArray(ctx.rows) ? ctx.rows : []
  
  // 预处理聚合函数
  let processedText = text.replace(/\{([^}]+)\}/g, (_match, inner) => {
    let expr = inner.trim()
    // 聚合函数预处理：SUM(field) -> 数值字面量
    expr = expr.replace(/\b(SUM|AVG|COUNT|MIN|MAX)\(([^)]+)\)/g, (_m: string, fn: string, arg: string) => {
      const field = arg.trim().replace(/^['"]|['"]$/g, '')
      return String(aggregate(fn, field, rows))
    })
    return `{${expr}}`
  })
  
  // 使用共享引擎渲染
  try {
    const result = engine.render(processedText, ctx)
    return result
  } catch {
    // 降级：保留原表达式
    return text
  }
}
