// print-core/src/render/pagination-engine.ts
// PRD 4.4 分页算法实现 + 4.5 边界规则
// 方案 A+B：表格下方跟随区（flow-group 相对容器）由分页引擎计算容器起点

import type {
  TemplateData,
  TemplateElement,
  MeasuredElement,
  PageLayout,
  PageSection,
} from './types.js'
import { getPaperDimensions } from './types.js'

/** 分页配置读取：options 内优先（前端序列化位置），顶层兼容旧测试/旧数据 */
function paginationOf(el: TemplateElement): { pageable?: boolean; keepWithNext?: boolean } | undefined {
  return el.options?.pagination ?? el.pagination
}

function tablePaginationOf(el: TemplateElement): { enabled?: boolean } | undefined {
  return el.options?.tablePagination ?? el.tablePagination
}

/** 分页安全余量（mm），PRD 风险缓解项 */
const SAFETY_MARGIN = 2

function isTableEl(el: TemplateElement): boolean {
  return el.type === 'table' || el.printElementType?.type === 'table'
}

/**
 * 表格设计底部（mm）= 设计 top + 设计高度。
 * 设计高度优先取 tableRows 设计行高之和（设计意图，不受渲染数据量影响），
 * 缺失时回退 options.height。
 */
export function tableDesignBottom(el: TemplateElement): number {
  const opts = el.options ?? {}
  const top = opts.top ?? 0
  const rows: Array<{ height?: number }> = opts.tableRows ?? []
  if (rows.length > 0) {
    return top + rows.reduce((s, r) => s + (r.height ?? 0), 0)
  }
  return top + (opts.height ?? 0)
}

/**
 * 构建「表格 → 跟随区成员」映射。
 * 规则：按 Y 排序遍历，每个非表格元素归入「它上方最近的表格」，
 * 且仅当元素设计 top ≥ 该表格设计底部（设计上位于表格下方）。
 */
