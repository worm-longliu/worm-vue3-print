import type {
  ElementType, ElementOptions, PrintElementData, TemplateData,
} from '@worm-vue3-print/core/designer'
import { createRuntimeElement, BLOCKED_ELEMENT_TYPES } from '@worm-vue3-print/core/designer'
import type { OptionIssue } from './units.js'
import { ELEMENT_KINDS } from './kinds.js'
import { validateTemplateJson } from './validate.js'
import { inspectTemplate } from './inspect.js'
import { checkExpression } from './expression.js'

export interface DraftElement {
  type: ElementType
  /** 元素属性；坐标与尺寸单位 mm（fontSize/borderWidth 等为 pt） */
  options?: Partial<ElementOptions>
  /** 元素级绑定表达式；表格/列表的绑定请写进 tableRows[].cells[].formatter */
  formatter?: string
}

export interface DraftSpec {
  paper?: Partial<Pick<TemplateData,
  'paperSize' | 'orientation' | 'margins' | 'customWidth' | 'customHeight' | 'pageBackground'>>
  elements: DraftElement[]
}

export interface DraftResult {
  template: TemplateData
  issues: OptionIssue[]
  expressionErrors: string[]
}

/**
 * 按结构化 spec 生成模板草稿：元素一律走 core 元素工厂（自带设计器默认值），
 * 生成后当场回灌 validate + inspect + 表达式校验，让调用方拿到「可用性已知」的草稿。
 * 只产出 JSON，不触碰画布状态。
 */
export function draftTemplate(spec: DraftSpec): DraftResult {
  const issues: OptionIssue[] = []
  const expressionErrors: string[] = []

  const elements = (spec.elements ?? []).reduce<PrintElementData[]>((acc, item, i) => {
    if (BLOCKED_ELEMENT_TYPES.includes(item.type)) {
      issues.push({
        path: `elements[${i}].type`,
        level: 'error',
        message: `${item.type} 元素不开放给 AI 生成（core 封禁清单，防标记注入）`,
      })
      return acc
    }
    const runtime = createRuntimeElement(item.type, item.options ?? {})
    const options = { ...runtime.options }
    if (item.formatter) {
      options.formatter = item.formatter
      const checked = checkExpression(item.formatter)
      if (!checked.ok) {
        expressionErrors.push(`elements[${acc.length}].options.formatter: ${checked.errors.join('; ')}`)
      }
    }
    // RuntimeElement 的 zone 是运行时字段，序列化时由设计器剥离；草稿一律落在内容区
    acc.push({
      id: runtime.id,
      type: runtime.printElementType.type,
      options,
      printElementType: runtime.printElementType,
    })
    return acc
  }, [])

  const template: TemplateData = {
    paperSize: spec.paper?.paperSize ?? 'A4',
    orientation: spec.paper?.orientation ?? 'portrait',
    margins: spec.paper?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
    unit: 'mm',
    ...(spec.paper?.customWidth !== undefined ? { customWidth: spec.paper.customWidth } : {}),
    ...(spec.paper?.customHeight !== undefined ? { customHeight: spec.paper.customHeight } : {}),
    ...(spec.paper?.pageBackground !== undefined ? { pageBackground: spec.paper.pageBackground } : {}),
  }

  issues.push(...validateTemplateJson(template).issues)
  issues.push(...inspectTemplate(template).findings.map(f => ({
    path: f.path,
    level: f.level,
    message: `[${f.code}] ${f.message}`,
  })))

  return { template, issues, expressionErrors }
}

export { ELEMENT_KINDS }
