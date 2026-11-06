// 参考图工具：把一个本地图片变成可用的几何数据，以及渲染结果与参考图的逐线比对。
// 物理尺寸完全由调用方决定（dpi 或 纸张+边距），本文件不含任何纸型/场景/品牌假设。
import { z } from 'zod'
import { validateTemplateJson } from '@worm-vue3-print/contract'
import { findBlockedElementPaths } from '@worm-vue3-print/core/designer'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asError, asText } from './tool-types.js'
import { unwrapTemplateShell } from './template-session-tools.js'
import {
  analyzeGeometry,
  toNorm,
  toMillimeters,
  type AnalyzedGeometry,
  type GrayBitmap,
  type NormRect,
} from './image-analysis.js'
import type { TemplateRenderBridge } from './render-tools.js'

/** 默认比对容差：内容区宽度的 0.2% */
const DEFAULT_TOLERANCE_RATIO = 0.002

/** 两图宽高比差异超过该比例时提示「不是同一版式」 */
const ASPECT_DRIFT_LIMIT = 0.02

/**
 * 宿主注入的图片读取接口：路径读文件与 base64 解码都由客户端实现（Electron nativeImage），
 * MCP 包只做纯计算。抛错需带 code：IMAGE_NOT_FOUND / IMAGE_DECODE_FAILED / IMAGE_TOO_LARGE / IMAGE_UNSUPPORTED。
 */
export interface ImageReaderBridge {
  readGrayImage(filePath: string): Promise<GrayBitmap>
  decodePngBase64(base64: string): Promise<GrayBitmap>
}

/** 只读本地图片、不触网 */
const PURE_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

/**
 * 走渲染管线的工具：模板可引用远程图片/字体，宿主渲染时会真实触网或读本地资源，
 * 因此 openWorldHint 必须为 true（渲染不落画布，destructiveHint 仍为 false）。
 */
const RENDER_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const

function schemaOf<T extends z.ZodTypeAny>(schema: T): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

/** bridge 抛错 → 可行动文案 */
function imageBridgeError(err: unknown): string {
  const code = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = err instanceof Error ? err.message : String(err)
  switch (code) {
    case 'IMAGE_NOT_FOUND':
      return `图片不存在或不可读：${message}。请传本地绝对路径。`
    case 'IMAGE_UNSUPPORTED':
      return `不支持的图片格式：${message}。支持 PNG / JPEG / BMP / WebP。`
    case 'IMAGE_TOO_LARGE':
      return `图片过大：${message}。请先缩小到长边 4000px 以内再试。`
    case 'IMAGE_DECODE_FAILED':
      return `图片解码失败：${message}`
    case 'PAGE_OUT_OF_RANGE':
      return `page 超出范围：${message}`
    case 'RENDER_TIMEOUT':
      return '渲染超时：模板可能过于复杂，请精简后重试。'
    case 'RENDER_FAILED':
      return `渲染失败：${message}`
    default:
      return message
  }
}

/** 把分析结果转成稳定输出（像素 + 归一化，可选毫米） */
function buildAnalyzePayload(geometry: AnalyzedGeometry, bitmap: GrayBitmap, dpi?: number, paper?: {
  widthMm: number
  heightMm: number
  margins?: { top: number; right: number; bottom: number; left: number }
}): Record<string, unknown> {
  const mmLayer = toMillimeters(geometry, {
    ...(dpi !== undefined ? { dpi } : {}),
    ...(paper !== undefined ? { paper } : {}),
  })
  const hints: string[] = []
  if (!mmLayer) {
    hints.push('未提供 dpi 或 paper：只返回像素与归一化坐标。需要毫米坐标时传 dpi（图片导出/扫描 DPI）'
      + '或 paper { widthMm, heightMm, margins }。')
  }
  if (geometry.contentArea.confidence === 'low') {
    hints.push('内容区置信度低：图片可能没有闭合外框，归一化坐标以整幅图像为基准。')
  }
  return {
    image: { widthPx: bitmap.width, heightPx: bitmap.height },
    contentArea: geometry.contentArea,
    verticalLines: geometry.verticalLines,
    horizontalLines: geometry.horizontalLines,
    textRows: geometry.textRows,
    tableCandidates: geometry.tableCandidates,
    ...(mmLayer ? { millimeters: mmLayer } : {}),
    warnings: [...geometry.warnings, ...(mmLayer?.warnings ?? [])],
    hints,
  }
}

