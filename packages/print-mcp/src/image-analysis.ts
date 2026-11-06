// 参考图几何分析：从灰度位图提取线条、文本行与表格网格。
// 纯几何、无语义、无纸张假设——输出像素层与归一化层，毫米层由调用方给出 dpi/纸张后换算。
// 所有检测都带像素游程依据，判不准时降级 confidence 而不是猜坐标。

/** 灰度位图：gray[i] 取值 0（黑）~255（白），逐行存储 */
export interface GrayBitmap {
  width: number
  height: number
  gray: Uint8Array
}

/** 二值图：1 = 深色（墨迹），0 = 背景 */
export interface BinaryBitmap {
  width: number
  height: number
  dark: Uint8Array
}

export interface PixelRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface NormRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface DetectedVLine {
  xPx: number
  yStartPx: number
  yEndPx: number
  /** 该列最长连续深色游程（像素），用于判断是不是真线条 */
  runPx: number
  /** 线宽（像素）：相邻同类列合并后的总宽 */
  widthPx: number
  xNorm: number
}

export interface DetectedHLine {
  yPx: number
  xStartPx: number
  xEndPx: number
  runPx: number
  heightPx: number
  yNorm: number
}

export interface DetectedTextRow {
  yStartPx: number
  yEndPx: number
  xStartPx: number
  xEndPx: number
  /** 由检测到的竖线划分出的分区序号（0 起），非硬编码比例 */
  regionIndex: number
  /** 包围盒相对内容区的 0..1 归一化（对齐 mm 层，无 dpi/paper 时也能直接对比模板比例） */
  norm: NormRect
}

export interface DetectedTable {
  leftPx: number
  topPx: number
  colWidthsPx: number[]
  rowHeightsPx: number[]
  /** 包围盒（左上 + 列宽行高合计出的右下）相对内容区的 0..1 归一化；analyzeGeometry() 填充（detectTables 本身不感知内容区） */
  norm?: NormRect
}

export interface AnalyzedGeometry {
  /**
   * 内容区（最外圈长线围成的矩形）。
   * - px：像素坐标
   * - norm：相对内容区自身（恒等 0..1，保留给既有调用方兼容）
   * - pageNorm：相对整幅图像的 0..1 坐标——整版平移只能在这里看出来，
   *   线条坐标全部相对内容区归一化，会把整版位移吸收掉
   */
  contentArea: { px: PixelRect; norm: NormRect; pageNorm: NormRect; confidence: 'high' | 'medium' | 'low' }
  verticalLines: DetectedVLine[]
  horizontalLines: DetectedHLine[]
  textRows: DetectedTextRow[]
  tableCandidates: DetectedTable[]
  warnings: string[]
}

/** 二值化阈值：灰度低于此值算墨迹 */
const DARK_THRESHOLD = 128

/** 线条最小游程：占内容区高度/宽度的比例（避免把文字笔画当线） */
const LINE_MIN_RUN_RATIO = 0.08

/** 线条合并：相邻若干列/行视为同一根线（抗锯齿会跨 1-3px） */
const LINE_MERGE_GAP_PX = 2

/** 文本行：该行墨迹像素数下限（占内容区宽的比例） */
const TEXT_ROW_MIN_INK_RATIO = 0.002

/** 文本行之间允许的空白行数（防止同一文字块被拆成多行） */
const TEXT_ROW_MERGE_GAP_PX = 1

export function binarize(bitmap: GrayBitmap, threshold = DARK_THRESHOLD): BinaryBitmap {
  const dark = new Uint8Array(bitmap.width * bitmap.height)
  for (let i = 0; i < bitmap.gray.length; i++) {
    dark[i] = bitmap.gray[i]! < threshold ? 1 : 0
  }
  return { width: bitmap.width, height: bitmap.height, dark }
}

