// print-core/src/render/expression-eval.ts
// 渲染管线表达式求值：基于模板引擎 + 渲染扩展函数（MONEY/DATE/IF 等）与聚合预处理。
// 同构模块：Node（print-render）与浏览器（print-canvas 预览）共用。

import { tokenize } from '../lexer.js'
import { parse } from '../parser.js'
import { evaluate as evaluateAst } from '../evaluator.js'
import { compileTemplate } from '../template-parser.js'
import type { ExprFunction } from '../types.js'
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
} from '../functions/index.js'

/** 轻量引擎：与 TemplateEngine 同构，避免与包入口 index.ts 形成循环依赖 */
class RenderEngine {
  private functions: Record<string, ExprFunction> = {}

  registerFunction(name: string, fn: ExprFunction): void {
    this.functions[name] = fn
  }

  evaluate(expression: string, context: Record<string, any>): any {
    const tokens = tokenize(expression)
    const ast = parse(tokens)
    return evaluateAst(ast, context, this.functions)
  }

  render(template: string, context: Record<string, any>): string {
    return compileTemplate(template, this.functions)(context)
  }
}

const engine = new RenderEngine()

// 扩展格式化函数
const FORMAT_FUNCTIONS: Record<string, (...args: any[]) => any> = {
  MONEY: formatMoney,
  DATE: formatDate,
  UPPER: toUpperCaseAmount,
  IF: ifFn,
  CONCAT: (...args: any[]) => args.filter(v => v != null).map(String).join(''),
  IFEMPTY: (v: any, d: string) => (v != null && v !== '' ? String(v) : d),
  ROUND: (n: number, d: number) => Number(Number(n).toFixed(d)),
  LEN: (s: string) => String(s).length,
}

for (const [name, fn] of Object.entries(FORMAT_FUNCTIONS)) {
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
 */
export function safeEval(expr: string, context: Record<string, any>): any {
  return engine.evaluate(expr, context)
}

/**
 * 模板字符串求值：{表达式} 内求值，外为字面文本。
 * 聚合函数 SUM/AVG/COUNT/MIN/MAX(field) 预处理（需 ctx.rows）。
 * 单个 {expr} 求值失败时保留原 {expr} 文本。
 */
export function evaluateTemplate(text: string, ctx: Record<string, any>): string {
  if (!text) return ''
  if (!text.includes('{')) return text
  const rows: Record<string, any>[] = Array.isArray(ctx.rows) ? ctx.rows : []

  // 预处理聚合函数
  const processedText = text.replace(/\{([^}]+)\}/g, (_match, inner) => {
    let expr = inner.trim()
    // 聚合函数预处理：SUM(field) -> 数值字面量
    expr = expr.replace(/\b(SUM|AVG|COUNT|MIN|MAX)\(([^)]+)\)/g, (_m: string, fn: string, arg: string) => {
      const field = arg.trim().replace(/^['"]|['"]$/g, '')
      return String(aggregate(fn, field, rows))
    })
    return `{${expr}}`
  })

  try {
    return engine.render(processedText, ctx)
  } catch {
    // 降级：保留原表达式
    return text
  }
}
