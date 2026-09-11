// web/src/components/print/utils/binding.ts
import type { RuntimeElement } from '../types.js'
import { createRuntimeElement } from './element-factory.js'
import { engine } from './engine.js'
import { DEFAULT_DEMO_DATA } from './demo-data.js'
import './expression-eval'

/** 从业务字段创建带 formatter 绑定的文本元素 */
export function createFieldElement(field: { fieldKey: string; fieldLabel: string }): RuntimeElement {
  return createRuntimeElement('text', {
    formatter: `{${field.fieldKey}}`,
    title: field.fieldLabel,
  })
}

/** 非设计态文本内容解析：用共享引擎渲染 formatter */
export function resolveTextBinding(
  options: { formatter?: string },
  data?: Record<string, any>[],
): string {
  if (options.formatter) {
    if (!data || data.length === 0) return ''
    const row = data[0]
    try {
      return engine.render(options.formatter, row ?? {})
    } catch {
      return options.formatter
    }
  }
  return ''
}

/** 按路径取 demo 数据值，数组节点取首项 */
function lookupDemoPath(path: string): any {
  let cur: any = DEFAULT_DEMO_DATA
  for (const seg of path.split('.')) {
    if (cur == null) return undefined
    cur = Array.isArray(cur) ? cur[0]?.[seg] : cur[seg]
  }
  return cur
}

/**
 * 设计态条码/二维码单元格取值：{field} 占位符替换为 demo 数据
 * （列表字段取数据源首项，全局字段按路径取），无匹配回退通用示例码值
 */
export function resolveBarcodeDesignValue(
  formatter: string | undefined,
  listSource?: Record<string, any>[],
): string {
  const first = listSource?.[0]
  const resolved = (formatter ?? '')
    .replace(/\{([^{}]+)\}/g, (_, expr: string) => {
      const key = expr.trim()
      const v = key.includes('.')
        ? lookupDemoPath(key)
        : (first?.[key] ?? lookupDemoPath(key))
      return v == null ? '' : String(v)
    })
    .trim()
  return resolved || '1234567890128'
}
