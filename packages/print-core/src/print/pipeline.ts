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
import { normalizePrintData } from './normalize-print-data.js'
import { composeBatchHtml } from './batch-compose.js'
import type { BatchCopyInput } from './batch-compose.js'
import { composeTiledHtml } from './tile-compose.js'
import { computeTileLayout } from './tiling.js'

/** 单份准备的内部结构：对外文档 + 批量合并所需的中间件 */
interface SinglePrepared extends PreparedDocument {
  bound: TemplateData
  codeRenderer?: CodeRenderer
  derivedHeightMm?: number
}

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

/** 截图：不分页，用测量模式 HTML 单页完整渲染；数组数据仅渲染首条。不参与拼版（仍是标签纸单页快照） */
export async function renderScreenshot(job: PrintJob, runtime: PrintRuntime): Promise<Uint8Array> {
  return runtime.withSession(job, async (session) => {
    const normalized = normalizePrintData(job.printData)
    const data = normalized.mode === 'batch' ? normalized.dataList[0] : normalized.data
    const bound = bindData(job.templateJson, data, job.baseUrl, job.fontBaseUrl)
    const built = await buildHtmlWithCodes({
      bound, job, session, data, pageLayouts: [], isMeasurementPass: true,
    })
    const viewport = paperViewportPx(getPaperDimensions(bound))
    return session.toScreenshot(built.html, buildScreenshotTargetSpec(), viewport)
  })
}

