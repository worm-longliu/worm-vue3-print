import type { TemplateData, PrintElementData, ElementZone } from '@worm-vue3-print/core/designer'
import { getPaperDimensions, getRotatedAabb, resolveElementRotation } from '@worm-vue3-print/core'

export type InspectCode =
  | 'LEGACY_UNIT'
  | 'OUT_OF_PAPER'
  | 'OUT_OF_CONTENT_AREA'
  | 'ZERO_SIZE_ELEMENT'
  | 'BAND_TOO_SMALL'
  | 'HEADER_TOO_TALL'
  | 'TABLE_COL_WIDTH_MISMATCH'
  | 'TABLE_MISSING_ROWS'
  | 'FLOW_MISSING_COLUMNS'
  | 'ELEMENT_OVERLAP'
  | 'BACKGROUND_NOT_PAGEABLE'
  | 'BARCODE_MISSING_BAR_HEIGHT'

export interface InspectFinding {
  code: InspectCode
  level: 'error' | 'warning'
  path: string
  message: string
}

/** 线/矩形/椭圆属装饰层，与文字重叠是常规用法，不参与重叠判定 */
const NON_OVERLAP_TYPES = new Set(['hline', 'vline', 'rect', 'oval'])

/** 背景/装饰层候选：随版面比例判定的类型（文本/表格/码类不算背景） */
const BACKGROUND_CANDIDATE_TYPES = new Set(['rect', 'oval', 'image', 'vline', 'hline'])

/** 占版面比例阈值：宽或高达到内容区的 80% 即视为背景/装饰层 */
const BACKGROUND_RATIO = 0.8

/**
 * 判断元素是否像背景/装饰层（按模板自身内容区比例，不含任何绝对尺寸假设）。
 * 这类元素全宽/大幅占版面，若参与分页预算会吃掉整列额度把后续内容挤到下一页。
 */
function isBackgroundLike(
  element: { type?: string },
  o: { width?: number; height?: number },
  contentWidth: number,
  contentHeight: number,
): boolean {
  if (!BACKGROUND_CANDIDATE_TYPES.has(String(element.type))) return false
  const wRatio = contentWidth > 0 ? (o.width ?? 0) / contentWidth : 0
  const hRatio = contentHeight > 0 ? (o.height ?? 0) / contentHeight : 0
  return wRatio >= BACKGROUND_RATIO || hRatio >= BACKGROUND_RATIO
}

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
 * 这些结果需要在设计器或打印预览中通过浏览器测量确认。
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
  // 内容区可用高度（页眉页脚另占带高）
  const contentHeight = printableHeight - headerH - footerH

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
      // 横向两档：区域坐标以「内容区左上角」为原点，纸张左沿在 margins.left 处。
      // 落在纸张之外 = 出纸必被裁（error）；只是越出内容区但仍在纸上 = 侵入页边距（warning）。
      const designRect = { left: o.left ?? 0, top: o.top ?? 0, width: o.width ?? 0, height: o.height ?? 0 }
      const rotation = resolveElementRotation(element.type ?? element.printElementType?.type ?? 'text', o)
      const horizontalRect = rotation === undefined
        ? designRect
        : getRotatedAabb(designRect, designRect.height, rotation)
      const paperX0 = template.margins.left + horizontalRect.left
      const paperX1 = paperX0 + horizontalRect.width
      if (paperX1 > paper.width + tol || paperX0 < -tol) {
        findings.push({ code: 'OUT_OF_PAPER', level: 'error', path: p,
          message: `横向占位 ${paperX0.toFixed(1)}~${paperX1.toFixed(1)}mm 超出纸张宽 ${paper.width}mm，出纸会被裁切` })
      } else if (horizontalRect.left + horizontalRect.width > contentWidth + tol || horizontalRect.left < -tol) {
        findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'warning', path: p,
          message: `横向占位 ${horizontalRect.left.toFixed(1)}~${(horizontalRect.left + horizontalRect.width).toFixed(1)}mm 越出内容区宽 ${contentWidth.toFixed(1)}mm，落在页边距内` })
      }
      // 纵向：内容区向下溢出由分页接手，只有「起点为负」需要提示；越过纸张上沿才是 error
      if (zone === 'content' && o.top < -tol) {
        const paperY0 = template.margins.top + headerH + o.top
        if (paperY0 < -tol) {
          findings.push({ code: 'OUT_OF_PAPER', level: 'error', path: p,
            message: `纵向起点 ${paperY0.toFixed(1)}mm 落在纸张外` })
        } else {
          findings.push({ code: 'OUT_OF_CONTENT_AREA', level: 'warning', path: p,
            message: `纵向起点 ${o.top.toFixed(1)}mm 为负，侵入上边距或页眉带` })
        }
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
      // 背景类元素（全宽/大幅装饰）参与分页预算会占满整列额度，把后续内容挤到下一页
      if (zone === 'content' && isBackgroundLike(element, o, contentWidth, contentHeight)
        && (o.pagination as { pageable?: boolean } | undefined)?.pageable !== false) {
        findings.push({ code: 'BACKGROUND_NOT_PAGEABLE', level: 'warning', path: `${p}.options.pagination`,
          message: `该元素横向或纵向占版面 ${Math.round(Math.max((o.width ?? 0) / contentWidth, (o.height ?? 0) / contentHeight) * 100)}%，`
            + '疑似背景/装饰层：建议设 pagination.pageable=false，否则会挤占分页预算导致后续内容换页' })
      }
      if (element.type === 'barcode' && typeof o.barHeight !== 'number') {
        findings.push({ code: 'BARCODE_MISSING_BAR_HEIGHT', level: 'warning', path: `${p}.options.barHeight`,
          message: '条码未给 barHeight，条纹按缺省档渲染，实际条高可能与元素高不一致；'
            + '需要精确复刻时请显式设置 barHeight（mm）' })
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
