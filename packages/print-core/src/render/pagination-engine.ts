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
import { getPaperDimensions, isContinuousPaper } from './types.js'
import { getRotatedAabb, resolveElementRotation } from './rotation.js'
import { resolveFlowPadding, resolveFlowLayoutMode, resolveFlowRowHeight } from './flow-list.js'
import { resolveElementBorder, type ElementBorderCss } from './element-border.js'
import { resolveElementBoxes, resolveElementMargins } from './element-margin.js'

/** 分页配置读取：options 内优先（前端序列化位置），顶层兼容旧测试/旧数据 */
function paginationOf(el: TemplateElement): { pageable?: boolean; keepWithNext?: boolean } | undefined {
  return el.options?.pagination ?? el.pagination
}

function tablePaginationOf(el: TemplateElement): { enabled?: boolean } | undefined {
  return el.options?.tablePagination ?? el.tablePagination
}

/** 分页安全余量（mm），PRD 风险缓解项 */
const SAFETY_MARGIN = 2

function isTableEl(el: FollowJudgementInput): boolean {
  return el.type === 'table' || el.printElementType?.type === 'table'
}

/** 动态模式流式列表：按行分页的可切片元素，不走普通元素的整体/堆叠分页路径 */
function isDynamicFlowListEl(el: FollowJudgementInput): boolean {
  const type = el.type || el.printElementType?.type || 'text'
  return type === 'flowList' && resolveFlowLayoutMode(el.options?.flowLayoutMode) === 'dynamic'
}

/** 可切片锚点：表格或动态 flowList，二者共用跟随区与 flow-group 规则（spec 五） */
function isSplittableEl(el: FollowJudgementInput): boolean {
  return isTableEl(el) || isDynamicFlowListEl(el)
}

/**
 * 每页重复元素判据：options.repeatOnEveryPage === true 的元素在页眉下方逐页重复，
 * 不参与显式/隐式编组和表格/动态列表跟随区（表格/动态 flowList 为整表/整列表完整重复）。
 */
function isRepeatedEl(el: FollowJudgementInput): boolean {
  return el.options?.fixed !== true && el.options?.repeatOnEveryPage === true
}

/** 固定元素：每页保留首页设计坐标，不参与正文分页结算 */
function isFixedEl(el: FollowJudgementInput): boolean {
  return el.options?.fixed === true
}

function elTypeOf(el: FollowJudgementInput): string {
  return el.type || el.printElementType?.type || 'text'
}

/** 元素的有效旋转角（与渲染端同一判据：table/flowList 排除、码类按 printerDpi 吸附直角） */
function elementRotationOf(el: TemplateElement): number | undefined {
  return resolveElementRotation(elTypeOf(el), el.options)
}

/**
 * 元素的分页结算盒：旋转元素按 AABB（占位高 = 外接盒高，shift = 设计盒顶相对外接盒顶的下沉量），
 * 未旋转退化回设计盒（shift = 0，产物逐字不变）。
 */
interface Settlement {
  height: number
  shift: number
  top: number
  rot: number | undefined
  outerTop: number
  outerBottom: number
  outerHeight: number
}

function rotatedSettlement(
  el: TemplateElement,
  measured: Map<string, MeasuredElement>,
): Settlement {
  const elHeight = measured.get(el.id)?.measuredHeight ?? el.options?.height ?? 0
  const margins = resolveElementMargins(el.options)
  const { border } = resolveElementBoxes({
    left: el.options?.left ?? 0,
    top: el.options?.top ?? 0,
    width: el.options?.width ?? 100,
    height: elHeight,
    ...el.options,
  }, elHeight)
  const rot = elementRotationOf(el)
  const box = rot === undefined ? border : getRotatedAabb(border, elHeight, rot)
  return {
    height: box.height,
    shift: border.top - box.top,
    top: box.top,
    rot,
    outerTop: box.top - margins.top,
    outerBottom: box.top + box.height + margins.bottom,
    outerHeight: Math.max(0, margins.top + box.height + margins.bottom),
  }
}

/**
 * 元素的横向结算盒（mm，设计坐标）：旋转元素取外接盒左右缘，未旋转取设计盒。
 * 表格按列宽和（与跟随区归属判据同口径，缺列宽时退回元素宽）。
 */
function horizontalExtent(
  el: TemplateElement,
  measured: Map<string, MeasuredElement>,
): { left: number; width: number } {
  const cols = el.options?.tableColWidths ?? []
  const designWidth = isTableEl(el) && cols.length > 0
    ? cols.reduce((sum: number, w: number) => sum + w, 0)
    : (el.options?.width ?? 0)
  const height = measured.get(el.id)?.measuredHeight ?? el.options?.height ?? 0
  const { border } = resolveElementBoxes({
    ...el.options,
    left: el.options?.left ?? 0,
    top: el.options?.top ?? 0,
    width: designWidth,
    height,
  }, height)
  const rot = elementRotationOf(el)
  if (rot === undefined) return { left: border.left, width: border.width }
  const aabb = getRotatedAabb(border, height, rot)
  return { left: aabb.left, width: aabb.width }
}

/**
 * 表格设计底部（mm）= 设计 top + 设计高度。
 * 设计高度取 max(options.height, tableRows 行高之和)：
 * - options.height 是设计器实测回写的渲染高度（用户在画布上所见并据此对齐下方元素的底部），
 *   为相对布局偏移的忠实基准；
 * - tableRows 行高之和是 min-height 语义下表格实际渲染的物理下界，
 *   当 options.height 缺失或被低估时兜底，避免跟随元素偏移算成负值反向叠压表格。
 */