export interface ImageToolDeps {
  imageReader: ImageReaderBridge
  renderBridge: TemplateRenderBridge
}

export function createImageTools(deps: ImageToolDeps): ToolDef[] {
  return [
    {
      name: 'print_analyze_reference_image',
      description: '【测量】把一张设计稿图片变成可用的几何数据：检测外框（内容区）、竖线/横线坐标、文本行、表格网格。'
        + '输出永远包含像素坐标与相对内容区的归一化比例；只有显式给 dpi 或 paper 时才额外给毫米坐标。'
        + '做模板前先用它取基准，不要凭目测估坐标。坐标类结果附带游程与置信度，判不准时会明确告警。',
      annotations: { title: '分析参考图几何', ...PURE_ANNOTATIONS },
      inputSchema: schemaOf(z.object({
        imagePath: z.string().min(1).describe('本地图片绝对路径（PNG/JPEG/BMP/WebP，≤20MiB）。'),
        dpi: z.number().positive().optional().describe(
          '图片导出/扫描 DPI。给了就按像素物理尺寸换算毫米（如 96、150、300）。',
        ),
        paper: z.object({
          widthMm: z.number().positive().describe('纸张宽（mm）'),
          heightMm: z.number().positive().describe('纸张高（mm）'),
          margins: z.object({
            top: z.number(), right: z.number(), bottom: z.number(), left: z.number(),
          }).optional().describe('四边页边距（mm），缺省按 0 处理'),
        }).optional().describe(
          '物理纸张尺寸：用「内容区像素宽 ÷ 内容区毫米宽」反推比例。与 dpi 同时给时 dpi 优先。',
        ),
      })),
      handler: async (args): Promise<ToolResult> => {
        const a = args as {
          imagePath?: string
          dpi?: number
          paper?: { widthMm: number; heightMm: number; margins?: { top: number; right: number; bottom: number; left: number } }
        }
        if (typeof a.imagePath !== 'string' || !a.imagePath.trim()) {
          return asError('缺少必填参数 imagePath（本地图片绝对路径）。')
        }
        try {
          const bitmap = await deps.imageReader.readGrayImage(a.imagePath.trim())
          const geometry = analyzeGeometry(bitmap)
          return asText(buildAnalyzePayload(geometry, bitmap, a.dpi, a.paper))
        } catch (e) {
          return asError(imageBridgeError(e))
        }
      },
    },
    {
      name: 'print_compare_with_reference',
      description: '【验收】把模板渲染出来，与参考设计稿逐线比对：先比内容区在整幅图像中的位置（抓整版平移），'
        + '再输出每条线在内容区内的相对位置偏差与线长（起止范围）偏差、'
        + '模板多出的线（extraInTemplate）与缺失的线（missingInTemplate）。两者没有可比内容、不是同一版式、'
        + '或内容区在整图中的位置偏移超过容差时返回 status=inconclusive（不产生通过结论）；'
        + '位置与线长都在容差内且无多余/缺失才 status=pass。'
        + '比对用归一化比例，不要求参考图的 DPI 与模板纸张一致，但两者必须是同一版式（宽高比接近）。'
        + '改模板后跑一次即可确认是否复刻到位，不必人工目检。'
        + '注意：渲染在宿主（桌面客户端）内进行，模板内引用的远程图片/字体可能触发网络请求或读取本地文件，'
        + '宿主应就此征求用户批准。',
      annotations: { title: '与参考图比对验收', ...RENDER_ANNOTATIONS },
      inputSchema: schemaOf(z.object({
        templateJson: z.record(z.string(), z.unknown()).describe(
          '要比对的模板 JSON（单页 TemplateData）。多页模板请先用 print_get_open_template 取目标页。',
        ),
        referenceImagePath: z.string().min(1).describe('参考设计稿的本地绝对路径。'),
        printData: z.record(z.string(), z.unknown()).optional().describe(
          '样例打印数据；不传则绑定表达式渲染为空，可能影响文本行检测但不影响线条比对。',
        ),
        page: z.number().int().min(1).optional().describe('比对模板的第几页（1 起）；缺省第 1 页。多页模板逐页比对时使用。'),
        toleranceRatio: z.number().positive().max(0.2).optional().describe(
          '容差（相对内容区宽/高的比例），缺省 0.002（0.2%）。超过即视为不一致。',
        ),
        scale: z.number().int().min(1).max(3).optional().describe('渲染截图倍率，缺省 2。'),
      })),
      handler: async (args): Promise<ToolResult> => {
        const a = args as {
          templateJson?: unknown
          referenceImagePath?: string
          printData?: Record<string, unknown>
          page?: number
          toleranceRatio?: number
          scale?: number
        }
        if (!Object.prototype.hasOwnProperty.call(args, 'templateJson') || !a.templateJson || typeof a.templateJson !== 'object'
          || Array.isArray(a.templateJson)) {
          return asError('缺少必填参数 templateJson（模板 JSON 对象）。')
        }
        if (typeof a.referenceImagePath !== 'string' || !a.referenceImagePath.trim()) {
          return asError('缺少必填参数 referenceImagePath（参考图本地绝对路径）。')
        }
        const template = unwrapTemplateShell(a.templateJson)
        if (!template || typeof template !== 'object' || Array.isArray(template)) {
          return asError('templateJson 不是合法的模板 JSON。')
        }
        const checked = validateTemplateJson(template)
        if (!checked.ok || !checked.data) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                stage: 'validate',
                ok: false,
                hint: '契约校验未通过：先修 issues[].path（level=error）再比对。',
                issues: checked.issues,
              }, null, 2),
            }],
            isError: true,
          }
        }
        const blocked = findBlockedElementPaths(template)
        if (blocked.length > 0) {
          return asError(`模板包含被封禁的元素类型（占位实现）：${blocked.join(', ')}`)
        }

        const tolerance = typeof a.toleranceRatio === 'number' && a.toleranceRatio > 0
          ? a.toleranceRatio
          : DEFAULT_TOLERANCE_RATIO
        const scale = typeof a.scale === 'number' && Number.isInteger(a.scale) && a.scale >= 1 ? a.scale : 2
        const page = typeof a.page === 'number' && Number.isInteger(a.page) && a.page >= 1 ? a.page : 1

        try {
          // 1. 渲染模板目标页并解码
          const rendered = await deps.renderBridge.renderTemplatePage({
            templateJson: checked.data,
            ...(a.printData && typeof a.printData === 'object' && !Array.isArray(a.printData)
              ? { printData: a.printData }
              : {}),
            page,
            scale,
          })
          const renderBitmap = await deps.imageReader.decodePngBase64(rendered.pngBase64)
          // 2. 读参考图并解码
          const refBitmap = await deps.imageReader.readGrayImage(a.referenceImagePath.trim())

          const renderGeom = analyzeGeometry(renderBitmap)
          const refGeom = analyzeGeometry(refBitmap)
          const payload = { page, ...compareGeometry(renderGeom, refGeom, tolerance, rendered.pageSizeMm) }
          return asText(payload)
        } catch (e) {
          return asError(imageBridgeError(e))
        }
      },
    },
  ]
}