/** 某列在 [y0, y1] 内的最长连续深色游程 */
function columnRun(bin: BinaryBitmap, x: number, y0: number, y1: number): { length: number; start: number; end: number } {
  let best = { length: 0, start: -1, end: -1 }
  let run = 0
  let start = -1
  for (let y = y0; y <= y1; y++) {
    if (bin.dark[y * bin.width + x]) {
      if (start < 0) start = y
      run++
      if (run > best.length) best = { length: run, start, end: y }
    } else {
      run = 0
      start = -1
    }
  }
  return best
}

/** 某行在 [x0, x1] 内的最长连续深色游程 */
function rowRun(bin: BinaryBitmap, y: number, x0: number, x1: number): { length: number; start: number; end: number } {
  let best = { length: 0, start: -1, end: -1 }
  let run = 0
  let start = -1
  for (let x = x0; x <= x1; x++) {
    if (bin.dark[y * bin.width + x]) {
      if (start < 0) start = x
      run++
      if (run > best.length) best = { length: run, start, end: x }
    } else {
      run = 0
      start = -1
    }
  }
  return best
}

/** 把相邻索引合并成组（线宽/线群） */
function groupAdjacent(indices: number[], gap = LINE_MERGE_GAP_PX): Array<{ start: number; end: number; mid: number }> {
  const groups: Array<{ start: number; end: number; mid: number }> = []
  let cur: number[] = []
  for (const i of indices) {
    if (cur.length && i - cur[cur.length - 1]! > gap) {
      groups.push({ start: cur[0]!, end: cur[cur.length - 1]!, mid: cur[Math.floor(cur.length / 2)]! })
      cur = []
    }
    cur.push(i)
  }
  if (cur.length) groups.push({ start: cur[0]!, end: cur[cur.length - 1]!, mid: cur[Math.floor(cur.length / 2)]! })
  return groups
}

/** 检测竖线：逐列找足够长的连续游程，再把相邻列合并成一根线 */
export function detectVerticalLines(
  bin: BinaryBitmap,
  area: PixelRect,
  minRunRatio = LINE_MIN_RUN_RATIO,
): Array<{ xPx: number; yStartPx: number; yEndPx: number; runPx: number; widthPx: number }> {
  const areaH = area.bottom - area.top + 1
  const minRun = Math.max(3, Math.floor(areaH * minRunRatio))
  const hits: Array<{ x: number; run: number; start: number; end: number }> = []
  for (let x = area.left; x <= area.right; x++) {
    const r = columnRun(bin, x, area.top, area.bottom)
    if (r.length >= minRun) hits.push({ x, run: r.length, start: r.start, end: r.end })
  }
  return groupAdjacent(hits.map(h => h.x)).map(g => {
    // 取组内游程最长的那一列作为代表
    const members = hits.filter(h => h.x >= g.start && h.x <= g.end)
    const best = members.reduce((a, b) => (b.run > a.run ? b : a), members[0]!)
    return { xPx: best.x, yStartPx: best.start, yEndPx: best.end, runPx: best.run, widthPx: g.end - g.start + 1 }
  })
}

/** 检测横线 */
export function detectHorizontalLines(
  bin: BinaryBitmap,
  area: PixelRect,
  minRunRatio = LINE_MIN_RUN_RATIO,
): Array<{ yPx: number; xStartPx: number; xEndPx: number; runPx: number; heightPx: number }> {
  const areaW = area.right - area.left + 1
  const minRun = Math.max(3, Math.floor(areaW * minRunRatio))
  const hits: Array<{ y: number; run: number; start: number; end: number }> = []
  for (let y = area.top; y <= area.bottom; y++) {
    const r = rowRun(bin, y, area.left, area.right)
    if (r.length >= minRun) hits.push({ y, run: r.length, start: r.start, end: r.end })
  }
  return groupAdjacent(hits.map(h => h.y)).map(g => {
    const members = hits.filter(h => h.y >= g.start && h.y <= g.end)
    const best = members.reduce((a, b) => (b.run > a.run ? b : a), members[0]!)
    return { yPx: best.y, xStartPx: best.start, xEndPx: best.end, runPx: best.run, heightPx: g.end - g.start + 1 }
  })
}

/**
 * 推断内容区：最外圈长线围成的矩形。
 * 找不到（没有明显外框）时不猜——退化为整图并降级 confidence。
 */
