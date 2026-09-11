import type { PrintBusinessField } from '../types.js'

export interface FieldGroup {
  /** 分组键（fieldKey 首段）；空串表示无分组的顶层字段 */
  key: string
  /** 分组显示名：取容器字段的 fieldLabel，缺省回退为 key */
  label: string
  /** 是否明细列表分组（容器字段 fieldType === 'list'） */
  isList: boolean
  /** 分组下的叶子字段 */
  fields: PrintBusinessField[]
}

/**
 * 将宿主扁平字段按 fieldKey 首段分组：
 * - 带点路径（supplier.name、goods.spec）归入首段分组；
 * - 无点且作为其它字段前缀的记录视为分组容器（如 supplier/goods），
 *   容器提供分组名称，fieldType='list' 标识明细列表（表格数据源）；
 * - 无点且无子字段的记录作为独立顶层字段。
 */
export function groupFields(fields: PrintBusinessField[]): FieldGroup[] {
  const sorted = [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const groupMap = new Map<string, FieldGroup>()
  const groupOrder: string[] = []

  for (const f of sorted) {
    const dot = f.fieldKey.indexOf('.')
    if (dot === -1) continue
    const key = f.fieldKey.slice(0, dot)
    let g = groupMap.get(key)
    if (!g) {
      g = { key, label: key, isList: false, fields: [] }
      groupMap.set(key, g)
      groupOrder.push(key)
    }
    g.fields.push(f)
  }

  const groups: FieldGroup[] = []
  const standalone: PrintBusinessField[] = []
  for (const f of sorted) {
    if (f.fieldKey.includes('.')) continue
    const g = groupMap.get(f.fieldKey)
    if (g) {
      // 容器记录：提供分组名称，列表容器（fieldType='list'）用于表格数据源选择
      g.label = f.fieldLabel
      g.isList = f.fieldType === 'list'
    } else {
      standalone.push(f)
    }
  }
  if (standalone.length) groups.push({ key: '', label: '', isList: false, fields: standalone })
  for (const key of groupOrder) groups.push(groupMap.get(key)!)
  return groups
}

/** 按关键字过滤分组（匹配字段名/字段 key），无叶子的分组剔除 */
export function filterGroups(groups: FieldGroup[], keyword: string): FieldGroup[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return groups
  return groups
    .map(g => ({
      ...g,
      fields: g.fields.filter(
        f => f.fieldLabel.toLowerCase().includes(kw) || f.fieldKey.toLowerCase().includes(kw),
      ),
    }))
    .filter(g => g.fields.length > 0)
}
