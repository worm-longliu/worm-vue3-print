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
function buildFollowMap(
  sorted: TemplateElement[],
  excludedIds?: Set<string>,
): Map<string, string[]> {
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
    // 显式编组成员不归属任何表格跟随区，交由组逻辑统一分页
    if (excludedIds?.has(el.id)) continue
    const top = el.options?.top ?? 0
    if (currentTableId && top >= currentTableBottom) {
      map.get(currentTableId)!.push(el.id)
    }
  }
  return map
}

/**
 * 跟随区总高度（mm）= 成员相对「表格设计底部」的并集范围 max(mTop + mHeight) − tableBottom。
 * 与 html-generator 的绝对定位渲染（WYSIWYG）一致：重叠成员不再累加两倍纵向空间，
 * 顺序非重叠成员结果与旧「间隙之和」完全相同。
 */
function followGroupHeight(
  el: TemplateElement,
  members: string[],
  template: TemplateData,
  _measuredElements: Map<string, MeasuredElement>,
): number {
  const tableBottom = tableDesignBottom(el)
  let maxBottom = tableBottom
  for (const id of members) {
    const m = template.elements.find(e => e.id === id)
    if (!m) continue
    maxBottom = Math.max(maxBottom, (m.options?.top ?? 0) + (m.options?.height ?? 0))
  }
  return Math.max(maxBottom - tableBottom, 0)
}

// ─── 分页单元（堆叠组 / 显式编组） ───

/**
 * 分页单元：一组必须同页、且纵向只按并集占用一次版面的非表格元素。
 * - 显式来源：options.groupId 相同（用户编组），强绑定；
 * - 隐式来源：纵向区间相交（堆叠/并排重叠），避免重复扣高与被拆到不同页。
 * anchorId 为主遍历序中最先遇到的成员（即 top 最小者），仅在该成员处统一分页。
 */
interface PaginationUnit {
  anchorId: string
  ids: string[]
  /** 组内含 pageable:false 元素时整组锁定首页（编组可能跨越可分页性设置） */
  forceFirstPage: boolean
}

/** 元素纵向占用：设计高度与实测高度取大（长文本溢出由实测高度兜底） */
function effectiveHeight(el: TemplateElement, measured: Map<string, MeasuredElement>): number {
  return Math.max(el.options?.height ?? 0, measured.get(el.id)?.measuredHeight ?? 0)
}

/**
 * 构建分页单元映射（elementId → 所属单元）。
 * 隐式聚类只看纵向区间是否相交：分页模型是一维纵向流，并排/重叠元素共享纵向预算；
 * 边相切（top 恰等于上一元素底边）不算重叠，保持顺序流式排布结果不变。
 */
