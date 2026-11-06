import type {
  ElementType, ElementOptions, PrintElementData, TemplateData,
} from '@worm-vue3-print/core/designer'
import { createRuntimeElement, BLOCKED_ELEMENT_TYPES } from '@worm-vue3-print/core/designer'
import { getPaperDimensions } from '@worm-vue3-print/core'
import type { OptionIssue } from './units.js'
import { ELEMENT_KINDS } from './kinds.js'
import { validateTemplateJson } from './validate.js'
import { inspectTemplate } from './inspect.js'
import { checkExpression } from './expression.js'
import { expandPreset, DRAFT_PRESETS } from './presets.js'

export interface DraftElement {
  type: ElementType
  /** 元素属性；坐标与尺寸单位 mm（fontSize/borderWidth 等为 pt） */
  options?: Partial<ElementOptions>
  /** 元素级绑定表达式；表格/列表的绑定请写进 tableRows[].cells[].formatter */
  formatter?: string
}

export interface DraftSpec {
  /**
   * 布局配方 id（如 doc-a4 / receipt-80mm）：传了就由配方展开版式骨架，不再算坐标；
   * 与 elements 互斥。spec.paper 仍可覆盖配方默认纸张。
   */
  preset?: string
  paper?: Partial<Pick<TemplateData,
  'paperSize' | 'orientation' | 'margins' | 'customWidth' | 'customHeight' | 'pageBackground'>>
  elements?: DraftElement[]
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
  let elementsSource: DraftElement[] | undefined = spec.elements
  let paperSource = spec.paper

  if (spec.preset !== undefined) {
    const expanded = expandPreset(spec.preset, spec.paper)
    if (!expanded) {
      issues.push({
        path: 'preset',
        level: 'error',
        message: `未知 preset「${spec.preset}」。可用：${DRAFT_PRESETS.map(p => p.id).join('、')}；可用 print_element_kinds 查看 各 preset 的场景与槽位。`,
      })
      elementsSource = []
    } else {
      if (spec.elements?.length) {
        issues.push({
          path: 'preset',
          level: 'error',
          message: 'preset 与 elements 互斥：preset 生成的是带占位绑定的完整骨架，请基于返回的 template 修改字段绑定后重新校验。',
        })
      }
      paperSource = expanded.paper
      elementsSource = expanded.elements
      for (const item of expanded.issues) {
        issues.push({ path: item.path, level: item.level, message: item.message })
      }
    }
  } else if (!spec.elements?.length) {
    // 空 spec 出来的是一张白纸，模型容易误当成「已生成」直接写回画布，必须当场报 error
    issues.push({
      path: 'elements',
      level: 'error',
      message: '未生成任何元素：请提供 preset（用 print_element_kinds 查看可用配方）或至少一个 elements 元素。',
    })
  }

  const elements = (elementsSource ?? []).reduce<PrintElementData[]>((acc, item, i) => {
    if (BLOCKED_ELEMENT_TYPES.includes(item.type)) {
      issues.push({
        path: `elements[${i}].type`,
        level: 'error',
        message: `${item.type} 元素不开放给 AI 生成（core 封禁清单，防标记注入）`,
      })
      return acc
    }
    const runtime = createRuntimeElement(item.type, item.options ?? {})
    const options = { ...runtime.options } as ElementOptions
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

  // 背景/装饰层自动退出分页预算：全宽或大幅元素会占满「横向列占用额度」，把后续内容挤到下一页。
  // 判定按本次草稿自身内容区比例（无绝对尺寸假设），显式 pagination 一律尊重作者设置。
  const autoPageable = disablePaginationForBackgroundLayers(elements, paperSource)
  for (const note of autoPageable.notes) issues.push({ path: note.path, level: 'warning', message: note.message })

  const template: TemplateData = {
    paperSize: paperSource?.paperSize ?? 'A4',
    orientation: paperSource?.orientation ?? 'portrait',
    margins: paperSource?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements,
    unit: 'mm',
    ...(paperSource?.customWidth !== undefined ? { customWidth: paperSource.customWidth } : {}),
    ...(paperSource?.customHeight !== undefined ? { customHeight: paperSource.customHeight } : {}),
    ...(paperSource?.pageBackground !== undefined ? { pageBackground: paperSource.pageBackground } : {}),
  }

  issues.push(...validateTemplateJson(template).issues)
  issues.push(...inspectTemplate(template).findings.map(f => ({
    path: f.path,
    level: f.level,
    message: `[${f.code}] ${f.message}`,
  })))

  return { template, issues, expressionErrors }
}

/** 背景候选类型：与 inspect 的判定口径一致，文本/表格/码类不算背景 */
const BACKGROUND_CANDIDATE_TYPES = new Set(['rect', 'oval', 'image', 'vline', 'hline'])

/** 占版面比例阈值：宽或高达到内容区 80% 即视为背景/装饰层 */
const BACKGROUND_RATIO = 0.8

/**
 * 给「背景/装饰层」补 pagination.pageable=false：
 * 这类元素全宽或大幅占版面，参与分页预算会吃掉整列额度，把后续元素挤到下一页（实测踩过）。
 * 判定只按模板自身内容区比例，没有绝对尺寸假设；元素已有 pagination 配置时一律尊重作者。
 */
function disablePaginationForBackgroundLayers(
  elements: PrintElementData[],
  paper: DraftSpec['paper'],
): { notes: Array<{ path: string; message: string }> } {
  const notes: Array<{ path: string; message: string }> = []
  const paperSize = paper?.paperSize ?? 'A4'
  const dims = getPaperDimensions({
    paperSize,
    orientation: paper?.orientation ?? 'portrait',
    ...(paper?.customWidth !== undefined ? { customWidth: paper.customWidth } : {}),
    ...(paper?.customHeight !== undefined ? { customHeight: paper.customHeight } : {}),
  })
  const margins = paper?.margins ?? { top: 10, right: 10, bottom: 10, left: 10 }
  const contentW = dims.width - margins.left - margins.right
  const contentH = dims.height - margins.top - margins.bottom
  if (contentW <= 0 || contentH <= 0) return { notes }

  for (const [i, el] of elements.entries()) {
    if (!BACKGROUND_CANDIDATE_TYPES.has(String(el.type))) continue
    const o = el.options
    if (o.pagination) continue // 作者已显式配置，尊重原设置
    const wRatio = (o.width ?? 0) / contentW
    const hRatio = (o.height ?? 0) / contentH
    if (wRatio < BACKGROUND_RATIO && hRatio < BACKGROUND_RATIO) continue
    o.pagination = { pageable: false, keepWithNext: false }
    notes.push({
      path: `elements[${i}].options.pagination`,
      message: `该元素占版面 ${Math.round(Math.max(wRatio, hRatio) * 100)}%，已自动设 pageable=false，`
        + '避免它占满分页预算把后续内容挤到下一页',
    })
  }
  return { notes }
}

export { ELEMENT_KINDS }
