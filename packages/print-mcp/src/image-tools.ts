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
  toMillimeters,
  type AnalyzedGeometry,
  type GrayBitmap,
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

const PURE_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

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
      description: '【验收】把模板渲染出来，与参考设计稿逐线比对：输出每条线在内容区内的相对位置偏差、'
        + '模板多出的线（extraInTemplate）与缺失的线（missingInTemplate）。'
        + '比对用归一化比例，不要求参考图的 DPI 与模板纸张一致，但两者必须是同一版式（宽高比接近）。'
        + '改模板后跑一次即可确认是否复刻到位，不必人工目检。',
      annotations: { title: '与参考图比对验收', ...PURE_ANNOTATIONS },
      inputSchema: schemaOf(z.object({
        templateJson: z.record(z.string(), z.unknown()).describe(
          '要比对的模板 JSON（单页 TemplateData）。多页模板请先用 print_get_open_template 取目标页。',
        ),
        referenceImagePath: z.string().min(1).describe('参考设计稿的本地绝对路径。'),
        printData: z.record(z.string(), z.unknown()).optional().describe(
          '样例打印数据；不传则绑定表达式渲染为空，可能影响文本行检测但不影响线条比对。',
        ),
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

        try {
          // 1. 渲染模板首屏并解码
          const rendered = await deps.renderBridge.renderTemplatePage({
            templateJson: checked.data,
            ...(a.printData && typeof a.printData === 'object' && !Array.isArray(a.printData)
              ? { printData: a.printData }
              : {}),
            page: 1,
            scale,
          })
          const renderBitmap = await deps.imageReader.decodePngBase64(rendered.pngBase64)
          // 2. 读参考图并解码
          const refBitmap = await deps.imageReader.readGrayImage(a.referenceImagePath.trim())

          const renderGeom = analyzeGeometry(renderBitmap)
          const refGeom = analyzeGeometry(refBitmap)
          const payload = compareGeometry(renderGeom, refGeom, tolerance, rendered.pageSizeMm)
          return asText(payload)
        } catch (e) {
          return asError(imageBridgeError(e))
        }
      },
    },
  ]
}

interface CompareItem {
  kind: 'vline' | 'hline'
  templateNorm: number
  referenceNorm: number
  diffRatio: number
  /** 近似值：diffRatio × 纸张尺寸（非内容区尺寸），仅用于判断量级 */
  diffMmApprox?: number
}

/**
 * 归一化比对：以各自内容区为基准比较线的相对位置。
 * 匹配采用最近邻 + 容差；未匹配的分别进 extra / missing，能抓出「多余的框」这类问题。
 */
function compareGeometry(
  render: AnalyzedGeometry,
  reference: AnalyzedGeometry,
  tolerance: number,
  pageSizeMm?: { width: number; height: number },
): Record<string, unknown> {
  const warnings: string[] = []
  const items: CompareItem[] = []
  const extraInTemplate: Array<{ kind: 'vline' | 'hline'; norm: number }> = []
  const missingInTemplate: Array<{ kind: 'vline' | 'hline'; norm: number }> = []

  // 宽高比一致性：不一致说明两图不是同一版式，归一化比对会失真
  const renderAspect = aspectOf(render)
  const refAspect = aspectOf(reference)
  const aspectDrift = Math.abs(renderAspect - refAspect) / Math.max(refAspect, 1e-6)
  // 版式偏宽/偏窄的比例向偏差（同一版式但纸张比例不同）
  const aspectWarning = aspectDrift > ASPECT_DRIFT_LIMIT
    ? `两图内容区宽高比不一致（模板 ${renderAspect.toFixed(3)} vs 参考 ${refAspect.toFixed(3)}，`
      + `偏差 ${Math.round(aspectDrift * 100)}%）：可能不是同一版式，横向线条的归一化比对仅供参考`
    : undefined
  if (aspectWarning) warnings.push(aspectWarning)

  if (reference.contentArea.confidence === 'low') {
    warnings.push('参考图内容区置信度低（未检测到闭合外框）：比对基准可能不准确，建议先用 print_analyze_reference_image 核对')
  }

  const mmSpan = (ratio: number, axis: 'x' | 'y'): number | undefined => {
    if (!pageSizeMm) return undefined
    const span = axis === 'x' ? pageSizeMm.width : pageSizeMm.height
    return Math.round(ratio * span * 100) / 100
  }

  const matchAxis = (
    kind: 'vline' | 'hline',
    templateNorms: number[],
    referenceNorms: number[],
  ): void => {
    const used = new Set<number>()
    for (const tNorm of templateNorms) {
      let bestIdx = -1
      let bestDiff = Number.POSITIVE_INFINITY
      for (let i = 0; i < referenceNorms.length; i++) {
        if (used.has(i)) continue
        const d = Math.abs(referenceNorms[i]! - tNorm)
        if (d < bestDiff) { bestDiff = d; bestIdx = i }
      }
      if (bestIdx >= 0 && bestDiff <= tolerance) {
        used.add(bestIdx)
        const refNorm = referenceNorms[bestIdx]!
        const diffMm = mmSpan(bestDiff, kind === 'vline' ? 'x' : 'y')
        items.push({
          kind,
          templateNorm: round4(tNorm),
          referenceNorm: round4(refNorm),
          diffRatio: round4(bestDiff),
          ...(diffMm !== undefined ? { diffMmApprox: diffMm } : {}),
        })
      } else {
        extraInTemplate.push({ kind, norm: round4(tNorm) })
      }
    }
    for (let i = 0; i < referenceNorms.length; i++) {
      if (!used.has(i)) missingInTemplate.push({ kind, norm: round4(referenceNorms[i]!) })
    }
  }

  matchAxis('vline', render.verticalLines.map(l => l.xNorm), reference.verticalLines.map(l => l.xNorm))
  matchAxis('hline', render.horizontalLines.map(l => l.yNorm), reference.horizontalLines.map(l => l.yNorm))

  const maxDeviationRatio = items.reduce((m, it) => Math.max(m, it.diffRatio), 0)
  const pass = maxDeviationRatio <= tolerance && extraInTemplate.length === 0 && missingInTemplate.length === 0

  return {
    pass,
    toleranceRatio: tolerance,
    maxDeviationRatio: round4(maxDeviationRatio),
    matchedCount: items.length,
    items,
    extraInTemplate,
    missingInTemplate,
    ...(aspectWarning ? { aspectWarning } : {}),
    referenceConfidence: reference.contentArea.confidence,
    warnings,
    note: pass
      ? '线条位置与参考图一致（偏差在容差内，且没有多余/缺失的线）。'
      : '存在偏差、多余或缺失的线条：按 items / extraInTemplate / missingInTemplate 修改模板后重新比对。',
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