export function inferContentArea(
  bin: BinaryBitmap,
  vLines: Array<{ xPx: number; yStartPx: number; yEndPx: number; runPx: number }>,
  hLines: Array<{ yPx: number; xStartPx: number; xEndPx: number; runPx: number }>,
): { px: PixelRect; confidence: 'high' | 'medium' | 'low'; warnings: string[] } {
  const warnings: string[] = []
  const full: PixelRect = { left: 0, top: 0, right: bin.width - 1, bottom: bin.height - 1 }

  // 能当边框的线：游程覆盖画面多数方向
  const vCandidates = vLines.filter(l => l.runPx >= bin.height * 0.5)
  const hCandidates = hLines.filter(l => l.runPx >= bin.width * 0.5)
  if (vCandidates.length < 2 || hCandidates.length < 2) {
    warnings.push('未检测到闭合外框：内容区退化为整幅图像，归一化坐标以整图为基准')
    return { px: full, confidence: 'low', warnings }
  }

  const left = Math.min(...vCandidates.map(l => l.xPx))
  const right = Math.max(...vCandidates.map(l => l.xPx))
  const top = Math.min(...hCandidates.map(l => l.yPx))
  const bottom = Math.max(...hCandidates.map(l => l.yPx))

  // 外框应占画面主要区域；否则说明检测到的只是局部网格
  const wRatio = (right - left + 1) / bin.width
  const hRatio = (bottom - top + 1) / bin.height
  if (wRatio < 0.5 || hRatio < 0.5) {
    warnings.push(`检测到的外框仅占画面 ${Math.round(wRatio * 100)}%×${Math.round(hRatio * 100)}%，内容区判定不可靠`)
    return { px: full, confidence: 'low', warnings }
  }

  const confidence: 'high' | 'medium' | 'low' = wRatio >= 0.9 && hRatio >= 0.9 ? 'high' : 'medium'
  return { px: { left, top, right, bottom }, confidence, warnings }
}

/**
 * 检测文本行：在排除已识别线条的区域做行投影，连续有墨迹的行合并成一段。
 * 竖线所在的列必须排除——否则外框/分隔线会让每一行都"有墨迹"，整区被并成一段。
 * regionIndex 由「落在哪两根相邻竖线之间」决定，不预设任何比例分区。
 */
export function detectTextRows(
  bin: BinaryBitmap,
  area: PixelRect,
  vLines: Array<{ xPx: number; widthPx?: number }>,
  hLineCheck: (y: number) => boolean,
): DetectedTextRow[] {
  const areaW = area.right - area.left + 1
  const minInk = Math.max(2, Math.floor(areaW * TEXT_ROW_MIN_INK_RATIO))

  // 竖线占用的列（含线宽，多留 1px 余量吸收抗锯齿）
  const lineCols = new Set<number>()
  for (const l of vLines) {
    const w = Math.max(1, l.widthPx ?? 1)
    for (let d = -1; d < w + 1; d++) lineCols.add(l.xPx + d)
  }
  const isTextCol = (x: number): boolean => !lineCols.has(x)

  const rowHasInk: boolean[] = []
  for (let y = area.top; y <= area.bottom; y++) {
    if (hLineCheck(y)) { rowHasInk.push(false); continue }
    let ink = 0
    for (let x = area.left; x <= area.right; x++) {
      if (isTextCol(x) && bin.dark[y * bin.width + x]) ink++
    }
    rowHasInk.push(ink >= minInk)
  }

  // 连续有墨迹的行合并（允许少量空白过渡）
  const bands: Array<{ start: number; end: number }> = []
  let cur: { start: number; end: number } | null = null
  let gap = 0
  for (let i = 0; i < rowHasInk.length; i++) {
    const y = area.top + i
    if (rowHasInk[i]) {
      if (!cur) cur = { start: y, end: y }
      else cur.end = y
      gap = 0
    } else if (cur) {
      gap++
      if (gap > TEXT_ROW_MERGE_GAP_PX) {
        bands.push(cur)
        cur = null
        gap = 0
      }
    }
  }
  if (cur) bands.push(cur)

  const xs = [...new Set(vLines.map(l => l.xPx))].sort((a, b) => a - b)
  return bands.map(b => {
    let minX = area.right
    let maxX = area.left
    for (let y = b.start; y <= b.end; y++) {
      for (let x = area.left; x <= area.right; x++) {
        if (!isTextCol(x)) continue
        if (bin.dark[y * bin.width + x]) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }
    }
    // 整段只落在线上（理论不会发生，已被 minInk 过滤），兜底保持区间可读
    if (minX > maxX) { minX = area.left; maxX = area.right }
    const xStart = minX === area.right ? area.left : minX
    const xEnd = maxX === area.left ? area.right : maxX
    const centerX = (minX + maxX) / 2
    let regionIndex = 0
    for (let i = 0; i < xs.length - 1; i++) {
      if (centerX >= xs[i]! && centerX < xs[i + 1]!) { regionIndex = i; break }
      regionIndex = i + 1
    }
    return {
      yStartPx: b.start,
      yEndPx: b.end,
      xStartPx: xStart,
      xEndPx: xEnd,
      regionIndex,
      norm: {
        left: toNorm(xStart, area.left, area.right),
        top: toNorm(b.start, area.top, area.bottom),
        right: toNorm(xEnd, area.left, area.right),
        bottom: toNorm(b.end, area.top, area.bottom),
      },
    }
  })
}