interface RunNorm {
  pos: number
  start: number
  end: number
}

interface CompareItem {
  kind: 'vline' | 'hline'
  templateNorm: number
  referenceNorm: number
  diffRatio: number
  /** 线的起止范围（沿另一轴的归一化坐标，相对内容区） */
  templateStart: number
  templateEnd: number
  referenceStart: number
  referenceEnd: number
  /** 起止范围差异：max(|start 差|, |end 差|) */
  spanDiffRatio: number
  /** 近似值：diffRatio × 纸张尺寸（非内容区尺寸），仅用于判断量级 */
  diffMmApprox?: number
}

/** 未配对上的线：norm 为线所在轴的位置，start/end 为沿另一轴的归一化起止（便于与另一侧成对核对） */
interface LineGap {
  kind: 'vline' | 'hline'
  norm: number
  start: number
  end: number
}

interface MatchOutcome {
  items: CompareItem[]
  extraInTemplate: LineGap[]
  missingInTemplate: LineGap[]
}

/** 线条 → 归一化 RunNorm：位置 + 起止范围都以内容区为基准 clamp 到 0..1 */
function toRunNorms(
  kind: 'vline' | 'hline',
  lines: AnalyzedGeometry['verticalLines'] | AnalyzedGeometry['horizontalLines'],
  area: AnalyzedGeometry['contentArea']['px'],
): RunNorm[] {
  if (kind === 'vline') {
    return (lines as AnalyzedGeometry['verticalLines']).map(l => ({
      pos: toNorm(l.xPx, area.left, area.right),
      start: toNorm(l.yStartPx, area.top, area.bottom),
      end: toNorm(l.yEndPx, area.top, area.bottom),
    }))
  }
  return (lines as AnalyzedGeometry['horizontalLines']).map(l => ({
    pos: toNorm(l.yPx, area.top, area.bottom),
    start: toNorm(l.xStartPx, area.left, area.right),
    end: toNorm(l.xEndPx, area.left, area.right),
  }))
}

