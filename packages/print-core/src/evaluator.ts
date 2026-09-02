// packages/print-core/src/evaluator.ts
import type { ASTNode, ExprFunction } from './types.js'

const SAFE_GLOBALS: Record<string, any> = {
  Math, Number, String, Boolean, parseInt, parseFloat, isNaN,
  true: true, false: false, null: null, undefined,
}

const DANGEROUS_PROPS = new Set([
  'constructor', '__proto__', 'prototype',
  '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
])

const CALLABLE_GLOBALS = new Set(['Number', 'String', 'Boolean', 'parseInt', 'parseFloat', 'isNaN'])

export function evaluate(
  node: ASTNode,
  context: Record<string, any>,
  functions: Record<string, ExprFunction> = {},
): any {
  switch (node.type) {
    case 'num':
      return node.value
    case 'str':
      return node.value
    case 'bool':
      return node.value
    case 'ident':
      return evalIdent(node.name, context, functions)
    case 'binary':
      return evalBinary(node, context, functions)
    case 'unary':
      return evalUnary(node, context, functions)
    case 'ternary':
      return evaluate(node.cond, context, functions)
        ? evaluate(node.consequent, context, functions)
        : evaluate(node.alternate, context, functions)
    case 'member':
      return evalMember(node, context, functions)
    case 'call':
      return evalCall(node, context, functions)
    case 'array':
      return node.elements.map(e => evaluate(e, context, functions))
    case 'object':
      return Object.fromEntries(
        node.properties.map(p => [p.key, evaluate(p.value, context, functions)])
      )
  }
}

function evalIdent(name: string, context: Record<string, any>, functions: Record<string, ExprFunction>): any {
  if (Object.prototype.hasOwnProperty.call(context, name)) {
    return context[name]
  }
  if (Object.prototype.hasOwnProperty.call(SAFE_GLOBALS, name)) {
    return SAFE_GLOBALS[name]
  }
  throw new Error(`未定义的标识符: ${name}`)
}

function evalBinary(node: { op: string; left: ASTNode; right: ASTNode }, context: Record<string, any>, functions: Record<string, ExprFunction>): any {
  const left = evaluate(node.left, context, functions)
  const right = evaluate(node.right, context, functions)

  switch (node.op) {
    case '+': return left + right
    case '-': return left - right
    case '*': return left * right
    case '/': return left / right
    case '%': return left % right
    case '<': return left < right
    case '>': return left > right
    case '<=': return left <= right
    case '>=': return left >= right
    case '==': return left == right
    case '!=': return left != right
    case '===': return left === right
    case '!==': return left !== right
    case '&&': return left && right
    case '||': return left || right
    default:
      throw new Error(`未知运算符: ${node.op}`)
  }
}

function evalUnary(node: { op: string; arg: ASTNode }, context: Record<string, any>, functions: Record<string, ExprFunction>): any {
  const arg = evaluate(node.arg, context, functions)
  switch (node.op) {
    case '-': return -arg
    case '+': return +arg
    case '!': return !arg
    default:
      throw new Error(`未知一元运算符: ${node.op}`)
  }
}

function evalMember(node: { object: ASTNode; property: string; computed: boolean }, context: Record<string, any>, functions: Record<string, ExprFunction>): any {
  const obj = evaluate(node.object, context, functions)
  if (obj == null) {
    throw new Error('无法访问空值的属性')
  }
  if (DANGEROUS_PROPS.has(node.property)) {
    throw new Error(`禁止访问属性: ${node.property}`)
  }
  return (obj as any)[node.property]
}

function evalCall(node: { callee: ASTNode; args: ASTNode[] }, context: Record<string, any>, functions: Record<string, ExprFunction>): any {
  // 全局函数
  if (node.callee.type === 'ident' && CALLABLE_GLOBALS.has(node.callee.name)) {
    const fn = SAFE_GLOBALS[node.callee.name]
    const args = node.args.map(a => evaluate(a, context, functions))
    return fn(...args)
  }

  // Math 静态方法
  if (node.callee.type === 'member' && node.callee.object.type === 'ident' && node.callee.object.name === 'Math') {
    const method = (Math as any)[node.callee.property]
    if (typeof method !== 'function') {
      throw new Error(`Math.${node.callee.property} 不是方法`)
    }
    const args = node.args.map(a => evaluate(a, context, functions))
    return method(...args)
  }

  // 自定义函数
  let fnName: string | undefined
  if (node.callee.type === 'ident') {
    fnName = node.callee.name
  } else if (node.callee.type === 'member') {
    // obj.method() 形式暂不支持，只支持顶级函数
    throw new Error('不支持方法调用，请使用顶级函数')
  }

  if (fnName && functions[fnName]) {
    const args = node.args.map(a => evaluate(a, context, functions))
    return functions[fnName](...args)
  }

  // 如果标识符在上下文中但不是函数
  if (fnName && Object.prototype.hasOwnProperty.call(context, fnName)) {
    throw new Error(`${fnName} 不是函数`)
  }

  throw new Error(`不允许调用: ${fnName ?? '表达式'}`)
}
