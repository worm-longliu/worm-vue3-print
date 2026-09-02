// ─── Token ───

export type TokenType = 'num' | 'str' | 'bool' | 'ident' | 'punc'

export interface Token {
  type: TokenType
  value: string
  position: number
}

// ─── AST 节点 ───

export type ASTNode =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ident'; name: string }
  | { type: 'binary'; op: string; left: ASTNode; right: ASTNode }
  | { type: 'unary'; op: string; arg: ASTNode; prefix: boolean }
  | { type: 'ternary'; cond: ASTNode; consequent: ASTNode; alternate: ASTNode }
  | { type: 'member'; object: ASTNode; property: string; computed: boolean }
  | { type: 'call'; callee: ASTNode; args: ASTNode[] }
  | { type: 'array'; elements: ASTNode[] }
  | { type: 'object'; properties: Array<{ key: string; value: ASTNode }> }

// ─── 模板 AST ───

export type TemplatePart =
  | { type: 'text'; value: string }
  | { type: 'expr'; expression: ASTNode }

export interface TemplateAST {
  type: 'template'
  parts: TemplatePart[]
}

// ─── 函数签名 ───

export type ExprFunction = (...args: any[]) => any

export interface EngineOptions {
  /** 自定义函数注册表 */
  functions?: Record<string, ExprFunction>
}