/**
 * 最近邻匹配（模板 → 参考）：先按位置容差找候选，再按起止范围筛。
 * 位置在容差内但线长差异超过 tolerance*3 的不算匹配——模板线进 extra，参考线留给后续配对（配不上则 missing）。
 */
function matchLines(
  kind: 'vline' | 'hline',
  template: RunNorm[],
  reference: RunNorm[],
  tolerance: number,
  mmSpan: (ratio: number, axis: 'x' | 'y') => number | undefined,
): MatchOutcome {
  const items: CompareItem[] = []
  const extraInTemplate: MatchOutcome['extraInTemplate'] = []
  const missingInTemplate: MatchOutcome['missingInTemplate'] = []
  const used = new Set<number>()
  const spanLimit = tolerance * 3

  const sorted = [...template].sort((a, b) => a.pos - b.pos)
  for (const t of sorted) {
    const candidates = reference
      .map((r, i) => ({ r, i, posDiff: Math.abs(r.pos - t.pos) }))
      .filter(c => !used.has(c.i) && c.posDiff <= tolerance)
      .sort((a, b) => a.posDiff - b.posDiff)
    const hit = candidates.find(c =>
      Math.max(Math.abs(t.start - c.r.start), Math.abs(t.end - c.r.end)) <= spanLimit)
    if (hit) {
      used.add(hit.i)
      const diffMm = mmSpan(hit.posDiff, kind === 'vline' ? 'x' : 'y')
      items.push({
        kind,
        templateNorm: round4(t.pos),
        referenceNorm: round4(hit.r.pos),
        diffRatio: round4(hit.posDiff),
        templateStart: round4(t.start),
        templateEnd: round4(t.end),
        referenceStart: round4(hit.r.start),
        referenceEnd: round4(hit.r.end),
        spanDiffRatio: round4(Math.max(Math.abs(t.start - hit.r.start), Math.abs(t.end - hit.r.end))),
        ...(diffMm !== undefined ? { diffMmApprox: diffMm } : {}),
      })
    } else {
      extraInTemplate.push({ kind, norm: round4(t.pos), start: round4(t.start), end: round4(t.end) })
    }
  }
  for (let i = 0; i < reference.length; i++) {
    if (used.has(i)) continue
    const r = reference[i]!
    missingInTemplate.push({ kind, norm: round4(r.pos), start: round4(r.start), end: round4(r.end) })
  }
  return { items, extraInTemplate, missingInTemplate }
}

/**
 * 归一化比对：以各自内容区为基准比较线的位置与起止范围。
 * 两图必须先过「同版式」前提（都有线、置信度可信、宽高比一致），否则返回 inconclusive 而不是 pass。
 * 匹配采用最近邻 + 位置/线长双容差；未匹配的分别进 extra / missing，能抓出「多余的框」「过短的线」这类问题。
 */