export function tableDesignBottom(el: FollowJudgementInput): number {
  const opts = el.options ?? {}
  const top = opts.top ?? 0
  const rows: Array<{ height?: number }> = opts.tableRows ?? []
  const rowSum = rows.reduce((s, r) => s + (r.height ?? 0), 0)
  const designHeight = Math.max(opts.height ?? 0, rowSum)
  return top + resolveElementMargins(opts).top + designHeight
}

/**
 * 可切片锚点的设计底部（mm）：表格走 tableDesignBottom 原算法；
 * 动态 flowList 无 tableRows 可推，只有画布实测回写的设计高度（options.height 自愈值），
 * 没有可靠实测值时以该配置高度兜底。
 */
export function splittableDesignBottom(el: FollowJudgementInput): number {
  if (isDynamicFlowListEl(el)) {
    const opts = el.options ?? {}
    return (opts.top ?? 0) + resolveElementMargins(opts).top + Math.max(opts.height ?? 0, 0)
  }
  return tableDesignBottom(el)
}

/**
 * 跟随区归属判据所需的最小元素信息：内部只读这些字段。
 * 对外入口按 `E extends { id: string }` 收，core 的 TemplateElement、canvas 的 PrintElementData、
 * 宿主运行时的 RuntimeElement 都能直接传入，宿主侧不需要任何断言。
 */
export interface FollowJudgementInput {
  id: string
  type?: string
  options?: Record<string, any>
  printElementType?: { type: string }
}

/** 画布层序比较：top → zIndex（缺省按 0）→ 原数组序（第三键保证层叠关系确定一致） */
function compareCanvasOrder(orderIndex: Map<string, number>) {
  return (a: FollowJudgementInput, b: FollowJudgementInput): number => {
    const topA = a.options?.top ?? 0
    const topB = b.options?.top ?? 0
    if (topA !== topB) return topA - topB
    const zA = a.options?.zIndex ?? 0
    const zB = b.options?.zIndex ?? 0
    if (zA !== zB) return zA - zB
    return (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
  }
}

/**
 * 跟随区成员 id 集合（spec 契约四）：这类元素 v1 **忽略元素级旋转**——渲染不转、属性台不出输入框。
 * 判据与分页内部完全同源（同一条排序、同一个 buildFollowMap），供 canvas / print-common 直接调用，
 * 禁止宿主各自另抄「表格下方且横向相交」规则，否则设计器与出纸会再次分叉。
 */
export function collectFollowMemberIds<E extends { id?: string }>(
  elements: readonly E[],
): Set<string> {
  // 设计器侧 TemplateData 允许元素无 id（尚未落库的草稿），这类元素不参与归属判定
  const inputs = elements
    .filter((e): e is E & { id: string } => typeof e.id === 'string')
    .map(e => e as unknown as FollowJudgementInput)
  // fixed 元素不参与显式编组和跟随区，先排除再计算，与 paginate 的 flowSorted 同口径
  const flowInputs = inputs.filter(el => !isRepeatedEl(el) && !isFixedEl(el))
  const orderIndex = new Map<string, number>()
  flowInputs.forEach((e, idx) => orderIndex.set(e.id, idx))
  const sorted = [...flowInputs].sort(compareCanvasOrder(orderIndex))
  // 显式编组成员不参与跟随归属（整组同页优先），与 paginate 同口径
  const explicitGroupIds = new Set<string>()
  for (const el of sorted) {
    if (isSplittableEl(el)) continue
    if (el.options?.groupId) explicitGroupIds.add(el.id)
  }
  const ids = new Set<string>()
  for (const members of buildFollowMap(sorted, explicitGroupIds).values()) {
    for (const m of members) ids.add(m)
  }
  return ids
}

/**
 * 构建「可切片锚点（表格 / 动态 flowList）→ 跟随区成员」映射。
 * 规则：按 Y 排序遍历，每个非锚点元素归入「它上方最近的可切片锚点」，
 * 且仅当元素设计 top ≥ 该锚点设计底部（设计上位于锚点下方）。
 */
function buildFollowMap(
  sorted: FollowJudgementInput[],
  excludedIds?: Set<string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>()
  let currentAnchorId: string | null = null
  let currentAnchorBottom = -1
  let currentAnchorLeft = 0
  let currentAnchorRight = 0
  for (const el of sorted) {
    if (isSplittableEl(el)) {
      currentAnchorId = el.id
      currentAnchorBottom = splittableDesignBottom(el) + resolveElementMargins(el.options).bottom
      // 锚点横向区间：表格取列宽和（与实际表宽同口径，缺列宽时退回元素宽，T-11 C2）；列表取元素宽
      const cols = el.options?.tableColWidths ?? []
      const width = cols.length > 0 ? cols.reduce((sum: number, w: number) => sum + w, 0) : (el.options?.width ?? 0)
      const anchorBox = resolveElementBoxes({ ...el.options, width }).margin
      currentAnchorLeft = anchorBox.left
      currentAnchorRight = anchorBox.right
      map.set(el.id, [])
      continue
    }
    // 显式编组成员不归属任何锚点跟随区，交由组逻辑统一分页
    if (excludedIds?.has(el.id)) continue
    if (!currentAnchorId) continue
    const top = el.options?.top ?? 0
    if (top < currentAnchorBottom) continue
    // 与锚点横向零交集的元素保持原地绝对定位：它既不在锚点列上，也不该随锚点底部漂移（T-11 C2）
    const memberBox = resolveElementBoxes({ width: 0, ...el.options }).margin
    if (memberBox.right <= currentAnchorLeft || memberBox.left >= currentAnchorRight) continue
    map.get(currentAnchorId)!.push(el.id)
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
  const anchorBottom = splittableDesignBottom(el) + resolveElementMargins(el.options).bottom
  let maxBottom = anchorBottom
  for (const id of members) {
    const m = template.elements.find(e => e.id === id)
    if (!m) continue
    maxBottom = Math.max(maxBottom, resolveElementBoxes({ width: 0, ...m.options }).margin.bottom)
  }
  return Math.max(maxBottom - anchorBottom, 0)
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
  /** 组内成员横向占用并集（mm）：纵向预算按列记账的依据 */
  band: [number, number]
}

/** 元素纵向占用：设计高度与实测高度取大（长文本溢出由实测高度兜底） */
function effectiveHeight(el: TemplateElement, measured: Map<string, MeasuredElement>): number {
  return Math.max(el.options?.height ?? 0, measured.get(el.id)?.measuredHeight ?? 0)
}

/** 1pt = 25.4/72 mm，线类 borderWidth 单位是 pt */
const PT_TO_MM = 25.4 / 72

/**
 * 元素横向占用区间（mm）：[left, left + width]。
 * 缺省宽度取 100，与渲染端 `opts.width ?? 100` 同口径，避免记账比实际出纸窄。
 *
 * vline 特殊处理：实际渲染为 width:0 + border-left，视觉横向占用 = borderWidth（pt → mm），
 * 而非画布编辑盒的 options.width——否则与横向不相交的表格会被误判为同列、挤占版面（Gitee #IKQSRG）。
 */
function geometryInput(el: TemplateElement): Record<string, unknown> {
  const o = el.options ?? {}
  const type = el.type || el.printElementType?.type || 'text'
  if (type !== 'vline') return { width: 100, ...o }
  const borderWidthPt = o.borderWidth ?? 0.75
  const halfW = (borderWidthPt * PT_TO_MM) / 2 + 0.05
  return { ...o, left: (o.left ?? 0) - halfW, width: halfW * 2 }
}

function marginXRange(el: TemplateElement): [number, number] {
  const box = resolveElementBoxes(geometryInput(el)).margin
  return [box.left, box.right]
}

function borderXRange(el: TemplateElement): [number, number] {
  const box = resolveElementBoxes(geometryInput(el)).border
  return [box.left, box.right]
}

/** 横向区间是否相交（边相切不算，与纵向簇口径一致） */
function xIntersects(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1]
}

/** 两个横向区间的并集范围 */
function xUnion(a: [number, number], b: [number, number]): [number, number] {
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])]
}

