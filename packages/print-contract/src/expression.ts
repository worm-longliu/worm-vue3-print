import { parseTemplate } from '@worm-vue3-print/core'
import { engine, EXTENDED_FUNCTIONS } from '@worm-vue3-print/core/designer'

/** 聚合函数由 evaluateTemplate 文本预处理，没注册进 engine（designer/utils/expression-eval.ts:59） */
export const AGGREGATE_FUNCTIONS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'] as const

export const EXPRESSION_FUNCTIONS: readonly string[] = [
  ...Object.keys(EXTENDED_FUNCTIONS),
  ...AGGREGATE_FUNCTIONS,
]

/**
 * 与 core evaluator 的 DANGEROUS_PROPS 同集合（evaluator.ts:18）。
 * 该集合 core 未导出，这里是第二份副本：判据单点仍在渲染端，本包只做事前提示。
 */
export const PROBE_TOKENS = [
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
] as const

/**
 * 求值期系统变量，名单来自 core render/data-binder.ts:344-353 的 resolveSystemVariables：
 * printDate / printTime / pageIndex / totalPages。写成别的名字会把真实系统变量报成未知字段。
 */
export const SYSTEM_VARIABLES = ['printDate', 'printTime', 'pageIndex', 'totalPages'] as const

export interface ExpressionResult {
  ok: boolean
  syntax: 'valid' | 'invalid'
  functions: string[]
  unknownFields: string[]
  errors: string[]
}

/** 抽出每个 {…} 表达式体；只做词法切分，不重做语法分析（语法一律交给 core 解析器） */
function expressionBodies(text: string): string[] {
  const out: string[] = []
  const re = /\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1])
  return out
}

function scanBody(body: string) {
  const functions = new Set<string>()
  const identifiers = new Set<string>()
  const keywords = new Set(['AND', 'OR', 'NOT', 'true', 'false', 'null', 'undefined'])
  const fnRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(body))) functions.add(m[1].toUpperCase())
  // 函数名与属性访问（obj.prop 的 prop）不算业务字段：先抹掉函数调用与 .prop 段
  const stripped = body
    .replace(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g, '(')
    .replace(/\.\s*[A-Za-z_][A-Za-z0-9_]*/g, '')
  for (const match of stripped.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    if (!keywords.has(match[0])) identifiers.add(match[0])
  }
  return { functions: [...functions], identifiers: [...identifiers] }
}

export function checkExpression(expr: string, knownFields: string[] = []): ExpressionResult {
  const errors: string[] = []
  let syntax: 'valid' | 'invalid' = 'valid'

  // AI 最常见的错写：把 JS 模板字符串语法带进来。core 解析器只把 {…} 当表达式，
  // 前面的 $ 会原样成为字面文本并打到纸上，所以这里必须判失败。
  if (/\$\{/.test(expr)) {
    errors.push('检测到 ${...}：本引擎不是 JS 模板字符串，去掉 $ 直接写 {字段} 或 {FUNC(字段)}')
  }

  // 1. 语法：整串交给 core 解析器（未闭合花括号、空表达式都在这里显形，文案与出纸端一致）
  if (expr && expr.includes('{')) {
    try {
      parseTemplate(expr)
    } catch (e) {
      syntax = 'invalid'
      errors.push((e as Error).message)
    }
  }

  const functions = new Set<string>()
  const identifierPool = new Set<string>()

  for (const body of expressionBodies(expr)) {
    const scan = scanBody(body)
    scan.functions.forEach(f => functions.add(f))
    scan.identifiers.forEach(i => identifierPool.add(i))

    // 2. 函数白名单：聚合函数不在 engine 里注册，只查名字合法性
    for (const fn of scan.functions) {
      if (!EXPRESSION_FUNCTIONS.includes(fn)) errors.push(`未知函数 ${fn}()`)
    }
    // 3. 原型链探测：词法级拒绝，不依赖 evaluator 是否会从上下文取到同名键
    for (const token of PROBE_TOKENS) {
      if (new RegExp(`\\b${token}\\b`).test(body)) {
        errors.push(`表达式含 ${token}，渲染端沙箱会拒绝求值`)
      }
    }
    // 4. 试求值：含聚合函数的表达式跳过（engine 未注册聚合函数，必然抛错）
    const hasAggregate = scan.functions.some(
      f => (AGGREGATE_FUNCTIONS as readonly string[]).includes(f),
    )
    if (!hasAggregate && syntax === 'valid') {
      const ctx: Record<string, unknown> = {}
      for (const v of SYSTEM_VARIABLES) ctx[v] = '1'
      for (const id of scan.identifiers) ctx[id] = 1
      try {
        // evaluate 收「裸表达式」，render 收「带 {} 的模板串」：这里必须用 evaluate，
        // 用 render 传裸表达式会被当字面文本返回，探测形同虚设
        engine.evaluate(body, ctx)
      } catch (e) {
        errors.push((e as Error).message)
      }
    }
  }

  const dict = new Set(knownFields)
  const unknownFields = dict.size
    ? [...identifierPool].filter(
        i => !dict.has(i)
          && !(EXPRESSION_FUNCTIONS as readonly string[]).includes(i)
          && !(SYSTEM_VARIABLES as readonly string[]).includes(i),
      )
    : []

  return {
    ok: syntax === 'valid' && errors.length === 0,
    syntax,
    functions: [...functions],
    unknownFields,
    errors,
  }
}