function buildPaginationUnits(
  sorted: TemplateElement[],
  measured: Map<string, MeasuredElement>,
  groupMap: Map<string, TemplateElement[]>,
): Map<string, PaginationUnit> {
  const unitOf = new Map<string, PaginationUnit>()

  // 显式编组
  for (const members of groupMap.values()) {
    if (members.length < 2) continue
    const unit: PaginationUnit = {
      anchorId: members[0]!.id,
      ids: members.map(m => m.id),
      forceFirstPage: members.some(m => paginationOf(m)?.pageable === false),
    }
    for (const m of members) unitOf.set(m.id, unit)
  }

  // 隐式纵向重叠聚类：并查集（DSU），仅纳入可分页、非表格、未显式编组的元素
  const eligible = sorted.filter(
    el => !isTableEl(el) && !el.options?.groupId && paginationOf(el)?.pageable !== false,
  )
  const parent = new Map<string, string>()
  eligible.forEach(el => parent.set(el.id, el.id))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    // 路径压缩
    let cur = id
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  // 扫描线：仅与仍可能相交（bottom > 当前 top）的活跃元素做合并
  const active: Array<{ id: string; top: number; bottom: number }> = []
  for (const el of eligible) {
    const top = el.options?.top ?? 0
    // 淘汰底边已在当前 top 之上（含相切）的区间
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.bottom <= top) active.splice(i, 1)
    }
    const bottom = top + effectiveHeight(el, measured)
    for (const a of active) {
      if (a.bottom > top) union(el.id, a.id)
    }
    active.push({ id: el.id, top, bottom })
  }

  // 收集 size≥2 的连通簇，保持 sorted 顺序，锚点为簇内首个元素
  const clusters = new Map<string, string[]>()
  for (const el of eligible) {
    const root = find(el.id)
    const arr = clusters.get(root)
    if (arr) arr.push(el.id)
    else clusters.set(root, [el.id])
  }
  for (const ids of clusters.values()) {
    if (ids.length < 2) continue
    const unit: PaginationUnit = { anchorId: ids[0]!, ids, forceFirstPage: false }
    for (const id of ids) unitOf.set(id, unit)
  }

  return unitOf
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
  const continuous = template.paperSize === 'CONTINUOUS'
  // 连续纸：内容高视为无限，单页承载全部（实际纸高由浏览器探针 + composeContinuousHeight 推导）
  const contentHeight = continuous
    ? Number.POSITIVE_INFINITY
    : paper.height - mt - mb - headerH - footerH
  if (!continuous && contentHeight <= 0) {
    throw new Error(
      `页面可用高度不足: paper=${paper.height}mm, margins=${mt + mb}mm, header=${headerH}mm, footer=${footerH}mm`,
    )
  }

  // 元素在模板数组中的原始下标：无 zIndex 时作为层序兜底，与画布 DOM 序保持一致
  const orderIndex = new Map<string, number>()
  template.elements.forEach((e, idx) => orderIndex.set(e.id, idx))

  // 排序：top → zIndex（缺省按 0）→ 原数组序。
  // 第三键保证 top/z 相同时画布与打印的层叠关系确定一致（不依赖引擎排序稳定性）。
  const sorted = [...template.elements].sort((a, b) => {
    const topA = a.options?.top ?? 0
    const topB = b.options?.top ?? 0
    if (topA !== topB) return topA - topB
    const zA = a.options?.zIndex ?? 0
    const zB = b.options?.zIndex ?? 0
    if (zA !== zB) return zA - zB
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
  })

  // 显式编组（options.groupId）的非表格成员：强绑定，整组同页，且不降级为表格跟随区
  const explicitGroupIds = new Set<string>()
  const groupMap = new Map<string, TemplateElement[]>()
  for (const el of sorted) {
    if (isTableEl(el)) continue
    const gid = el.options?.groupId
    if (!gid) continue
    explicitGroupIds.add(el.id)
    const arr = groupMap.get(gid)
    if (arr) arr.push(el)
    else groupMap.set(gid, [el])
  }

  // 方案 A+B：表格跟随区归属（表格 id → 成员元素 id）；显式编组成员不参与跟随归属
  const followMap = buildFollowMap(sorted, explicitGroupIds)
  const followOwner = new Map<string, string>()
  for (const [tableId, members] of followMap) {
    for (const m of members) followOwner.set(m, tableId)
  }

  const elById = new Map<string, TemplateElement>()
  for (const el of sorted) elById.set(el.id, el)

  // 分页单元：显式编组 + 隐式纵向重叠聚类，成员整组同页、纵向只扣一次并集高度
  const unitOf = buildPaginationUnits(sorted, measuredElements, groupMap)

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

  /**
   * 当前页是否含「会被纸面裁掉」的内容。
   * 只按物理边界（contentHeight）判定，不看分页预算里的安全余量——安全余量只用于
   * 决定要不要换页，内容贴着纸边排仍是合法排版，不该被上层（拼版）阻断。
   */
  let overflowOnCurrent = false

  /** 收下当前页（带溢出标记） */
  function pushPage(): void {
    pages.push(
      overflowOnCurrent
        ? { pageIndex: pages.length, sections: [...currentPage], overflow: true }
        : { pageIndex: pages.length, sections: [...currentPage] },
    )
  }

  /** 记录裁切风险：内容底部越过内容区就会被纸面裁掉（上层据此阻断，如拼版） */
  function noteOverflow(bottom: number): void {
    if (bottom > contentHeight) overflowOnCurrent = true
  }

  /**
   * 结束当前页，开启新页。
   * 空页不入列：当前页尚无内容时换页没有任何意义，只会产出一张空白纸
   * （典型场景：首个元素/单元就判定放不下）。此时保持本页并沿用设计坐标，
   * 让内容按「空页允许溢出」落在本页，与表格分支同语义。
   * @param overflow 被强制留在本页的内容是否真的超出内容区（会被裁掉）
   */
  function finishPage(overflow = false): void {
    if (currentPage.length === 0) {
      overflowOnCurrent = overflowOnCurrent || overflow
      return
    }
    pushPage()
    currentPage = []
    remaining = contentHeight - SAFETY_MARGIN
    isFirstPage = false
    pageBroken = true
    overflowOnCurrent = false
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

    const unit = unitOf.get(el.id)

    // 堆叠/编组单元的非锚点成员：已在锚点处分页，跳过
    if (unit && unit.anchorId !== el.id) {
      i++
      continue
    }

    // 不参与分页的元素：始终放在第一页（含强制首页的整个编组）
    if (paginationOf(el)?.pageable === false || (unit?.forceFirstPage)) {
      if (unit) {
        for (const id of unit.ids) {
          currentPage.push({ elementId: id, type: 'element', renderTop: (elById.get(id)?.options?.top) ?? 0 })
        }
      } else {
        currentPage.push({ elementId: el.id, type: 'element', renderTop: sectionTop(el) })
      }
      // 步进交给循环顶部的「非锚点成员跳过」守卫，无需假设成员在 sorted 中连续
      i++
      continue
    }

    if (isTableEl(el)) {
      i = paginateTable(el, measuredElements, i)
    } else if (unit) {
      i = paginateUnit(unit, i)
    } else {
      i = paginateNonTable(el, measuredElements, sorted, i)
    }
  }

  // 收尾：最后一页
  if (currentPage.length > 0) {
    pushPage()
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
      const top = pageBroken ? 0 : (el.options?.top ?? 0)
      noteOverflow(top + elHeight)
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

    // 放不下，整体移到下一页（空页时不换页，仅按物理边界记录裁切风险）
    const top = pageBroken ? 0 : (el.options?.top ?? 0)
    finishPage(top + elHeight > contentHeight)
    currentPage.push({ elementId: el.id, type: 'element', renderTop: sectionTop(el) })
    remaining -= elHeight
    return idx + 1
  }

  // ─── 分页单元（堆叠组 / 显式编组）：整组同页，纵向只扣一次并集高度 ───

  function paginateUnit(unit: PaginationUnit, idx: number): number {
    const members = unit.ids
      .map(id => elById.get(id))
      .filter((m): m is TemplateElement => !!m)

    let minTop = Number.POSITIVE_INFINITY
    let maxBottom = Number.NEGATIVE_INFINITY
    for (const m of members) {
      const top = m.options?.top ?? 0
      minTop = Math.min(minTop, top)
      maxBottom = Math.max(maxBottom, top + effectiveHeight(m, measuredElements))
    }
    const unitHeight = Math.max(maxBottom - minTop, 0)

    const place = (): void => {
      // 首页（未换页）保持设计坐标；换页后整组平移到内容区顶部，组内相对偏移不变
      const offset = pageBroken ? -minTop : 0
      noteOverflow(minTop + offset + unitHeight)
      for (const m of members) {
        currentPage.push({
          elementId: m.id,
          type: 'element',
          renderTop: (m.options?.top ?? 0) + offset,
        })
      }
      remaining -= unitHeight
    }

    if (unitHeight <= remaining) {
      place()
      return idx + 1
    }

    // 放不下：整组移到下一页，绝不拆分（与单元素同为"放不下即换页"语义）
    const top = pageBroken ? 0 : minTop
    finishPage(top + unitHeight > contentHeight)
    place()
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