/**
 * 构建分页单元映射（elementId → 所属单元）。
 * 隐式聚类要求横向与纵向区间同时相交：互不相交的元素在纸面上各占一列，
 * 不必整组同页，也不该互相占用纵向版面（Gitee #IKOUJI）。
 * 边相切（top 恰等于上一元素底边、或 x 恰相接）不算重叠，保持顺序流式排布结果不变。
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
      band: members.map(marginXRange).reduce(xUnion),
    }
    for (const m of members) unitOf.set(m.id, unit)
  }

  // 隐式纵向重叠聚类：并查集（DSU），仅纳入可分页、非表格、未显式编组的元素。
  // 动态流式列表按行切片，不参与整组同页的堆叠聚类，避免同一高度被两处重复记账。
  const eligible = sorted.filter(
    el => !isTableEl(el) && !isDynamicFlowListEl(el) && !el.options?.groupId
      && paginationOf(el)?.pageable !== false,
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

  // 扫描线：仅与仍可能相交（bottom > 当前 top）且横向相交的活跃元素做合并
  const active: Array<{ id: string; top: number; bottom: number; x: [number, number] }> = []
  const borderBox = (el: TemplateElement) => resolveElementBoxes({
    width: 100,
    ...el.options,
    height: effectiveHeight(el, measured),
  }, effectiveHeight(el, measured)).border
  const borderOrdered = [...eligible].sort((a, b) => borderBox(a).top - borderBox(b).top)
  for (const el of borderOrdered) {
    const box = borderBox(el)
    const top = box.top
    // 淘汰底边已在当前 top 之上（含相切）的区间
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.bottom <= top) active.splice(i, 1)
    }
    const bottom = box.bottom
    const x = borderXRange(el)
    for (const a of active) {
      if (a.bottom > top && xIntersects(a.x, x)) union(el.id, a.id)
    }
    active.push({ id: el.id, top, bottom, x })
  }

  // 收集 size≥2 的连通簇，保持 sorted 顺序，锚点为簇内首个元素
  const eligibleById = new Map(eligible.map(e => [e.id, e] as const))
  const clusters = new Map<string, string[]>()
  for (const el of eligible) {
    const root = find(el.id)
    const arr = clusters.get(root)
    if (arr) arr.push(el.id)
    else clusters.set(root, [el.id])
  }
  for (const ids of clusters.values()) {
    if (ids.length < 2) continue
    const unit: PaginationUnit = {
      anchorId: ids[0]!,
      ids,
      forceFirstPage: false,
      band: ids.map(id => marginXRange(eligibleById.get(id)!)).reduce(xUnion),
    }
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
 * 4. 处理 keepWithNext、单行超高、表格跟随等边界
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

  // PRD 4.3: contentHeight = paperHeight - marginTop - marginBottom - headerHeight - footerHeight
  const continuous = isContinuousPaper(template)
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

  // 排序：top → zIndex（缺省按 0）→ 原数组序，与 collectFollowMemberIds 共用同一比较器
  const sorted = [...template.elements].sort(compareCanvasOrder(orderIndex))

  // 每页重复元素分流：首页正文保持设计布局，续页正文从页眉下方的重复区之后起排
  const repeatedSorted = sorted.filter(isRepeatedEl)
  const fixedSorted = sorted.filter(isFixedEl)
  const flowSorted = sorted.filter(el => !isRepeatedEl(el) && !isFixedEl(el))
  const repeatExtent = repeatedSorted.reduce((extent, el) => {
    const settle = rotatedSettlement(el, measuredElements)
    return {
      minTop: Math.min(extent.minTop, settle.outerTop),
      maxBottom: Math.max(extent.maxBottom, settle.outerBottom),
    }
  }, { minTop: Number.POSITIVE_INFINITY, maxBottom: Number.NEGATIVE_INFINITY })
  const hasRepeatArea = !continuous && repeatedSorted.length > 0
  const repeatStart = hasRepeatArea ? repeatExtent.minTop : 0
  const repeatBottom = hasRepeatArea ? Math.max(0, repeatExtent.maxBottom - repeatStart) : 0

  // 显式编组（options.groupId）的非表格成员：强绑定，整组同页，且不降级为表格跟随区
  const explicitGroupIds = new Set<string>()
  const groupMap = new Map<string, TemplateElement[]>()
  for (const el of flowSorted) {
    if (isSplittableEl(el)) continue
    const gid = el.options?.groupId
    if (!gid) continue
    explicitGroupIds.add(el.id)
    const arr = groupMap.get(gid)
    if (arr) arr.push(el)
    else groupMap.set(gid, [el])
  }

  // 方案 A+B：跟随区归属（锚点 id → 成员元素 id）；显式编组成员与 fixed 元素不参与跟随归属
  const followMap = buildFollowMap(flowSorted, explicitGroupIds)
  const followOwner = new Map<string, string>()
  for (const [anchorId, members] of followMap) {
    for (const m of members) followOwner.set(m, anchorId)
  }
  // 已实际被 flow-group 承接的成员：仅这类成员才由主遍历跳过——
  // 空数据锚点不产跟随区，其成员必须回退普通元素路径，避免整段内容丢失
  const groupedFollowers = new Set<string>()
  const markGrouped = (members: string[]): void => {
    for (const m of members) groupedFollowers.add(m)
  }

  const elById = new Map<string, TemplateElement>()
  for (const el of sorted) elById.set(el.id, el)

  // 分页单元：显式编组 + 隐式纵向重叠聚类，成员整组同页、纵向只扣一次并集高度
  const unitOf = buildPaginationUnits(flowSorted, measuredElements, groupMap)

  const pages: PageLayout[] = []
  let currentPage: PageSection[] = []
  /**
   * 本页已占版面（mm）：二维占用预算的记账单位。
   * 换页判定看「该元素横向所在列已占的高度合计」，不再把整页所有元素的高度累加——
   * 横向互不相交的元素各占一列，不互相挤纵向版面（Gitee #IKOUJI 主因）。
   * 同列内仍沿用既有口径：按内容高度合计扣减（设计坐标间隙不计入，
   * 底边越过纸面时留本页并标 overflow，由上层阻断，此契约不变）。
   */
  let occupied: Array<{ x0: number; x1: number; height: number }> = []
  // 是否已发生换页：首页保留正文相对设计坐标，续页按本列已占高度流式排布
  let pageBroken = false

  /** 当前页完整可用高度：首页保持原预算，续页再扣除重复区；页眉/页脚已进入 contentHeight */
  function fullPageHeight(): number {
    return contentHeight - SAFETY_MARGIN - (pageBroken ? repeatBottom : 0)
  }

  /** 某横向区间在本列已占的高度合计（mm）；横向相切不算同列 */
  function depthIn(x: [number, number]): number {
    let used = 0
    for (const r of occupied) {
      if (xIntersects(x, [r.x0, r.x1])) used += r.height
    }
    return Math.max(0, used)
  }

  /** 某横向区间的剩余可用高度（mm） */
  function remainingIn(x: [number, number]): number {
    return fullPageHeight() - depthIn(x)
  }

  /** 记下一块本列已占版面 */
  function occupy(x: [number, number], height: number): void {
    occupied.push({ x0: x[0], x1: x[1], height })
  }

  /** 本节定位 top：首页使用设计坐标，续页从重复区下方的本列光标起排 */
  function sectionTop(el: TemplateElement, x: [number, number] = marginXRange(el)): number {
    return pageBroken ? pageCursorTop(x) : (el.options?.top ?? 0)
  }

  /**
   * 换页后的流式光标：重复区域底边 + 本列已占内容高度。
   * 修复：此前一律用全页累加的光标，与自身横向不相交的元素会被别列高度推走，
   * 且表格切片之后的元素/编组会叠压在表格上。
   */
  function pageCursorTop(x: [number, number]): number {
    return (pageBroken ? repeatBottom : 0) + depthIn(x)
  }

  /**
   * 当前页是否含「会被纸面裁掉」的内容。
   * 只按物理边界（contentHeight）判定，不看分页预算里的安全余量——安全余量只用于
   * 决定要不要换页，内容贴着纸边排仍是合法排版，不该被上层（拼版）阻断。
   */
  let overflowOnCurrent = false

  /** 本页累积的旋转顶越界警告（页首裁切是分页引擎修不了的问题，只能提示作者调整） */
  let pendingWarnings: string[] = []

  /** 旋转元素外接盒顶越过页首时记一条专条警告（amount 为被裁掉的 mm 数） */
  function noteTopWarning(el: TemplateElement, rot: number, amount: number): void {
    if (amount <= 0) return
    pendingWarnings.push(
      `元素 ${el.id} 旋转 ${rot}° 后顶部超出页首 ${Math.round(amount * 100) / 100}mm，打印将被裁切`,
    )
  }

  /** 收下当前页（带溢出标记） */
  function pushPage(): void {
    pages.push(
      overflowOnCurrent || pendingWarnings.length > 0
        ? {
            pageIndex: pages.length,
            sections: [...currentPage],
            ...(overflowOnCurrent ? { overflow: true } : {}),
            ...(pendingWarnings.length > 0 ? { warnings: [...pendingWarnings] } : {}),
          }
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
    occupied = []
    pageBroken = true
    overflowOnCurrent = false
    pendingWarnings = []
  }

  // ── 遍历元素 ──
  let i = 0
  while (i < flowSorted.length) {
    const el = flowSorted[i]

    // 跟随区成员已由所属锚点的 flow-group 处理，跳过
    if (followOwner.has(el.id) && groupedFollowers.has(el.id)) {
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
      const firstPage = pages[0]
      const firstPageSections = firstPage?.sections ?? currentPage
      const noteFirstPageTopWarning = (target: TemplateElement, rot: number, amount: number): void => {
        if (!firstPage) {
          noteTopWarning(target, rot, amount)
        } else if (amount > 0) {
          firstPage.warnings = [...(firstPage.warnings ?? []),
            `元素 ${target.id} 旋转 ${rot}° 后顶部超出页首 ${Math.round(amount * 100) / 100}mm，打印将被裁切`]
        }
      }
      if (unit) {
        // 固定首页的编组同样可能含旋转成员：设计坐标落位，外接盒顶越界记警告
        let minTop = Number.POSITIVE_INFINITY
        let rotated: { el: TemplateElement; rot: number } | undefined
        for (const id of unit.ids) {
          const m = elById.get(id)
          if (!m) continue
          const s = rotatedSettlement(m, measuredElements)
          minTop = Math.min(minTop, s.top)
          if (s.rot !== undefined) rotated = { el: m, rot: s.rot }
        }
        if (rotated) noteFirstPageTopWarning(rotated.el, rotated.rot, -minTop)
        for (const id of unit.ids) {
          firstPageSections.push({ elementId: id, type: 'element', renderTop: (elById.get(id)?.options?.top) ?? 0 })
        }
      } else {
        const s = rotatedSettlement(el, measuredElements)
        if (s.rot !== undefined) noteFirstPageTopWarning(el, s.rot, -s.top)
        firstPageSections.push({ elementId: el.id, type: 'element', renderTop: el.options?.top ?? 0 })
      }
      // 步进交给循环顶部的「非锚点成员跳过」守卫，无需假设成员在 sorted 中连续
      i++
      continue
    }

    if (isTableEl(el)) {
      i = paginateTable(el, measuredElements, i)
    } else if (isDynamicFlowListEl(el)) {
      i = paginateFlowList(el, measuredElements, i)
    } else if (unit) {
      i = paginateUnit(unit, i)
    } else {
      i = paginateNonTable(el, measuredElements, flowSorted, i)
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

  // 重复/固定元素合入每页：均不调用 occupy()；仅每页重复在续页归一并预留区域
  // 排序按完整 sorted 的层序（top → zIndex → 模板数组序）稳定合入，物理越界只告警不换页
  const sectionRank = new Map(sorted.map((el, index) => [el.id, index]))
  for (const page of pages) {
    // 首页保留设计位置；续页将整组重复元素归一到页眉下方，组内相对间距不变
    const repeatOffset = page.pageIndex > 0 ? -repeatStart : 0
    const repeated = repeatedSorted.map(el => ({
      elementId: el.id,
      type: 'element' as const,
      renderTop: (el.options?.top ?? 0) + repeatOffset,
    }))
    const fixed = fixedSorted.map(el => ({
      elementId: el.id,
      type: 'element' as const,
      renderTop: el.options?.top ?? 0,
    }))
    page.sections = [...page.sections, ...repeated, ...fixed].sort((a, b) =>
      (sectionRank.get(a.elementId) ?? Number.MAX_SAFE_INTEGER)
      - (sectionRank.get(b.elementId) ?? Number.MAX_SAFE_INTEGER))

    // 重复/固定元素物理告警：连续纸内容高无限，不会触发。
    for (const el of [...repeatedSorted, ...fixedSorted]) {
      const settle = rotatedSettlement(el, measuredElements)
      const offset = isRepeatedEl(el) ? repeatOffset : 0
      if (settle.outerBottom + offset > contentHeight) page.overflow = true
      if (settle.rot !== undefined && settle.top + offset < 0) {
        const amount = Math.round(-(settle.top + offset) * 100) / 100
        page.warnings = [...(page.warnings ?? []),
          `元素 ${el.id} 旋转 ${settle.rot}° 后顶部超出页首 ${amount}mm，打印将被裁切`]
      }
    }
  }

  noteHorizontalOverflow()

  return pages

  /**
   * 横向越界告警：分页历来只按纵向记账，元素（含旋转外接盒）超出纸面左右缘时，
   * 出纸被 `.print-page{overflow:hidden}` 裁掉，既不标 overflow 也不出提示。
   * 元素相对纸面的横向起点 = 左边距 + 设计 left（与出纸 CSS 的流内位置同口径）。
   * 只加提示，不改 sections 与 overflow 语义；跟随区成员按容器相对定位，v1 不纳入。
   */
  function noteHorizontalOverflow(): void {
    if (continuous) return
    const ml = template.margins.left
    for (const page of pages) {
      const hits: string[] = []
      for (const section of page.sections) {
        if (section.type === 'flow-group') continue
        const el = elById.get(section.elementId)
        if (!el) continue
        const { left, width } = horizontalExtent(el, measuredElements)
        const xLeft = ml + left
        const rightOver = xLeft + width - paper.width
        const leftOver = -xLeft
        if (rightOver > 0.01) {
          hits.push(`元素 ${el.id} 超出纸面右侧 ${Math.round(rightOver * 100) / 100}mm，打印将被裁切`)
        } else if (leftOver > 0.01) {
          hits.push(`元素 ${el.id} 超出纸面左侧 ${Math.round(leftOver * 100) / 100}mm，打印将被裁切`)
        }
      }
      if (hits.length > 0) page.warnings = [...(page.warnings ?? []), ...hits]
    }
  }

  // ─── 非表格元素分页（PRD 4.4 非表格分支） ───

  function paginateNonTable(
    el: TemplateElement,
    measured: Map<string, MeasuredElement>,
    sortedList: TemplateElement[],
    idx: number,
  ): number {
    const x = marginXRange(el)
    // 旋转元素按 AABB 结算：占位高与底边都以旋转后外接盒计（未旋转退化回设计盒）
    const settle = rotatedSettlement(el, measured)
    const elHeight = settle.outerHeight

    /** 以本列光标（未换页时为设计 top）落位并记账。
     *  首页保持设计坐标（WYSIWYG）；换页后 renderTop = 游标 + shift，使外接盒顶（而非设计盒顶）贴列游标。
     *  settle.top/height 均为设计坐标：页内坐标 = settle.top + (renderTop − 设计 top) 的整体平移 */
    const place = (): void => {
      const designTop = sectionTop(el, x)
      const renderTop = pageBroken ? designTop + settle.shift : designTop
      const delta = renderTop - (el.options?.top ?? 0)
      noteOverflow(settle.outerBottom + delta)
      if (settle.rot !== undefined && !pageBroken) {
        noteTopWarning(el, settle.rot, -settle.top)
      }
      currentPage.push({ elementId: el.id, type: 'element', renderTop })
      occupy(x, elHeight)
    }

    if (elHeight <= remainingIn(x)) {
      // 放得下
      place()

      // keepWithNext 处理
      if (paginationOf(el)?.keepWithNext && idx + 1 < sortedList.length) {
        const nextEl = sortedList[idx + 1]
        const nextHeight = rotatedSettlement(nextEl, measured).outerHeight

        // keepWithNext 降级：组合总高度超过页面可用高度时失效
        if (elHeight + nextHeight > fullPageHeight()) {
          return idx + 1
        }

        if (nextHeight > remainingIn(x)) {
          // 下一元素放不下，当前元素也移到新页（保持一组）
          currentPage.pop()
          occupied.pop()
          finishPage()
          place()
        }
      }

      return idx + 1
    }

    // 放不下，整体移到下一页（空页时不换页，仅按物理边界记录裁切风险）
    finishPage()
    place()
    return idx + 1
  }

  // ─── 分页单元（堆叠组 / 显式编组）：整组同页，纵向只扣一次并集高度 ───

  function paginateUnit(unit: PaginationUnit, idx: number): number {
    const members = unit.ids
      .map(id => elById.get(id))
      .filter((m): m is TemplateElement => !!m)

    // 组范围按成员结算盒的并集：旋转成员取外接盒（top/height），未旋转退化回设计盒
    let minTop = Number.POSITIVE_INFINITY
    let maxBottom = Number.NEGATIVE_INFINITY
    let rotatedAnchor: { el: TemplateElement; rot: number } | undefined
    for (const m of members) {
      const s = rotatedSettlement(m, measuredElements)
      minTop = Math.min(minTop, s.outerTop)
      maxBottom = Math.max(maxBottom, s.outerBottom)
      if (s.rot !== undefined) rotatedAnchor = { el: m, rot: s.rot }
    }
    const unitHeight = Math.max(maxBottom - minTop, 0)
    const band = unit.band

    const place = (): void => {
      // 首页整组保持设计坐标；续页组顶贴重复区下方的本列光标，组内相对偏移不变
      const offset = pageBroken ? pageCursorTop(band) - minTop : 0
      noteOverflow(minTop + offset + unitHeight)
      if (rotatedAnchor && !pageBroken) {
        noteTopWarning(rotatedAnchor.el, rotatedAnchor.rot, -minTop)
      }
      for (const m of members) {
        currentPage.push({
          elementId: m.id,
          type: 'element',
          renderTop: (m.options?.top ?? 0) + offset,
        })
      }
      occupy(band, unitHeight)
    }

    if (unitHeight <= remainingIn(band)) {
      place()
      return idx + 1
    }

    // 放不下：整组移到下一页，绝不拆分（与单元素同为"放不下即换页"语义）
    const top = pageCursorTop(band) + (pageBroken ? 0 : minTop)
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
    const freshAvail = fullPageHeight()
    const elementMargins = resolveElementMargins(opts)
    const elementChrome = elementMargins.top + elementMargins.bottom
    // 表格自身横向占用列：本片及后续内容都按该列记账
    const tb = marginXRange(el)

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
        renderTop: sectionTop(el, tb),
      })
      occupy(tb, Math.max(0, summaryH + elementChrome))
      applyFollowGroup(el, measured, tb)
      return idx + 1
    }

    const totalH = bodyHeights.slice(0, rowCount).reduce((s, h) => s + h, 0)
    const totalNeed = Math.max(0, totalH + subtotalH + summaryH + elementChrome)

    // 表格分页未启用：整表单片不拆（当前页已有内容且放不下才换页，空页上允许溢出）
    if (tablePaginationOf(el)?.enabled === false) {
      if (totalNeed > remainingIn(tb) && currentPage.length > 0) finishPage()
      currentPage.push({
        elementId: el.id, type: 'table-slice', startRow: 0, endRow: rowCount,
        subtotal: subtotalH > 0,
        summary: summaryH > 0,
        renderTop: sectionTop(el, tb),
      })
      occupy(tb, totalNeed)
      applyFollowGroup(el, measured, tb)
      return idx + 1
    }

    // ── 启用分页：按 keep-together 行组切片，每片末尾预留小计行 ──
    const groups = buildRowGroups(bodyRows, rowCount)
    let sliceStart = 0
    let firstSlice = true
    // 片起点须在行组记账前捕获（循环内 sliceUsed 会被本片自己的行组推进）
    let sliceTop = sectionTop(el, tb)
    // 本片在本列内已消耗的行高合计；换页后归零，重新取本列剩余
    let sliceUsed = elementChrome
    const avail = () => remainingIn(tb) - sliceUsed

    /** 收下当前片，并把本片消耗记入本列版面 */
    const pushSlice = (endRow: number, repeatHeader: boolean): void => {
      currentPage.push({
        elementId: el.id, type: 'table-slice', startRow: sliceStart, endRow,
        subtotal: subtotalH > 0,
        ...(!firstSlice && repeatHeader ? { repeatHeader: true } : {}),
        renderTop: sliceTop,
      })
      occupy(tb, Math.max(0, sliceUsed))
      // 本片消耗已入账，剩余改由本列记账给出（避免 avail() 重复扣同一段行高）
      sliceUsed = 0
    }

    for (const g of groups) {
      const gh = bodyHeights.slice(g.start, g.end).reduce((s, h) => s + h, 0)
      // 小计行高度作为页尾预留：本组能放入本页需 gh + subtotalH
      if (gh + subtotalH <= avail()) {
        sliceUsed += gh
        continue
      }
      // 组放不下（连同小计）：本页已累积行收尾并附小计，本组（末行）整体滚到下一页
      if (g.start > sliceStart) {
        pushSlice(g.start, repeatCount > 0)
        firstSlice = false
        sliceStart = g.start
      }
      finishPage()
      sliceTop = sectionTop(el, tb)
      sliceUsed = elementChrome
      // 首片本身包含物理表头行（行 0 起），换页时不扣 repeatH；非首片先扣重复表头段
      if (!firstSlice) sliceUsed += repeatH
      sliceUsed += gh // 组高于整页时允许溢出（剩余可能为负）
    }

    // 收尾：剩余行
    if (sliceStart < rowCount) {
      pushSlice(rowCount, repeatCount > 0)
    }

    // 汇总行（整表总计）：紧随最后一片的小计行之后；放不下则单独移页
    if (summaryH > 0) {
      if (summaryH <= avail()) {
        const lastIdx = currentPage.length - 1
        const last = currentPage[lastIdx]
        if (last && last.type === 'table-slice' && last.elementId === el.id) {
          currentPage[lastIdx] = { ...last, summary: true }
          occupy(tb, summaryH)
        } else {
          // 防御：最后一片非本表切片（理论不发生）→ 按单独移页处理
          finishPage()
          currentPage.push({ elementId: el.id, type: 'table-slice', startRow: rowCount, endRow: rowCount, summary: true, renderTop: sectionTop(el, tb) })
          occupy(tb, Math.max(0, summaryH + elementChrome))
        }
      } else {
        finishPage()
        currentPage.push({ elementId: el.id, type: 'table-slice', startRow: rowCount, endRow: rowCount, summary: true, renderTop: sectionTop(el, tb) })
        occupy(tb, Math.max(0, summaryH + elementChrome))
      }
    }

    applyFollowGroup(el, measured, tb)
    return idx + 1
  }

  // ─── 动态流式列表分页（按排布行切片；不处理表头、小计或汇总） ───

  function paginateFlowList(
    el: TemplateElement,
    measured: Map<string, MeasuredElement>,
    idx: number,
  ): number {
    const opts = el.options ?? {}
    const rowHeights = measured.get(el.id)?.measuredFlowRowHeights ?? []
    const rows: any[] = Array.isArray(opts._flowRows) ? opts._flowRows : []
    const rowCount = rows.length
    const fallbackRowHeight = resolveFlowRowHeight(opts.flowRowHeight)
    // 空行区间：不输出空切片，也不为空列表产出空页
    if (rowCount === 0) return idx + 1

    // 本片纵向开销（mm）＝上下内边距 + 上下边框：pt 按 25.4/72 换算、上下分边分别计
    const padding = resolveFlowPadding(opts)
    const borders = resolveElementBorder(elTypeOf(el), opts)
    const sideMm = (css?: ElementBorderCss): number => {
      if (!css) return 0
      const pt = Number.parseFloat(css.borderWidth)
      return Number.isFinite(pt) ? pt * PT_TO_MM : 0
    }
    const borderMm = (side: 'top' | 'bottom'): number => {
      const edge = borders?.edges?.[side]
      if (edge) return sideMm(edge)
      return sideMm(borders?.all ?? undefined)
    }
    const margins = resolveElementMargins(opts)
    const chromeVertical = margins.top + margins.bottom + padding.top + padding.bottom + borderMm('top') + borderMm('bottom')

    const tb = marginXRange(el)
    let sliceStart = 0
    let sliceTop = sectionTop(el, tb)
    // 首页扣正文设计 top，重复区不占首页预算；
    // 换页后片顶落重复区域下方的列光标，先前占深由 remainingIn 扣除
    let sliceDebit = pageBroken ? 0 : sliceTop
    // 本片行高合计（不含内边距与边框）
    let sliceRows = 0
    const avail = (): number => {
      const base = pageBroken ? remainingIn(tb) : fullPageHeight() - sliceDebit
      return base - sliceRows - chromeVertical
    }

    /** 收下当前片：半开区间 [sliceStart, endRow)；行高、内边距、边框只对本片记账一次 */
    const pushFlowSlice = (endRow: number): void => {
      currentPage.push({
        elementId: el.id,
        type: 'flow-list-slice',
        startFlowRow: sliceStart,
        endFlowRow: endRow,
        renderTop: sliceTop,
      })
      // 首页按原设计顶距记账；续页 sliceTop 已含重复区与本列占深。
      const depthBefore = pageBroken ? sliceTop : depthIn(tb)
      const sliceBottom = sliceTop + chromeVertical + sliceRows
      occupy(tb, Math.max(0, sliceBottom - depthBefore))
      sliceRows = 0
    }

    let r = 0
    while (r < rowCount) {
      // 自定义测量链路缺行时按配置最小行高兜底，不能按短数组截断并静默丢数据
      const rowHeight = rowHeights[r] ?? fallbackRowHeight
      if (rowHeight <= avail()) {
        sliceRows += rowHeight
        r++
        continue
      }
      // 页面全新预算也放不下这一行：先收下已有前片；当前页还有其他内容时先换页，
      // 再把超高行单独留在空页并记 overflow，不把前片一并拖成溢出。
      if (rowHeight + chromeVertical > fullPageHeight()) {
        if (r > sliceStart) {
          pushFlowSlice(r)
          sliceStart = r
        }
        if (currentPage.length > 0) finishPage()
        sliceTop = sectionTop(el, tb)
        sliceDebit = pageBroken ? 0 : sliceTop
        sliceRows = rowHeight
        noteOverflow(sliceTop + chromeVertical + sliceRows)
        r++
        continue
      }
      // 当前页为空且无可收片时换页只会产出空白纸：按 overflow 口径留在原页
      if (currentPage.length === 0 && sliceRows === 0 && !pageBroken) {
        sliceRows += rowHeight
        noteOverflow(sliceTop + chromeVertical + sliceRows)
        r++
        continue
      }
      // 已积累的行先收片 → 换页 → 新片从重复区域下方排布，重试当前行
      if (r > sliceStart) {
        pushFlowSlice(r)
        sliceStart = r
      }
      finishPage()
      sliceTop = sectionTop(el, tb)
      sliceDebit = pageBroken ? 0 : sliceTop
    }
    if (sliceStart < rowCount) {
      pushFlowSlice(rowCount)
    }
    // 跟随区只接在最后一个切片之后（复用表格规则：同页升级 flow-group / 整体移页）
    applyFollowGroup(el, measured, tb)
    return idx + 1
  }

  /**
   * 方案 A+B：处理可切片锚点（表格 / 动态 flowList）下方跟随区。
   * - 放得下最后一片所在页：把该页最后一个切片升级为 flow-group（容器起点=锚点片首 renderTop）
   * - 放不下：跟随区整体移到下一页（容器起点=新页重复区域下方），动态组行区间归零只渲染跟随区
   * @param band 锚点横向占用列：跟随区与锚点同列，只按本列剩余判定
   */
  function applyFollowGroup(
    el: TemplateElement,
    measured: Map<string, MeasuredElement>,
    band: [number, number],
  ): void {
    const members = followMap.get(el.id) ?? []
    if (members.length === 0) return

    const followH = followGroupHeight(el, members, template, measured)
    const opts = el.options ?? {}

    if (followH <= remainingIn(band)) {
      // 与最后一片同页：把当前页最后一个切片（table-slice / flow-list-slice）升级为 flow-group
      const lastIdx = currentPage.length - 1
      const last = currentPage[lastIdx]
      if (last && (last.type === 'table-slice' || last.type === 'flow-list-slice') && last.elementId === el.id) {
        currentPage[lastIdx] = {
          ...last,
          type: 'flow-group',
          followElementIds: members,
          // 沿用该切片在本页的定位 top（续片已 stamp 为 0）
          groupTop: last.renderTop ?? opts.top ?? 0,
        }
        occupy(band, followH)
        markGrouped(members)
        return
      }
      // 防御：最后一片不在当前页（理论不发生）→ 按移页处理
    }

    // 放不下：整体移到下一页，仅渲染跟随区，容器从重复区域下方开始
    finishPage()
    currentPage.push({
      elementId: el.id,
      type: 'flow-group',
      startRow: 0,
      endRow: 0,
      // 动态列表组：行区间归零，渲染端只出跟随区
      ...(isDynamicFlowListEl(el) ? { startFlowRow: 0, endFlowRow: 0 } : {}),
      followElementIds: members,
      groupTop: sectionTop(el, band),
    })
    occupy(band, followH)
    markGrouped(members)
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