function compareGeometry(
  render: AnalyzedGeometry,
  reference: AnalyzedGeometry,
  tolerance: number,
  pageSizeMm?: { width: number; height: number },
): { status: 'pass' | 'fail' | 'inconclusive'; pass: boolean; [k: string]: unknown } {
  const warnings: string[] = []

  const mmSpan = (ratio: number, axis: 'x' | 'y'): number | undefined => {
    if (!pageSizeMm) return undefined
    const span = axis === 'x' ? pageSizeMm.width : pageSizeMm.height
    return Math.round(ratio * span * 100) / 100
  }

  // 宽高比一致性：不一致说明两图不是同一版式，归一化比对会失真
  const renderAspect = aspectOf(render)
  const refAspect = aspectOf(reference)
  const aspectDrift = Math.abs(renderAspect - refAspect) / Math.max(refAspect, 1e-6)

  const contentAreaOffset = offsetOfPage(render.contentArea.pageNorm, reference.contentArea.pageNorm)

  const base = {
    toleranceRatio: tolerance,
    maxDeviationRatio: 0,
    matchedCount: 0,
    extraInTemplate: [] as unknown[],
    missingInTemplate: [] as unknown[],
    referenceConfidence: reference.contentArea.confidence,
    contentAreaOffset,
  }

  // 不可判定：任何一项都不给 pass，防止「什么都测不出来」被当成「比对通过」
  const inconclusive = (): { status: 'inconclusive'; pass: boolean; [k: string]: unknown } => ({
    status: 'inconclusive' as const,
    pass: false,
    ...base,
    warnings,
  })

  if (render.verticalLines.length === 0 && render.horizontalLines.length === 0) {
    warnings.push('模板渲染图没有检测到任何线条：无法比对，请检查模板是否为空或渲染是否失败')
    return inconclusive()
  }
  if (reference.verticalLines.length === 0 && reference.horizontalLines.length === 0) {
    warnings.push('参考图没有检测到任何线条：无法比对，请先用 print_analyze_reference_image 确认它是含线框的设计稿')
    return inconclusive()
  }
  if (reference.contentArea.confidence === 'low' || render.contentArea.confidence === 'low') {
    warnings.push(
      `内容区置信度低（模板 ${render.contentArea.confidence} / 参考 ${reference.contentArea.confidence}）：`
        + '比对基准不可靠，先用 print_analyze_reference_image 核对参考图后再试',
    )
    return inconclusive()
  }
  if (aspectDrift > ASPECT_DRIFT_LIMIT) {
    warnings.push(
      `两图内容区宽高比不一致（模板 ${renderAspect.toFixed(3)} vs 参考 ${refAspect.toFixed(3)}，`
        + `偏差 ${Math.round(aspectDrift * 100)}%）：可能不是同一版式，拒绝给出比对结论`,
    )
    return inconclusive()
  }

  // 整版平移：线条坐标全部相对「各自内容区」归一化，整版位移会被这层归一化吸收掉，
  // 所以必须单独比较内容区在整幅图像中的位置；任一边偏移超容差不给 pass
  if (contentAreaOffset.max > tolerance) {
    warnings.push(
      `内容区在整幅图像中的位置偏移超出容差（左 ${contentAreaOffset.left} / 上 ${contentAreaOffset.top} / `
        + `右 ${contentAreaOffset.right} / 下 ${contentAreaOffset.bottom}，容差 ${tolerance}）：`
        + '两图存在整版平移（版面在纸上的位置不同），归一化线条比对无法判定复刻是否到位，'
        + '请先把版面在纸张中的位置对齐再比对',
    )
    return inconclusive()
  }

  const outcome: MatchOutcome = { items: [], extraInTemplate: [], missingInTemplate: [] }
  for (const [kind, renderLines, referenceLines] of [
    ['vline', render.verticalLines, reference.verticalLines],
    ['hline', render.horizontalLines, reference.horizontalLines],
  ] as const) {
    const m = matchLines(
      kind,
      toRunNorms(kind, renderLines, render.contentArea.px),
      toRunNorms(kind, referenceLines, reference.contentArea.px),
      tolerance,
      mmSpan,
    )
    outcome.items.push(...m.items)
    outcome.extraInTemplate.push(...m.extraInTemplate)
    outcome.missingInTemplate.push(...m.missingInTemplate)
  }

  // 偏差取「位置偏差」与「线长（起止范围）偏差」的较大值：只报位置会把同位不同长的线掩盖成 0
  const itemDeviation = outcome.items.reduce((m, it) => Math.max(m, it.diffRatio, it.spanDiffRatio), 0)
  // 配不上对的线按位置两两配对后比线长：这正是「位置对得上但长度不同」的偏差来源
  const gapDeviation = gapSpanDeviation(outcome.extraInTemplate, outcome.missingInTemplate, tolerance)
  const maxDeviationRatio = Math.max(itemDeviation, gapDeviation)
  // 位置超容差的线在 matchLines 里已配不上（进 extra），这里只需看多余/缺失
  const hasMismatch = outcome.extraInTemplate.length > 0 || outcome.missingInTemplate.length > 0
  if (outcome.extraInTemplate.length > 0 && outcome.missingInTemplate.length > 0) {
    warnings.push(
      'extraInTemplate 与 missingInTemplate 同时非空：通常是同一位置的线长不匹配'
      + '（模板线进 extra、参考线进 missing），请按 norm 相同、start/end 不同来配对核对，不要当成两条互相独立的差异处理',
    )
  }
  const status: 'pass' | 'fail' = hasMismatch ? 'fail' : 'pass'

  return {
    status,
    pass: status === 'pass',
    ...base,
    maxDeviationRatio: round4(maxDeviationRatio),
    matchedCount: outcome.items.length,
    items: outcome.items,
    extraInTemplate: outcome.extraInTemplate,
    missingInTemplate: outcome.missingInTemplate,
    warnings,
    note: status === 'pass'
      ? '线条位置与线长都和参考图一致（内容区在整幅图像中的位置、位置偏差、起止范围差异都在容差内，且没有多余/缺失的线）。'
      : '存在线长差异、多余或缺失的线条：'
        + 'items 看各线的位置偏差与起止范围（templateStart/End vs referenceStart/End），'
        + 'extraInTemplate / missingInTemplate 看多余与缺失的线（含各自 start/end 范围，可成对核对线长），修完模板重新比对。',
  }
}

