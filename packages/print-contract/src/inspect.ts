import type { TemplateData, PrintElementData, ElementZone } from '@worm-vue3-print/core/designer'
import { getPaperDimensions } from '@worm-vue3-print/core'

export type InspectCode =
  | 'LEGACY_UNIT'
  | 'OUT_OF_CONTENT_AREA'
  | 'ZERO_SIZE_ELEMENT'
  | 'BAND_TOO_SMALL'
  | 'HEADER_TOO_TALL'
  | 'TABLE_COL_WIDTH_MISMATCH'
  | 'TABLE_MISSING_ROWS'
  | 'FLOW_MISSING_COLUMNS'
  | 'ELEMENT_OVERLAP'

export interface InspectFinding {
  code: InspectCode
  level: 'error' | 'warning'
  path: string
  message: string
}

/** 线/矩形/椭圆属装饰层，与文字重叠是常规用法，不参与重叠判定 */
const NON_OVERLAP_TYPES = new Set(['hline', 'vline', 'rect', 'oval'])

interface Rect { left: number; top: number; width: number; height: number }

function rectOverlap(a: Rect, b: Rect, eps: number): boolean {
  return a.left < b.left + b.width - eps
    && b.left < a.left + a.width - eps
    && a.top < b.top + b.height - eps
    && b.top < a.top + a.height - eps
}

function zoneElements(tpl: TemplateData, zone: ElementZone): { list: PrintElementData[]; path: string } {
  if (zone === 'header') return { list: tpl.header?.elements ?? [], path: 'header.elements' }
  if (zone === 'footer') return { list: tpl.footer?.elements ?? [], path: 'footer.elements' }
  return { list: tpl.elements ?? [], path: 'elements' }
}

/**
 * 静态版面体检：只看模板里写死的坐标，不做排版测量。
 * 表格真实行高、长文本换行后的实际占位、分页页数都不在能力范围内——那需要浏览器测量，
 * 走 MCP 的 print_render_preview 交给 print-render 服务出真实数字。
 */
export function inspectTemplate(
  template: TemplateData,
  opts: { toleranceMm?: number } = {},
): { ok: boolean; findings: InspectFinding[] } {
  const tol = opts.toleranceMm ?? 0.2
  const findings: InspectFinding[] = []

  // 旧模板坐标是 pt（无 unit 字段），混算会整体偏 3.5 倍；先要求调用方迁移，不猜
  if (template.unit !== 'mm') {
    findings.push({
      code: 'LEGACY_UNIT',
      level: 'error',
      path: 'unit',
      message: '模板坐标不是 mm，请先经 core 的迁移（designer/utils/migrate.ts）归一后再体检',
    })
    return { ok: false, findings }
  }

  // 连续纸的分页语义与固定纸不同，但横向纸宽同样是硬约束，故判定不分支
  const paper = getPaperDimensions(template)
  const headerH = template.header?.height ?? 0
  const footerH = template.footer?.height ?? 0
  const contentWidth = paper.width - template.margins.left - template.margins.right
  const printableHeight = paper.height - template.margins.top - template.margins.bottom

  if (headerH + footerH > printableHeight + tol) {
    findings.push({
      code: 'HEADER_TOO_TALL',
      level: 'error',
      path: 'header.height',
      message: `页眉+页脚共 ${(headerH + footerH).toFixed(1)}mm，超过可印高度 ${printableHeight.toFixed(1)}mm`,
    })
  }

  for (const zone of ['content', 'header', 'footer'] as ElementZone[]) {
    const { list, path } = zoneElements(template, zone)
    // 页眉/页脚元素坐标相对各自带上沿；内容区纵向由分页接手，不做上限判定
    const bandHeight = zone === 'header' ? headerH : zone === 'footer' ? footerH : Number.POSITIVE_INFINITY

    list.forEach((element, i) => {
      const p = `${path}[${i}]`
      const o = element.options
      const isLine = element.type === 'hline' || element.type === 'vline'

      if ((o.width ?? 0) <= tol && !isLine) {
        findings.push({ code: 'ZERO_SIZE_ELEMENT', level: 'error', path: p,
          message: `宽度 ${o.width}mm 不足以落纸（线类元素除外）` })
      }
      if ((o.height ?? 0) <= tol && !isLine) {
        findings.push({ code: 'ZERO_SIZE_ELEMENT', level: 'error', path: p,
          message: `高度 ${o.height}mm 不足以落纸（线类元素除外）` })
      }
      if (o.left < -tol || o.top < -tol) {
        findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'error', path: p,
          message: `元素起点 (${o.left}, ${o.top}) 为负，落在区域外` })
      } else if (o.left + o.width > contentWidth + tol) {
        // 连续纸同样只有横向是硬约束（纸宽固定，纸高按内容推导）
        findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'error', path: p,
          message: `右边界 ${(o.left + o.width).toFixed(1)}mm 超出可印区宽 ${contentWidth.toFixed(1)}mm` })
      }
      if (Number.isFinite(bandHeight) && o.top + o.height > bandHeight + tol) {
        findings.push({ code: 'BAND_TOO_SMALL', level: 'warning', path: p,
          message: `元素下边界 ${(o.top + o.height).toFixed(1)}mm 超出${zone === 'header' ? '页眉' : '页脚'}带高 ${bandHeight.toFixed(1)}mm` })
      }

      if (element.type === 'table') {
        if (!(o.tableRows ?? []).length) {
          findings.push({ code: 'TABLE_MISSING_ROWS', level: 'error', path: p,
            message: '表格没有 tableRows，出纸为空' })
        }
        const widths = o.tableColWidths ?? []
        if (widths.length) {
          const sum = widths.reduce((a, b) => a + b, 0)
          if (Math.abs(sum - (o.width ?? 0)) > tol) {
            findings.push({ code: 'TABLE_COL_WIDTH_MISMATCH', level: 'warning',
              path: `${p}.options.tableColWidths`,
              message: `列宽合计 ${sum.toFixed(2)}mm 与元素宽 ${o.width}mm 不符` })
          }
        }
      }
      if (element.type === 'flowList' && !(o.flowColumns ?? 0)) {
        findings.push({ code: 'FLOW_MISSING_COLUMNS', level: 'error', path: `${p}.options.flowColumns`,
          message: '流式列表必须显式给 flowColumns（列数不自动推导）' })
      }
    })

    const boxes = list
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !NON_OVERLAP_TYPES.has(String(e.type)))
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a].e.options
        const B = boxes[b].e.options
        if (rectOverlap(A, B, tol)) {
          findings.push({ code: 'ELEMENT_OVERLAP', level: 'warning', path: `${path}[${boxes[a].i}]`,
            message: `与 ${path}[${boxes[b].i}] 矩形交叠，落纸可能互相盖住` })
        }
      }
    }
  }

  return { ok: findings.every(f => f.level !== 'error'), findings }
}
