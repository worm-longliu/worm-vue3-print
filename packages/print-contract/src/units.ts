// 元素 option 的取值种类：mm/pt 是长度，count 是「模块数/列数」这类无量纲整数。
export type OptionKind = 'mm' | 'pt' | 'count' | 'color' | 'bool' | 'text' | 'enum' | 'object'

export interface OptionMeta {
  kind: OptionKind
  /** 数值下限（含）；长度类按各自单位 */
  min?: number
  /** 数值上限（含） */
  max?: number
  /** 已废弃但必须继续接受（存量模板），校验只降级为警告 */
  deprecated?: boolean
  /** kind='enum' 时的合法取值 */
  enum?: readonly string[]
}

export interface OptionIssue {
  path: string
  message: string
  level: 'error' | 'warning'
}