/**
 * 表格候选：由横竖线围成的规则网格。
 * 只认「列线数量 ≥2 且行线数量 ≥2、且线在对方方向上有交集」的区块。
 */
export function detectTables(
  vLines: Array<{ xPx: number; yStartPx: number; yEndPx: number }>,
  hLines: Array<{ yPx: number; xStartPx: number; xEndPx: number }>,
): DetectedTable[] {
  if (vLines.length < 2 || hLines.length < 2) return []

  const sortedV = [...vLines].sort((a, b) => a.xPx - b.xPx)
  const sortedH = [...hLines].sort((a, b) => a.yPx - b.yPx)

  // 用相邻横线的中点判断哪几根竖线属于同一段网格
  const tables: DetectedTable[] = []
  for (let i = 0; i < sortedH.length - 1; i++) {
    const top = sortedH[i]!.yPx
    const bottom = sortedH[i + 1]!.yPx
    const midY = (top + bottom) / 2
    // 该行带内贯通的竖线
    const cols = sortedV.filter(v => v.yStartPx <= midY && v.yEndPx >= midY)
    if (cols.length < 2) continue

    // 该行带内贯通的横线（上边界）
    const hTop = sortedH[i]!
    const colsInSpan = cols.filter(v => v.xPx >= hTop.xStartPx - 2 && v.xPx <= hTop.xEndPx + 2)
    if (colsInSpan.length < 2) continue

    const colWidthsPx: number[] = []
    for (let c = 0; c < colsInSpan.length - 1; c++) {
      colWidthsPx.push(colsInSpan[c + 1]!.xPx - colsInSpan[c]!.xPx)
    }

    const leftPx = colsInSpan[0]!.xPx
    const prev = tables[tables.length - 1]
    // 同一左侧列的连续行带归为一张表
    if (prev && Math.abs(prev.leftPx - leftPx) <= 2
      && Math.abs(prev.topPx + prev.rowHeightsPx.reduce((s, h) => s + h, 0) - top) <= 2
      && prev.colWidthsPx.length === colWidthsPx.length) {
      prev.rowHeightsPx.push(bottom - top)
    } else {
      tables.push({ leftPx, topPx: top, colWidthsPx, rowHeightsPx: [bottom - top] })
    }
  }
  return tables
}

/** 归一化：相对内容区的 0..1 比例 */
export function toNorm(px: number, start: number, end: number): number {
  const span = end - start
  if (span <= 0) return 0
  const v = (px - start) / span
  return Math.max(0, Math.min(1, v))
}

