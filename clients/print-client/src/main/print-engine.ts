// 打印引擎：串行执行「校验目标打印机 →（core 管线渲染 / 直取预渲染 HTML）→ 出纸 → 记录」。
// 出纸统一走 HTML（Chromium 原生打印管线）；PDF 通路（系统命令）保留但不接线，见 ACTIVE_PRINT_ROUTE。
// 渲染与出图规格全部来自 core；本文件只做宿主装配、串行控制、落盘与路由分发。
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import {
  buildPdfTargetSpec,
  collectExecutorBundles,
  createDomHostRuntime,
  micrometersToMillimeters,
  millimetersToMicrometers,
  paperViewportPx,
  prepareDocument,
  renderPdf,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
// 部署白名单（设计文档 D3）：只做副作用注册，插件产物由 core 按注册表收集
import '@worm-vue3-print/echarts/node'
import type { PrintJob, PrintRuntime, PrintTemplateData } from '@worm-vue3-print/core'
import type { PrintOptions } from '@worm-vue3-print/core/client'
import type { Logger } from './logger.js'
import type { JobHistoryStore, JobRecord } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import { SerialGate } from './serial-gate.js'
import { ProtocolFailure } from './protocol-error.js'
import { buildPrintJobSettings } from './print-settings.js'
import { createElectronDriverFactory } from './driver-electron.js'
import {
  parsePrintSubmit,
  parsePrintSubmitHtml,
  readTemplateName,
  type HtmlPrintJob,
  type HtmlPrintOptions,
  type PrintSubmitSpec,
} from './request-validation.js'
import { printPdfFile } from './pdf-printer.js'
import { buildWebPrintOptions, printHtmlDocument } from './html-printer.js'
import { resolvePdfPath, shouldKeepPdf, type PdfOutputPolicy } from './pdf-output.js'

/**
 * 出纸路由：
 * - `html`（当前接线）：最终 HTML 直接进 Chromium 原生打印管线（webContents.print），与浏览器打印
 *   同源，纸张按 core 算出的 paperMm 显式声明；开启「保留生成的 PDF」时同步产出配对 PDF 供比对。
 * - `pdf`：core 渲染 → printToPDF → 系统命令出纸，仅 macOS / Linux（Windows 的 SumatraPDF 通路已移除）。
 */
export type PrintRoute = 'pdf' | 'html'

/**
 * 当前接线的出纸路由。PDF 通路的实现（pdf-printer）保留着，要回退只需把这里改成 'pdf'——
 * 差异仅在分发处，产物与记录口径相同。
 */
const ACTIVE_PRINT_ROUTE: PrintRoute = 'html'

/** PDF 生成预算：正常模板在 2s 内完成，超过即视为异常并释放串行锁 */
const PDF_GENERATION_TIMEOUT_MS = 30_000

/** 一次任务的渲染产物：HTML 始终有，PDF 仅在出纸路由或验证件策略需要时才有 */
interface Produced {
  html: string
  pdf?: Uint8Array
  paperMm: { width: number; height: number }
  heightSource: 'config' | 'derived'
  pageCount?: number
}

/**
 * core 运行时：Electron driver + core 的 DOM 执行器 + 注册表自动收集的扩展元素执行器。
 * 第三参保留 §4.3 旧 chartBundle 兼容位；新增插件只需在部署白名单里 import 一次。
 */
export function createPrintRuntime(): PrintRuntime {
  return createDomHostRuntime(
    createElectronDriverFactory(),
    loadExecutorBundle(),
    undefined,
    collectExecutorBundles(),
  )
}

/** 协议里的 print.paperSize 单位是微米；core 的覆盖逃生门用毫米 */
function toPaperOverride(paperSize?: { width?: number; height?: number }): PrintJob['paperOverride'] {
  const width = paperSize?.width && paperSize.width > 0 ? micrometersToMillimeters(paperSize.width) : undefined
  const height = paperSize?.height && paperSize.height > 0 ? micrometersToMillimeters(paperSize.height) : undefined
  return width || height ? { width, height } : undefined
}

export class PrintEngine {
  private readonly gate = new SerialGate()
  private readonly settledCbs = new Set<(record: JobRecord) => void>()

  /** 订阅任务最终结果（成功/失败均回调，已含落盘记录）；返回取消订阅函数 */
  onSettled(cb: (record: JobRecord) => void): () => void {
    this.settledCbs.add(cb)
    return () => {
      this.settledCbs.delete(cb)
    }
  }

  private emitSettled(record: JobRecord): void {
    for (const cb of this.settledCbs) cb(record)
  }

  constructor(
    private readonly deps: {
      printerService: PrinterService
      runtime: PrintRuntime
      history: JobHistoryStore
      logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
      /** 生成 PDF 的落盘策略（每次任务读取，支持运行期改配置）；缺省不保留 */
      pdfOutput?: () => PdfOutputPolicy
    },
  ) {}

  get isBusy(): boolean {
    return this.gate.isBusy
  }

  /** 处理 print.submit 原始 payload（客户端内渲染）；成功在出纸后 resolve */
  submit(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(async () => {
      const { spec, print, templateName } = parsePrintSubmit(raw)
      return this.runJob({
        name: readTemplateName(spec.templateJson, templateName),
        print,
        produce: needPdf => this.produceFromTemplate(spec, print as PrintOptions, needPdf),
      })
    })
  }

  /** 处理 print.submitHtml 原始 payload（浏览器预渲染 HTML，客户端不再渲染） */
  submitHtml(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(() => {
      const job = parsePrintSubmitHtml(raw)
      return this.runJob({
        name: job.templateName || '未命名模板',
        print: job.print,
        produce: needPdf => this.produceFromHtml(job, needPdf),
      })
    })
  }

  /** 模板渲染 + 出图：一个 driver 会话内完成测量、分页、连续纸探针与 PDF */
  private async produceFromTemplate(
    spec: PrintSubmitSpec,
    print: PrintOptions,
    needPdf: boolean,
  ): Promise<Produced> {
    const job: PrintJob = {
      templateJson: spec.templateJson as unknown as PrintTemplateData,
      printData: spec.printData,
      baseUrl: spec.baseUrl,
      fontBaseUrl: spec.fontBaseUrl,
      paperHeightMm: spec.paperHeightMm,
      paperOverride: toPaperOverride(print.paperSize),
      timeoutMs: PDF_GENERATION_TIMEOUT_MS,
    }
    // HTML 路由且不需要验证件时停在准备阶段，省掉一次 printToPDF
    const { pdf, prepared } = needPdf
      ? await renderPdf(job, this.deps.runtime)
      : { pdf: undefined, prepared: await prepareDocument(job, this.deps.runtime) }
    return {
      html: prepared.html,
      pdf,
      paperMm: prepared.paperMm,
      heightSource: prepared.heightSource,
      pageCount: prepared.pageCount,
    }
  }

  /** 预渲染 HTML 直提交：不跑管线，只复用 core 的出图规格与超时封装 */
  private async produceFromHtml(job: HtmlPrintJob, needPdf: boolean): Promise<Produced> {
    const heightSource: Produced['heightSource'] = job.continuous ? 'derived' : 'config'
    if (!needPdf) {
      return { html: job.html, paperMm: job.paperMm, heightSource, pageCount: job.pageCount }
    }
    const spec = buildPdfTargetSpec(job.paperMm)
    const pdf = await this.deps.runtime.withSession(
      { timeoutMs: PDF_GENERATION_TIMEOUT_MS },
      session => session.toPdf(job.html, spec, paperViewportPx(job.paperMm)),
    )
    return {
      html: job.html,
      pdf,
      paperMm: job.paperMm,
      heightSource,
      pageCount: job.pageCount,
    }
  }

  private async runJob(input: {
    name: string
    print: PrintOptions | HtmlPrintOptions
    produce: (needPdf: boolean) => Promise<Produced>
  }): Promise<{ jobId: string }> {
    const { printerService, history, logger } = this.deps
    const jobId = randomUUID()
    const route = ACTIVE_PRINT_ROUTE
    const policy: PdfOutputPolicy = this.deps.pdfOutput?.() ?? { keep: false, dir: '' }
    const keepPdf = shouldKeepPdf(policy)
    // PDF 路由必须出图；HTML 路由只在需要验证件时出图
    const needPdf = route === 'pdf' || keepPdf
    let pdfPath = ''
    let paperMicrometers = { width: 0, height: 0 }

    const target = await printerService.resolve((input.print as PrintOptions).printerName)
    const printOptions: PrintOptions = { ...input.print, printerName: target.name }
    const settings = buildPrintJobSettings(printOptions)

    try {
      logger.info('开始打印', { jobId, template: input.name, printer: target.name, route })
      const produced = await input.produce(needPdf)
      paperMicrometers = {
        width: millimetersToMicrometers(produced.paperMm.width),
        height: millimetersToMicrometers(produced.paperMm.height),
      }
      if (produced.pdf) pdfPath = this.savePdf(jobId, Buffer.from(produced.pdf), policy)
      logger.info('渲染完成', {
        jobId,
        route,
        pdfPath,
        size: produced.pdf?.length,
        keep: keepPdf,
        paper: produced.paperMm,
        heightSource: produced.heightSource,
        pages: produced.pageCount,
      })

      if (route === 'html') {
        await printHtmlDocument(
          produced.html,
          buildWebPrintOptions(printOptions, produced.paperMm),
          logger,
        )
      } else {
        // 出纸：显式声明纸张，避免驱动按队列默认纸张把横向页旋转成纵向
        if (!produced.pdf) throw new ProtocolFailure('PRINT_FAILED', 'PDF 路由未产出 PDF')
        await printPdfFile(pdfPath, {
          printerName: target.name,
          copies: settings.copies,
          paperName: settings.paperName,
          paper: produced.paperMm,
          logger,
        })
      }

      const record: JobRecord = {
        jobId,
        ts: new Date().toISOString(),
        templateName: input.name,
        printerName: target.name,
        printRoute: route,
        copies: settings.copies,
        paperMicrometers,
        paperHeightSource: produced.heightSource,
        outcome: 'success',
        ...(keepPdf && pdfPath ? { pdfPath } : {}),
      }
      history.append(record)
      this.emitSettled(record)
      logger.info('打印完成', { jobId })
      return { jobId }
    } catch (err) {
      const code = err instanceof ProtocolFailure ? err.code : 'PRINT_FAILED'
      const message = err instanceof Error ? err.message : '打印失败'
      const record: JobRecord = {
        jobId,
        ts: new Date().toISOString(),
        templateName: input.name,
        printerName: target?.name ?? printOptions.printerName ?? '',
        printRoute: route,
        copies: settings.copies,
        paperMicrometers,
        paperHeightSource: 'config',
        outcome: 'failed',
        errorCode: code,
        errorMessage: message,
        ...(keepPdf && pdfPath ? { pdfPath } : {}),
      }
      history.append(record)
      this.emitSettled(record)
      throw err instanceof ProtocolFailure ? err : new ProtocolFailure('PRINT_FAILED', message)
    } finally {
      if (pdfPath && !keepPdf) {
        try {
          rmSync(pdfPath, { force: true })
          logger.debug('临时 PDF 已清理', { pdfPath })
        } catch {
          // 忽略清理失败
        }
      }
    }
  }

  /** 保存 PDF：按策略写入临时目录（用完删除）或保留目录（供排查） */
  private savePdf(jobId: string, pdfBuffer: Buffer, policy: PdfOutputPolicy): string {
    const pdfPath = resolvePdfPath(jobId, policy)
    mkdirSync(dirname(pdfPath), { recursive: true })
    writeFileSync(pdfPath, pdfBuffer)
    return pdfPath
  }
}
