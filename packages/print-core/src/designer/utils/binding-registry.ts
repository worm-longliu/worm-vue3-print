import type { BindingDescriptor } from '../types.js'
import { BUILTIN_ELEMENT_CAPABILITIES, getElementCapabilities } from '../element-capabilities.js'

/**
 * 元素绑定声明注册表：内置部分由能力位基线派生，唯一真源在 element-capabilities.ts。
 * 保留对象形态以兼容既有消费方；运行时解析请用 `getElementBindings()`（含插件动态声明）。
 */
export const ELEMENT_BINDING_REGISTRY: Record<string, BindingDescriptor[]> = Object.fromEntries(
  Object.entries(BUILTIN_ELEMENT_CAPABILITIES)
    .filter(([, caps]) => caps.bindings !== undefined)
    .map(([type, caps]) => [type, [...(caps.bindings ?? [])]]),
)

export function getTableCellBindings(
  rowType: string,
  rowIndex: number,
  cellIndex: number,
  listField?: string,
): BindingDescriptor[] {
  if (rowType === 'data') {
    return [{
      targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
      label: '内容',
      dataSource: 'list',
      listField,
      placeholder: '{name}',
    }]
  }
  if (rowType === 'subtotal') {
    return [{
      targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
      label: '内容',
      dataSource: 'subtotal',
      placeholder: '{MONEY(SUM(amount))}',
    }]
  }
  if (rowType === 'summary') {
    return [{
      targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
      label: '内容',
      dataSource: 'summary',
      placeholder: '{MONEY(SUM(amount))}',
    }]
  }
  return [{
    targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
    label: '内容',
    dataSource: 'main',
    placeholder: '合计: {order.total}',
  }]
}

export function getElementBindings(element: any): BindingDescriptor[] {
  const type = element.printElementType.type
  // 能力位优先（插件可声明自己的 bindings）；未声明回落内置基线，未注册类型回落空数组
  const staticBindings = getElementCapabilities(type).bindings
    ?? ELEMENT_BINDING_REGISTRY[type]
    ?? []
  const dynamicBindings: BindingDescriptor[] = []

  if (type === 'table') {
    const listField = element.options.dataSource
    for (const [ri, row] of (element.options.tableRows ?? []).entries()) {
      for (const [ci, cell] of row.cells.entries()) {
        if (cell.merged) continue
        dynamicBindings.push(...getTableCellBindings(row.type, ri, ci, listField))
      }
    }
  }

  return [...staticBindings, ...dynamicBindings]
}