/**
 * extra / missing 按位置配对（同 kind 且 norm 差在容差内）后取线长差异。
 * 配成对说明「这条线该在这儿，只是长度不对」，偏差必须计进 maxDeviationRatio，
 * 否则 status=fail 但偏差仍是 0，输出无法解释为什么不通过。
 */
function gapSpanDeviation(extra: LineGap[], missing: LineGap[], tolerance: number): number {
  const used = new Set<number>()
  let max = 0
  for (const e of extra) {
    let bestIndex = -1
    let bestDiff = Number.POSITIVE_INFINITY
    for (let i = 0; i < missing.length; i++) {
      if (used.has(i)) continue
      const m = missing[i]!
      if (m.kind !== e.kind) continue
      const d = Math.abs(m.norm - e.norm)
      if (d <= tolerance && d < bestDiff) {
        bestDiff = d
        bestIndex = i
      }
    }
    if (bestIndex < 0) continue
    used.add(bestIndex)
    const m = missing[bestIndex]!
    max = Math.max(max, Math.abs(e.start - m.start), Math.abs(e.end - m.end))
  }
  return max
}

/** 内容区在整幅图像中位置的归一化偏移（各边取绝对差，max 用于与容差比较） */
function offsetOfPage(render: NormRect, reference: NormRect): {
  left: number
  top: number
  right: number
  bottom: number
  max: number
} {
  const left = Math.abs(render.left - reference.left)
  const top = Math.abs(render.top - reference.top)
  const right = Math.abs(render.right - reference.right)
  const bottom = Math.abs(render.bottom - reference.bottom)
  return {
    left: round4(left),
    top: round4(top),
    right: round4(right),
    bottom: round4(bottom),
    max: round4(Math.max(left, top, right, bottom)),
  }
}

function aspectOf(g: AnalyzedGeometry): number {
  const px = g.contentArea.px
  const w = px.right - px.left
  const h = px.bottom - px.top
  return h > 0 ? w / h : 0
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}
