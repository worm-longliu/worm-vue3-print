// packages/print-core/src/template-parser.ts
import type { ASTNode, TemplateAST, TemplatePart, ExprFunction } from './types.js'
import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { evaluate } from './evaluator.js'

/**
 * 解析模板字符串为 TemplateAST
 * 语法: {expr} 内为表达式，外部为字面文本
 * 转义: \{ \} 不解析为表达式
 */
export function parseTemplate(template: string): TemplateAST {
  const parts: TemplatePart[] = []
  let i = 0
  const n = template.length

  while (i < n) {
    // 查找表达式起始
    if (template[i] === '{') {
      let depth = 1
      let j = i + 1
      // 找到匹配的 } (支持嵌套括号)
      while (j < n && depth > 0) {
        if (template[j] === '{') depth++
        else if (template[j] === '}') depth--
        j++
      }
      if (depth !== 0) {
        throw new Error(`位置 ${i}: 花括号未闭合`)
      }
      // 提取表达式内容 (去掉外层 {})
      const exprStr = template.slice(i + 1, j - 1)
      if (exprStr.trim() === '') {
        throw new Error(`位置 ${i}: 空表达式`)
      }
      // 解析表达式为 AST
      const tokens = tokenize(exprStr)
      const expression = parse(tokens)
      parts.push({ type: 'expr', expression })
      i = j
      continue
    }

    // 字面文本：找到下一个 { 或末尾
    let j = i
    while (j < n && template[j] !== '{') {
      // 处理转义字符
      if (template[j] === '\\' && j + 1 < n && (template[j + 1] === '{' || template[j + 1] === '}')) {
        j += 2
      } else {
        j++
      }
    }
    parts.push({ type: 'text', value: template.slice(i, j).replace(/\\([{}])/g, '$1') })
    i = j
  }

  return { type: 'template', parts }
}

/**
 * 将 TemplateAST 渲染为最终字符串
 */
export function renderTemplate(
  ast: TemplateAST,
  context: Record<string, any>,
  functions: Record<string, ExprFunction> = {},
): string {
  let result = ''
  for (const part of ast.parts) {
    if (part.type === 'text') {
      result += part.value
    } else {
      const value = evaluate(part.expression, context, functions)
      result += String(value ?? '')
    }
  }
  return result
}

/**
 * 编译模板，返回渲染函数（性能优化：AST 只解析一次）
 */
export function compileTemplate(
  template: string,
  functions: Record<string, ExprFunction> = {},
): (context: Record<string, any>) => string {
  const ast = parseTemplate(template)
  return (context) => renderTemplate(ast, context, functions)
}