async function prepareWithSession(job: PrintJob, session: PrintSession): Promise<PreparedDocument> {
  const normalized = normalizePrintData(job.printData)
  if (normalized.mode === 'single') {
    const single = await prepareSingleWithSession(job, session, normalized.data)
    // 单份也走拼版：1 条数据 = 1 格 = 1 张
    if (job.templateJson.tiling?.enabled === true) {
      return composeTiledPrepared(job, [{
        bound: single.bound,
        pageLayouts: single.pageLayouts,
        data: normalized.data,
        codeRenderer: single.codeRenderer,
        derivedHeightMm: single.derivedHeightMm,
        paperMm: single.paperMm,
        heightSource: single.heightSource,
      }])
    }
    return toPreparedDocument(single)
  }

  // 批量：同一 session 内串行渲染各份（避免并发测量竞态），再合并为一个文档
  const copies: BatchCopyInput[] = []
  for (let i = 0; i < normalized.dataList.length; i++) {
    try {
      const single = await prepareSingleWithSession(job, session, normalized.dataList[i])
      copies.push({
        bound: single.bound,
        pageLayouts: single.pageLayouts,
        data: normalized.dataList[i],
        codeRenderer: single.codeRenderer,
        derivedHeightMm: single.derivedHeightMm,
        paperMm: single.paperMm,
        heightSource: single.heightSource,
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`第 ${i + 1} 份渲染失败：${reason}`)
    }
  }
  // 拼版：各份不再各自独占一张纸，而是按「列×行」铺进目标纸
  if (job.templateJson.tiling?.enabled === true) {
    return composeTiledPrepared(job, copies)
  }
  const merged = composeBatchHtml(copies)
  return {
    html: merged.html,
    pageCount: merged.pageCount,
    paperMm: copies[0].paperMm,
    continuous: copies[0].bound.paperSize === 'CONTINUOUS',
    // 同模板同参数各份来源必然一致；不能用 derivedHeightMm 是否存在判断——
    // 连续纸逃生门时该字段有值但来源是 config
    heightSource: copies[0].heightSource,
    // 各份 pageIndex 均从 0 开始，批量拼接后该字段仅作调试用途
    pageLayouts: copies.flatMap(c => c.pageLayouts),
    copies: copies.length,
    copyPaperMm: merged.copyPaperMm,
  }
}

/** 批量内部结构 → 对外 PreparedDocument（剥离中间件，补 copies=1） */
function toPreparedDocument(s: SinglePrepared): PreparedDocument {
  return {
    html: s.html,
    pageCount: s.pageCount,
    paperMm: s.paperMm,
    continuous: s.continuous,
    heightSource: s.heightSource,
    pageLayouts: s.pageLayouts,
    copies: 1,
  }
}

/**
 * 拼版合成：先校验（纸面 / 列数 / 高度）+ 校验每份恰好 1 页，再铺格。
 * 校验在合并之前完成，任一不合格立即抛错，不产出半成品文档。
 */
function composeTiledPrepared(job: PrintJob, copies: BatchCopyInput[]): PreparedDocument {
  const bound = copies[0].bound
  // 目标纸先经 paperOverride 解析，再据此算行列——保证布局与物理纸始终一致
  const layout = computeTileLayout(bound, { paperOverride: job.paperOverride })

  copies.forEach((copy, i) => {
    // 溢出页：内容放不下但不产空白页，仍留在 1 页里 → 页数看不出来，必须靠 overflow 标记拦下
    const overflow = copy.pageLayouts[0]?.overflow === true
    if (copy.pageLayouts.length !== 1 || overflow) {
      const detail = overflow ? '内容超出纸张高度' : `渲染出 ${copy.pageLayouts.length} 页`
      throw new Error(
        `拼版要求每份标签恰好 1 页，第 ${i + 1} 份${detail}；请缩小内容或调整标签纸张高度`,
      )
    }
  })

  const tiled = composeTiledHtml({
    copies: copies.map(c => ({
      bound: c.bound,
      pageLayouts: c.pageLayouts,
      data: c.data,
      codeRenderer: c.codeRenderer,
    })),
    layout,
  })

  return {
    html: tiled.html,
    // 语义变更：pageCount = 实际输出张数（客户端任务历史、预览「共 N 页」都按此口径）
    pageCount: tiled.sheetCount,
    paperMm: { width: layout.sheet.width, height: layout.sheet.height },
    continuous: false,
    heightSource: 'config',
    // 调试用途；各份 pageIndex 均从 0 开始
    pageLayouts: copies.flatMap(c => c.pageLayouts),
    copies: copies.length,
  }
}

async function prepareSingleWithSession(
  job: PrintJob,
  session: PrintSession,
  data: Record<string, any>,
): Promise<SinglePrepared> {
  const bound = bindData(job.templateJson, data, job.baseUrl, job.fontBaseUrl)
  const continuous = isContinuousPaper(bound)
  const designPaper = getPaperDimensions(bound)
  const viewport = paperViewportPx(designPaper)
  const heightEscape = escapeHeightMm({ paperHeightMm: job.paperHeightMm, override: job.paperOverride })

  // 测量 HTML：先收集码值 → 渲染 → 用真实渲染器再生成
  const measurement = await buildHtmlWithCodes({
    bound, job, session, data, pageLayouts: [], isMeasurementPass: true,
  })
  const measurements = await session.measure(measurement.html, viewport)
  const pageLayouts = paginate(bound, normalizeMeasurements(measurements, bound))

  // 最终 HTML：补齐测量趟看不到的码值（页眉/页脚/首页叠加中的真实页码）
  const finalBuild = await buildHtmlWithCodes({
    bound, job, session, data, pageLayouts, isMeasurementPass: false, baseMap: measurement.map,
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
    html = generateHtml(bound, pageLayouts, data, {
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

  return {
    html,
    pageCount: pageLayouts.length,
    paperMm,
    continuous,
    heightSource,
    pageLayouts,
    copies: 1,
    bound,
    codeRenderer: finalBuild.codeRenderer,
    derivedHeightMm,
  }
}

interface BuildHtmlInput {
  bound: TemplateData
  job: PrintJob
  session: PrintSession
  /** 本份业务数据（单对象；数组已在入口拆分） */
  data: Record<string, any>
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
    const html = generateHtml(input.bound, input.pageLayouts, input.data, {
      isMeasurementPass: input.isMeasurementPass,
      codeRenderer: input.job.codeRenderer,
    })
    return { html, codeRenderer: input.job.codeRenderer, map: baseMap }
  }
  const collector = createCollectingCodeRenderer(baseMap)
  const draft = generateHtml(input.bound, input.pageLayouts, input.data, {
    isMeasurementPass: input.isMeasurementPass,
    codeRenderer: collector.renderer,
  })
  const extra = collector.takeSpecs()
  const rendered = extra.length > 0 ? await input.session.renderCodes(extra) : new Map<string, string>()
  const map = mergeCodeMaps(baseMap, rendered)
  const codeRenderer = map.size > 0 ? createMapCodeRenderer(map) : undefined
  if (extra.length === 0) return { html: draft, codeRenderer, map }
  const html = generateHtml(input.bound, input.pageLayouts, input.data, {
    isMeasurementPass: input.isMeasurementPass,
    codeRenderer,
  })
  return { html, codeRenderer, map }
}