function buildFollowMap(sorted: TemplateElement[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  let currentTableId: string | null = null
  let currentTableBottom = -1
  for (const el of sorted) {
    if (isTableEl(el)) {
      currentTableId = el.id
      currentTableBottom = tableDesignBottom(el)
      map.set(el.id, [])
      continue
    }
    const top = el.options?.top ?? 0
    if (currentTableId && top >= currentTableBottom) {
      map.get(currentTableId)!.push(el.id)
    }
  }
  return map
}

/**
 * 跟随区总高度（mm）= 首元素与表格的间距 + 各成员实测高度 + 成员间设计间距。
 * 间距 = 成员设计 top − 前驱设计 bottom（设计 Y 差值，保留排版意图）。
 */
function followGroupHeight(
  el: TemplateElement,
  members: string[],
  template: TemplateData,
  measuredElements: Map<string, MeasuredElement>,
): number {
  let cursorBottom = tableDesignBottom(el)
  let total = 0
  for (const id of members) {
    const m = template.elements.find(e => e.id === id)
    if (!m) continue
    const mTop = m.options?.top ?? 0
    total += Math.max(mTop - cursorBottom, 0)
    total += measuredElements.get(id)?.measuredHeight ?? m.options?.height ?? 0
    cursorBottom = mTop + (m.options?.height ?? 0)
  }
  return total
}

// ─── 公共 API ───

/**
 * 基于测量结果执行分页计算，返回每页的布局方案。
 *
 * 算法流程：
 * 1. 计算页面可用高度（contentHeight / availableHeight）
 * 2. 按 Y 坐标顺序遍历内容区元素
 * 3. 表格：逐行切片；非表格：元素级不拆分
 * 4. 处理 keepWithNext、单行超高、首页叠加等边界
 * 5. 表格下方跟随区：与最后一片同页时包成 flow-group；放不下整体移下一页
 */
export function paginate(
  template: TemplateData,
  measuredElements: Map<string, MeasuredElement>,
): PageLayout[] {
  const paper = getPaperDimensions(template)
  const { top: mt, bottom: mb } = template.margins
  const headerH = template.header?.height ?? 0
  const footerH = template.footer?.height ?? 0
  const overlayH = template.firstPageOverlay?.height ?? 0

  // PRD 4.3: contentHeight = paperHeight - marginTop - marginBottom - headerHeight - footerHeight
  const contentHeight = paper.height - mt - mb - headerH - footerH
  if (contentHeight <= 0) {
    throw new Error(
      `页面可用高度不足: paper=${paper.height}mm, margins=${mt + mb}mm, header=${headerH}mm, footer=${footerH}mm`,
    )
  }

  // 按 Y 坐标排序内容区元素（使用 options.top）
  const sorted = [...template.elements].sort((a, b) => {
    const topA = a.options?.top ?? 0
    const topB = b.options?.top ?? 0
    return topA - topB
  })

  // 方案 A+B：表格跟随区归属（表格 id → 成员元素 id）
  const followMap = buildFollowMap(sorted)
  const followOwner = new Map<string, string>()
  for (const [tableId, members] of followMap) {
    for (const m of members) followOwner.set(m, tableId)
  }

  const pages: PageLayout[] = []
  let currentPage: PageSection[] = []
  let remaining = contentHeight - overlayH - SAFETY_MARGIN
  let isFirstPage = true
  // 是否已发生换页：换页后内容从新页内容区顶部(0)排布，不再使用设计坐标
  let pageBroken = false

  /** 本节在本页内容区内的定位 top：未换页用元素设计 top，换页后从页顶开始 */
  function sectionTop(el: TemplateElement): number {
    return pageBroken ? 0 : (el.options?.top ?? 0)
  }

  /** 获取当前页完整可用高度 */
  function fullPageHeight(): number {
    return isFirstPage
      ? contentHeight - overlayH - SAFETY_MARGIN
      : contentHeight - SAFETY_MARGIN
  }

  /** 结束当前页，开启新页 */
  function finishPage(): void {
    pages.push({ pageIndex: pages.length, sections: [...currentPage] })
    currentPage = []
    remaining = contentHeight - SAFETY_MARGIN
    isFirstPage = false
    pageBroken = true
  }

  // ── 遍历元素 ──
  let i = 0
  while (i < sorted.length) {
    const el = sorted[i]

    // 跟随区成员已由所属表格的 flow-group 处理，跳过
    if (followOwner.has(el.id)) {
      i++
      continue
    }

    // 不参与分页的元素：始终放在第一页
    if (paginationOf(el)?.pageable === false) {
      currentPage.push({ elementId: el.id, type: 'element', renderTop: sectionTop(el) })
      i++
      continue
    }

    if (isTableEl(el)) {
      i = paginateTable(el, measuredElements, i)
    } else {
      i = paginateNonTable(el, measuredElements, sorted, i)
    }
  }

  // 收尾：最后一页
  if (currentPage.length > 0) {
    pages.push({ pageIndex: pages.length, sections: [...currentPage] })
  }
  // 空模板至少一页
  if (pages.length === 0) {
    pages.push({ pageIndex: 0, sections: [] })
  }

  return pages

  // ─── 非表格元素分页（PRD 4.4 非表格分支） ───

  function paginateNonTable(
    el: TemplateElement,
    measured: Map<string, MeasuredElement>,
    sortedList: TemplateElement[],
    idx: number,
  ): number {
    const elHeight = measured.get(el.id)?.measuredHeight ?? el.options?.height ?? 0

    if (elHeight <= remaining) {
      // 放得下
      currentPage.push({ elementId: el.id, type: 'element', renderTop: sectionTop(el) })
      remaining -= elHeight

      // keepWithNext 处理
      if (paginationOf(el)?.keepWithNext && idx + 1 < sortedList.length) {
        const nextEl = sortedList[idx + 1]
        const nextHeight = measured.get(nextEl.id)?.measuredHeight
          ?? nextEl.options?.height ?? 0

        // keepWithNext 降级：组合总高度超过页面可用高度时失效
        if (elHeight + nextHeight > fullPageHeight()) {
          return idx + 1
        }

        if (nextHeight > remaining) {
          // 下一元素放不下，当前元素也移到新页（保持一组）
          currentPage.pop()
          finishPage()
          currentPage.push({ elementId: el.id, type: 'element', renderTop: sectionTop(el) })
          remaining -= elHeight
        }
      }

      return idx + 1
    }

    // 放不下，整体移到下一页
    finishPage()
    currentPage.push({ elementId: el.id, type: 'element', renderTop: sectionTop(el) })
    remaining -= elHeight
    return idx + 1
  }

  // ─── 表格元素分页（Excel 风格矩阵：keep-together 行组切片） ───
  // 切片完成后处理跟随区（方案 A+B）：与最后一片同页 → 升级 flow-group；否则整体移页

  function paginateTable(
    el: TemplateElement,
    measured: Map<string, MeasuredElement>,
    idx: number,
  ): number {
    const opts = el.options ?? {}
    const renderRows: any[] = opts._renderRows ?? []
    const rowHeights = measured.get(el.id)?.measuredRowHeights ?? []

    // 小计行 / 汇总行不参与普通行切片：抽离高度，渲染时按页尾/表尾注入。
    // 仅 dynamic 模式（存在 _subtotalTemplates/_summaryRows）抽离；static（废弃）模式
    // 小计/汇总为普通静态行，保持原有行为不抽离。
    const hasSubtotal = (opts._subtotalTemplates?.length ?? 0) > 0
    const hasSummary = (opts._summaryRows?.length ?? 0) > 0
    const subtotalH = hasSubtotal ? specialRowHeight(renderRows, rowHeights, 'subtotal') : 0
    const summaryH = hasSummary ? specialRowHeight(renderRows, rowHeights, 'summary') : 0
    const isSpecial = (r: any) =>
      (hasSubtotal && r.type === 'subtotal') || (hasSummary && r.type === 'summary')
    // 正文行（header + data）写回 opts._renderRows，渲染端按切片区间直接使用
    const bodyRows = renderRows.filter(r => !isSpecial(r))
    const bodyHeights = rowHeights.filter((_, i) => !isSpecial(renderRows[i]!))
    opts._renderRows = bodyRows

    const rowCount = Math.min(bodyRows.length, bodyHeights.length)
    const repeatCount: number = opts._repeatHeaderCount ?? 0
    const repeatH = measured.get(el.id)?.repeatHeaderHeight
      ?? rowHeights.slice(0, repeatCount).reduce((s, h) => s + h, 0)
    const freshAvail = contentHeight - SAFETY_MARGIN

    // 边界：重复表头段高度 > 整页可用高度 → 报错
    if (repeatH > freshAvail) {
      throw new Error(
        `表格 ${el.id} 的重复表头高度 (${repeatH.toFixed(1)}mm) 超过页面可用高度 (${freshAvail.toFixed(1)}mm)，请减少重复表头行`,
      )
    }

    // 无正文行：输出空切片（汇总行整表总计仍可渲染）
    if (rowCount === 0) {
      currentPage.push({
        elementId: el.id, type: 'table-slice', startRow: 0, endRow: 0,
        summary: summaryH > 0,
        renderTop: sectionTop(el),
      })
      remaining -= summaryH
      applyFollowGroup(el, measured)
      return idx + 1
    }

    const totalH = bodyHeights.slice(0, rowCount).reduce((s, h) => s + h, 0)
    const totalNeed = totalH + subtotalH + summaryH

    // 表格分页未启用：整表单片不拆（当前页已有内容且放不下才换页，空页上允许溢出）
    if (tablePaginationOf(el)?.enabled === false) {
      if (totalNeed > remaining && currentPage.length > 0) finishPage()
      currentPage.push({
        elementId: el.id, type: 'table-slice', startRow: 0, endRow: rowCount,
        subtotal: subtotalH > 0,
        summary: summaryH > 0,
        renderTop: sectionTop(el),
      })
      remaining -= totalNeed
      applyFollowGroup(el, measured)
      return idx + 1
    }

    // ── 启用分页：按 keep-together 行组切片，每片末尾预留小计行 ──
    const groups = buildRowGroups(bodyRows, rowCount)
    let sliceStart = 0
    let firstSlice = true

    for (const g of groups) {
      const gh = bodyHeights.slice(g.start, g.end).reduce((s, h) => s + h, 0)
      // 小计行高度作为页尾预留：本组能放入本页需 gh + subtotalH
      if (gh + subtotalH <= remaining) {
        remaining -= gh
        continue
      }
      // 组放不下（连同小计）：本页已累积行收尾并附小计，本组（末行）整体滚到下一页
      if (g.start > sliceStart) {
        currentPage.push({
          elementId: el.id, type: 'table-slice', startRow: sliceStart, endRow: g.start,
          subtotal: subtotalH > 0,
          ...(!firstSlice && repeatCount > 0 ? { repeatHeader: true } : {}),
          renderTop: sectionTop(el),
        })
        firstSlice = false
        sliceStart = g.start
      }
      finishPage()
      // 首片本身包含物理表头行（行 0 起），换页时不扣 repeatH；非首片先扣重复表头段
      if (!firstSlice) remaining -= repeatH
      remaining -= gh // 组高于整页时允许溢出（可能为负）
    }

    // 收尾：剩余行
    if (sliceStart < rowCount) {
      currentPage.push({
        elementId: el.id, type: 'table-slice', startRow: sliceStart, endRow: rowCount,
        subtotal: subtotalH > 0,
        ...(!firstSlice && repeatCount > 0 ? { repeatHeader: true } : {}),
        renderTop: sectionTop(el),
      })
    }

    // 汇总行（整表总计）：紧随最后一片的小计行之后；放不下则单独移页
    if (summaryH > 0) {
      if (summaryH <= remaining) {
        const lastIdx = currentPage.length - 1
        const last = currentPage[lastIdx]
        if (last && last.type === 'table-slice' && last.elementId === el.id) {
          currentPage[lastIdx] = { ...last, summary: true }
          remaining -= summaryH
        } else {
          // 防御：最后一片非本表切片（理论不发生）→ 按单独移页处理
          finishPage()
          currentPage.push({ elementId: el.id, type: 'table-slice', startRow: rowCount, endRow: rowCount, summary: true, renderTop: 0 })
          remaining -= summaryH
        }
      } else {
        finishPage()
        currentPage.push({ elementId: el.id, type: 'table-slice', startRow: rowCount, endRow: rowCount, summary: true, renderTop: 0 })
        remaining -= summaryH
      }
    }

    applyFollowGroup(el, measured)
    return idx + 1
  }

  /**
   * 方案 A+B：处理表格下方跟随区。
   * - 放得下最后一片所在页：把该页最后一个 table-slice 升级为 flow-group（容器起点=表格设计 top）
   * - 放不下：跟随区整体移到下一页（容器起点=新页内容区顶部 0）
   */
  function applyFollowGroup(
    el: TemplateElement,
    measured: Map<string, MeasuredElement>,
  ): void {
    const members = followMap.get(el.id) ?? []
    if (members.length === 0) return

    const followH = followGroupHeight(el, members, template, measured)
    const opts = el.options ?? {}

    if (followH <= remaining) {
      // 与最后一片同页：把当前页最后一个 table-slice 升级为 flow-group
      const lastIdx = currentPage.length - 1
      const last = currentPage[lastIdx]
      if (last && last.type === 'table-slice' && last.elementId === el.id) {
        currentPage[lastIdx] = {
          ...last,
          type: 'flow-group',
          followElementIds: members,
          // 沿用该切片在本页的定位 top（续片已 stamp 为 0）
          groupTop: last.renderTop ?? opts.top ?? 0,
        }
        remaining -= followH
        return
      }
      // 防御：最后一片不在当前页（理论不发生）→ 按移页处理
    }

    // 放不下：整体移到下一页，仅渲染跟随区，容器从页顶开始
    finishPage()
    currentPage.push({
      elementId: el.id,
      type: 'flow-group',
      startRow: 0,
      endRow: 0,
      followElementIds: members,
      groupTop: 0,
    })
    remaining -= followH
  }
}

/** rowspan 覆盖行构成 keep-together 组：组内行不得拆页 */
function buildRowGroups(renderRows: any[], rowCount: number): Array<{ start: number; end: number }> {
  const groups: Array<{ start: number; end: number }> = []
  let start = 0
  let end = 1
  for (let r = 0; r < rowCount; r++) {
    for (const cell of renderRows[r]?.cells ?? []) {
      if (!cell.merged && (cell.rowspan ?? 1) > 1) end = Math.max(end, r + cell.rowspan)
    }
    if (r + 1 >= end) {
      groups.push({ start, end: r + 1 })
      start = r + 1
      end = start + 1
    }
  }
  return groups
}

/** 抽离指定类型渲染行的高度合计（按 renderRows 顺序对齐 rowHeights） */
function specialRowHeight(renderRows: any[], rowHeights: number[], type: string): number {
  let h = 0
  for (let i = 0; i < renderRows.length; i++) {
    if (renderRows[i]?.type === type) h += rowHeights[i] ?? 0
  }
  return h
}
