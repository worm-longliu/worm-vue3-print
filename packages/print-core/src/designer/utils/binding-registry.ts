import type { BindingDescriptor } from '../types.js'

/**
 * 元素绑定声明注册表
 * 每个元素类型声明其支持的 formatter 绑定位置
 */
export const ELEMENT_BINDING_REGISTRY: Record<string, BindingDescriptor[]> = {
  text: [
    { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
  ],
  longText: [
    { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
    { targetPath: 'options.styler', label: '样式', dataSource: 'main' },
  ],
  barcode: [
    { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
  ],
  qrcode: [
    { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
  ],
  image: [
    { targetPath: 'options.src', label: '内容', dataSource: 'main', placeholder: '输入图片路径，支持 /docfiles/... 相对路径、绝对 URL 或 {字段} 表达式' },
  ],
  table: [],
}

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
  const staticBindings = ELEMENT_BINDING_REGISTRY[type] ?? []
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
