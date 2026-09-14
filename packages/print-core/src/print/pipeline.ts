import { bindData } from '../render/data-binder.js'
import { generateHtml } from '../render/html-generator.js'
import { paginate } from '../render/pagination-engine.js'
import { composeContinuousHeight } from '../render/continuous-paper.js'
import { getPaperDimensions, isContinuousPaper } from '../render/types.js'
import { createCollectingCodeRenderer, createMapCodeRenderer, mergeCodeMaps } from './codes.js'
import { escapeHeightMm, paperViewportPx, resolvePaperMm } from './paper.js'
import { buildPdfTargetSpec, buildScreenshotTargetSpec } from './pdf-spec.js'
import { normalizeMeasurements } from './measure.js'
import { pxToMm } from './units.js'
import type { CodeRenderer, PageLayout, TemplateData } from '../render/types.js'
import type { PrintRuntime, PrintSession } from './ports.js'
import type { PreparedDocument, PrintJob, RenderPdfResult } from './types.js'

/** 阶段 1–6：绑定 → 码值收集/渲染 → 测量 → 分页 → 连续纸 → 最终 HTML */
export async function prepareDocument(job: PrintJob, runtime: PrintRuntime): Promise<PreparedDocument> {
  return runtime.withSession(job, session => prepareWithSession(job, session))
}

/** 阶段 1–7：prepared + HTML→PDF，且与准备阶段共用同一个 driver 会话 */
export async function renderPdf(job: PrintJob, runtime: PrintRuntime): Promise<RenderPdfResult> {
  return runtime.withSession(job, async (session) => {
    const prepared = await prepareWithSession(job, session)
    const viewport = paperViewportPx(prepared.paperMm)
    const pdf = await session.toPdf(prepared.html, buildPdfTargetSpec(prepared.paperMm), viewport)
    return { pdf, prepared }
  })
}

/** 截图：不分页，用测量模式 HTML 单页完整渲染 */
export async function renderScreenshot(job: PrintJob, runtime: PrintRuntime): Promise<Uint8Array> {
  return runtime.withSession(job, async (session) => {
    const bound = bindData(job.templateJson, job.printData, job.baseUrl)
    const built = await buildHtmlWithCodes({
      bound, job, session, pageLayouts: [], isMeasurementPass: true,
    })
    const viewport = paperViewportPx(getPaperDimensions(bound))
    return session.toScreenshot(built.html, buildScreenshotTargetSpec(), viewport)
  })
}

async function prepareWithSession(job: PrintJob, session: PrintSession): Promise<PreparedDocument> {
  const bound = bindData(job.templateJson, job.printData, job.baseUrl)
  const continuous = isContinuousPaper(bound)
  const designPaper = getPaperDimensions(bound)
  const viewport = paperViewportPx(designPaper)
  const heightEscape = escapeHeightMm({ paperHeightMm: job.paperHeightMm, override: job.paperOverride })

  // 测量 HTML：先收集码值 → 渲染 → 用真实渲染器再生成
  const measurement = await buildHtmlWithCodes({
    bound, job, session, pageLayouts: [], isMeasurementPass: true,
  })
  const measurements = await session.measure(measurement.html, viewport)
  const pageLayouts = paginate(bound, normalizeMeasurements(measurements, bound))

  // 最终 HTML：补齐测量趟看不到的码值（页眉/页脚/首页叠加中的真实页码）
  const finalBuild = await buildHtmlWithCodes({
    bound, job, session, pageLayouts, isMeasurementPass: false, baseMap: measurement.map,
  })
  let html = finalBuild.html

  let derivedHeightMm: number | undefined
  if (continuous) {
    if (heightEscape && heightEscape > 0) {
      derivedHeightMm = heightEscape
    } else {
      const bottomPx = await session.probeContentBottom(html, viewport)
      derivedHeightMm = composeContinuousHeight(bound, pxToMm(bottomPx))
    }
    html = generateHtml(bound, pageLayouts, job.printData, {
      codeRenderer: finalBuild.codeRenderer,
      pageHeightMm: derivedHeightMm,
    })
  }

  // 连续纸：paperHeightMm 逃生门与协议覆盖高度都算「显式给定」，来源记为 config；
  // 非连续纸不使用 paperHeightMm（否则会出现 HTML 纸高与输出纸张不一致），沿用协议覆盖。
  const overrideForPaper = continuous && heightEscape
    ? { ...job.paperOverride, height: heightEscape }
    : job.paperOverride

  const { paperMm, heightSource } = resolvePaperMm({
    paperMm: { width: designPaper.width, height: derivedHeightMm ?? designPaper.height },
    continuous,
    override: overrideForPaper,
  })

  return { html, pageCount: pageLayouts.length, paperMm, continuous, heightSource, pageLayouts }
}

interface BuildHtmlInput {
  bound: TemplateData
  job: PrintJob
  session: PrintSession
  pageLayouts: PageLayout[]
  isMeasurementPass: boolean
  baseMap?: Map<string, string>
}

/**
 * 生成 HTML：先跑一趟「收集型渲染器」拿到本趟真实码值规格，
 * 渲染后若有新规格则用完整映射再生成一次；无码模板只生成一次。
 * 调用方提供了 codeRenderer 时直接沿用（浏览器端既有覆盖语义）。
 */
async function buildHtmlWithCodes(
  input: BuildHtmlInput,
): Promise<{ html: string; codeRenderer?: CodeRenderer; map: Map<string, string> }> {
  const baseMap = input.baseMap ?? new Map<string, string>()
  if (input.job.codeRenderer) {
    const html = generateHtml(input.bound, input.pageLayouts, input.job.printData, {
      isMeasurementPass: input.isMeasurementPass,
      codeRenderer: input.job.codeRenderer,
    })
    return { html, codeRenderer: input.job.codeRenderer, map: baseMap }
  }
  const collector = createCollectingCodeRenderer(baseMap)
  const draft = generateHtml(input.bound, input.pageLayouts, input.job.printData, {
    isMeasurementPass: input.isMeasurementPass,
    codeRenderer: collector.renderer,
  })
  const extra = collector.takeSpecs()
  const rendered = extra.length > 0 ? await input.session.renderCodes(extra) : new Map<string, string>()
  const map = mergeCodeMaps(baseMap, rendered)
  const codeRenderer = map.size > 0 ? createMapCodeRenderer(map) : undefined
  if (extra.length === 0) return { html: draft, codeRenderer, map }
  const html = generateHtml(input.bound, input.pageLayouts, input.job.printData, {
    isMeasurementPass: input.isMeasurementPass,
    codeRenderer,
  })
  return { html, codeRenderer, map }
}