/** 归一化：相对整幅图像的 0..1 坐标（像素序号 ÷ 图像边长），clamp 到 0..1 */
export function toPageNorm(px: number, extent: number): number {
  if (!Number.isFinite(extent) || extent <= 0) return 0
  return Math.max(0, Math.min(1, px / extent))
}

/** 内容区在整幅图像中的归一化位置 */
export function toPageNormRect(area: PixelRect, imageWidth: number, imageHeight: number): NormRect {
  return {
    left: toPageNorm(area.left, imageWidth),
    top: toPageNorm(area.top, imageHeight),
    right: toPageNorm(area.right, imageWidth),
    bottom: toPageNorm(area.bottom, imageHeight),
  }
}

/** 完整分析：一次产出几何特征 */
export function analyzeGeometry(bitmap: GrayBitmap): AnalyzedGeometry {
  const bin = binarize(bitmap)
  const full: PixelRect = { left: 0, top: 0, right: bitmap.width - 1, bottom: bitmap.height - 1 }

  // 第一遍：在全图上找长线（用于推断内容区）
  const roughV = detectVerticalLines(bin, full, 0.3)
  const roughH = detectHorizontalLines(bin, full, 0.3)
  const areaInfo = inferContentArea(bin, roughV, roughH)
  const area = areaInfo.px

  // 第二遍：在内容区内用更低的阈值找全部线条
  const vRaw = detectVerticalLines(bin, area)
  const hRaw = detectHorizontalLines(bin, area)

  const vLines: DetectedVLine[] = vRaw.map(l => ({
    ...l,
    xNorm: toNorm(l.xPx, area.left, area.right),
  }))
  const hLines: DetectedHLine[] = hRaw.map(l => ({
    ...l,
    yNorm: toNorm(l.yPx, area.top, area.bottom),
  }))

  const hLineYs = new Set(hRaw.map(l => l.yPx))
  const hLineCheck = (y: number): boolean => {
    for (let d = -1; d <= 1; d++) if (hLineYs.has(y + d)) return true
    return false
  }
  const textRows = detectTextRows(bin, area, vLines, hLineCheck)
  // 表格包围盒 = 左上角 + 列宽/行高合计（即最外圈线位），归一化在此补齐（detectTables 不感知内容区）
  const tableCandidates = detectTables(vRaw, hRaw).map(t => {
    const rightPx = t.leftPx + t.colWidthsPx.reduce((s, w) => s + w, 0)
    const bottomPx = t.topPx + t.rowHeightsPx.reduce((s, h) => s + h, 0)
    return {
      ...t,
      norm: {
        left: toNorm(t.leftPx, area.left, area.right),
        top: toNorm(t.topPx, area.top, area.bottom),
        right: toNorm(rightPx, area.left, area.right),
        bottom: toNorm(bottomPx, area.top, area.bottom),
      },
    }
  })

  const warnings = [...areaInfo.warnings]
  if (bitmap.width < 300 || bitmap.height < 300) {
    warnings.push(`图像尺寸 ${bitmap.width}×${bitmap.height} 偏小，细线与小字号可能漏检`)
  }
  if (vLines.length === 0 && hLines.length === 0) {
    warnings.push('未检测到任何线条：该图可能不是含边框/表格的设计稿')
  }

  return {
    contentArea: {
      px: area,
      norm: {
        left: toNorm(area.left, area.left, area.right),
        top: toNorm(area.top, area.top, area.bottom),
        right: 1,
        bottom: 1,
      },
      pageNorm: toPageNormRect(area, bitmap.width, bitmap.height),
      confidence: areaInfo.confidence,
    },
    verticalLines: vLines,
    horizontalLines: hLines,
    textRows,
    tableCandidates,
    warnings,
  }
}

export interface AnalyzeOptions {
  /** 图片 DPI：给了才算毫米层 */
  dpi?: number
  /** 物理纸张尺寸与边距：给了就用内容区反推 pxPerMm（与 dpi 二选一，dpi 优先） */
  paper?: { widthMm: number; heightMm: number; margins?: { top: number; right: number; bottom: number; left: number } }
}

