import { getDemoData } from '../utils/demo-data'

interface BindingDisplayState {
  status: 'unbound' | 'bound' | 'warning' | 'error'
  badge: string
  badgeColor: string
  demoPreview: string
  warning?: string
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

export function useBindingDisplay() {
  function getBindingDisplayState(element: any): BindingDisplayState {
    const formatter = element.options.formatter
    const title = element.options.title

    if (!formatter) {
      return {
        status: 'unbound',
        badge: title || '文本',
        badgeColor: '#909399',
        demoPreview: title || '文本',
      }
    }

    const demoData = getDemoData()
    // 简单预览：从 formatter 中提取字段名并查找 demo 数据
    const fieldMatch = formatter.match(/\{([^}]+)\}/)
    if (fieldMatch) {
      const fieldPath = fieldMatch[1]
      const demoValue = getNestedValue(demoData, fieldPath)
      return {
        status: 'bound',
        badge: `fx ${formatter}`,
        badgeColor: '#409EFF',
        demoPreview: demoValue != null ? String(demoValue) : formatter,
      }
    }

    return {
      status: 'bound',
      badge: `fx ${formatter}`,
      badgeColor: '#409EFF',
      demoPreview: formatter,
    }
  }

  return { getBindingDisplayState }
}