export interface MillimetersLayer {
  pxPerMm: number
  contentAreaMm: { width: number; height: number }
  verticalLines: Array<{ xMm: number; yStartMm: number; yEndMm: number; widthMm: number }>
  horizontalLines: Array<{ yMm: number; xStartMm: number; xEndMm: number; heightMm: number }>
  textRows: Array<{ yStartMm: number; yEndMm: number; xStartMm: number; xEndMm: number }>
  tableCandidates: Array<{ leftMm: number; topMm: number; colWidthsMm: number[]; rowHeightsMm: number[] }>
  /** 尺寸不一致等需要调用方知道的换算问题 */
  warnings: string[]
}

/**
 * 像素 → 毫米换算。两种来源（dpi 优先）：
 * - dpi：像素 ÷ dpi × 25.4
 * - paper：内容区像素宽 ↔ 纸张内容区毫米宽，以宽度比例为基准；
 *   高度比例仅用于一致性校验，偏差异常时告警（说明给的纸张与图不匹配）
 * 都没有则返回 undefined（调用方只拿到像素层与归一化层）。
 */
export function toMillimeters(geometry: AnalyzedGeometry, options: AnalyzeOptions): MillimetersLayer | undefined {
  const area = geometry.contentArea.px
  const warnings: string[] = []
  let pxPerMm: number | undefined

  if (options.dpi && options.dpi > 0) {
    pxPerMm = options.dpi / 25.4
  } else if (options.paper) {
    const m = options.paper.margins ?? { top: 0, right: 0, bottom: 0, left: 0 }
    const contentWmm = options.paper.widthMm - m.left - m.right
    const contentHmm = options.paper.heightMm - m.top - m.bottom
    const contentWpx = area.right - area.left
    const contentHpx = area.bottom - area.top
    if (contentWmm <= 0 || contentWpx <= 0 || contentHmm <= 0 || contentHpx <= 0) {
      return undefined
    }
    // 宽度比例作为唯一基准（横向尺寸最可靠）；高度比例只做一致性检查
    pxPerMm = contentWpx / contentWmm
    const byHeight = contentHpx / contentHmm
    const drift = Math.abs(byHeight - pxPerMm) / pxPerMm
    if (drift > 0.02) {
      warnings.push(
        `纸张尺寸与图像比例不一致（宽度比 ${pxPerMm.toFixed(3)} px/mm，高度比 ${byHeight.toFixed(3)} px/mm，`
        + `偏差 ${Math.round(drift * 100)}%）：毫米坐标按宽度比例换算，请核对传入的纸张尺寸`,
      )
    }
  }
  if (!pxPerMm || !Number.isFinite(pxPerMm) || pxPerMm <= 0) return undefined

  const mm = (px: number): number => Math.round((px / pxPerMm) * 100) / 100
  return {
    pxPerMm: Math.round(pxPerMm * 1000) / 1000,
    contentAreaMm: {
      width: mm(area.right - area.left),
      height: mm(area.bottom - area.top),
    },
    verticalLines: geometry.verticalLines.map(l => ({
      xMm: mm(l.xPx - area.left),
      yStartMm: mm(l.yStartPx - area.top),
      yEndMm: mm(l.yEndPx - area.top),
      widthMm: mm(l.widthPx),
    })),
    horizontalLines: geometry.horizontalLines.map(l => ({
      yMm: mm(l.yPx - area.top),
      xStartMm: mm(l.xStartPx - area.left),
      xEndMm: mm(l.xEndPx - area.left),
      heightMm: mm(l.heightPx),
    })),
    textRows: geometry.textRows.map(r => ({
      yStartMm: mm(r.yStartPx - area.top),
      yEndMm: mm(r.yEndPx - area.top),
      xStartMm: mm(r.xStartPx - area.left),
      xEndMm: mm(r.xEndPx - area.left),
    })),
    tableCandidates: geometry.tableCandidates.map(t => ({
      leftMm: mm(t.leftPx - area.left),
      topMm: mm(t.topPx - area.top),
      colWidthsMm: t.colWidthsPx.map(mm),
      rowHeightsMm: t.rowHeightsPx.map(mm),
    })),
    warnings,
  }
}
