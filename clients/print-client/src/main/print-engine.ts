// 打印引擎：串行执行「校验目标打印机 →（core 管线渲染 / 直取预渲染 HTML）→ 生成 PDF → 打印 PDF → 记录」。
// 渲染与出图规格全部来自 core；本文件只做宿主装配、串行控制、落盘与系统打印。
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import {
  buildPdfTargetSpec,
  createDomHostRuntime,
  micrometersToMillimeters,
  millimetersToMicrometers,
  paperViewportPx,
  renderPdf,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import type { PrintJob, PrintRuntime, PrintTemplateData } from '@worm-vue3-print/core'
import type { PrintOptions } from '@worm-vue3-print/client'
import type { Logger } from './logger.js'
import type { JobHistoryStore, JobRecord } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import { SerialGate } from './serial-gate.js'
import { ProtocolFailure } from './protocol-error.js'
import { collectMissingFonts } from './font-warning.js'
import type { FontService } from './font-service.js'
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
import { resolvePdfPath, shouldKeepPdf, type PdfOutputPolicy } from './pdf-output.js'

/** PDF 生成预算：正常模板在 2s 内完成，超过即视为异常并释放串行锁 */
const PDF_GENERATION_TIMEOUT_MS = 30_000

interface ProducedPdf {
  pdf: Uint8Array
  paperMm: { width: number; height: number }
  heightSource: 'config' | 'derived'
  pageCount?: number
}

/** core 运行时：Electron driver + core 的 DOM 执行器产物 */
export function createPrintRuntime(): PrintRuntime {
  return createDomHostRuntime(createElectronDriverFactory(), loadExecutorBundle())
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
      /** 字体清单服务；缺省跳过出图前字体校验 */
      fontService?: FontService
    },
  ) {}

  get isBusy(): boolean {
    return this.gate.isBusy
  }

  /** 出图前字体校验：只记警告，绝不阻断——字体缺失时 Chromium 会自行回退 */
  private async warnMissingFonts(templateJson: unknown): Promise<void> {
    const { fontService, logger } = this.deps
    if (!fontService) return
    try {
      const missing = collectMissingFonts(templateJson, await fontService.list())
      if (!missing.length) return
      logger.warn('模板字体在本机缺失，将回退到默认字体', {
        families: missing.map(m => m.family),
      })
    } catch (error) {
      // 诊断能力失效不应影响打印
      logger.debug('字体校验失败', { error: String(error) })
    }
  }

  /** 处理 print.submit 原始 payload（客户端内渲染）；成功在出纸后 resolve */
  submit(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(async () => {
      const { spec, print, templateName } = parsePrintSubmit(raw)
      await this.warnMissingFonts(spec.templateJson)
      return this.runJob({
        name: readTemplateName(spec.templateJson, templateName),
        print,
        produce: () => this.produceFromTemplate(spec, print as PrintOptions),
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
        produce: () => this.produceFromHtml(job),
      })
    })
  }

  /** 模板渲染 + 出图：一个 driver 会话内完成测量、分页、连续纸探针与 PDF */
  private async produceFromTemplate(spec: PrintSubmitSpec, print: PrintOptions): Promise<ProducedPdf> {
    const job: PrintJob = {
      templateJson: spec.templateJson as unknown as PrintTemplateData,
      printData: spec.printData,
      baseUrl: spec.baseUrl,
      fontBaseUrl: spec.fontBaseUrl,
      paperHeightMm: spec.paperHeightMm,
      paperOverride: toPaperOverride(print.paperSize),
      timeoutMs: PDF_GENERATION_TIMEOUT_MS,
    }
    const { pdf, prepared } = await renderPdf(job, this.deps.runtime)
    return {
      pdf,
      paperMm: prepared.paperMm,
      heightSource: prepared.heightSource,
      pageCount: prepared.pageCount,
    }
  }

  /** 预渲染 HTML 直提交：不跑管线，只复用 core 的出图规格与超时封装 */
  private async produceFromHtml(job: HtmlPrintJob): Promise<ProducedPdf> {
    const spec = buildPdfTargetSpec(job.paperMm)
    const pdf = await this.deps.runtime.withSession(
      { timeoutMs: PDF_GENERATION_TIMEOUT_MS },
      session => session.toPdf(job.html, spec, paperViewportPx(job.paperMm)),
    )
    return {
      pdf,
      paperMm: job.paperMm,
      heightSource: job.continuous ? 'derived' : 'config',
      pageCount: job.pageCount,
    }
  }

  private async runJob(input: {
    name: string
    print: PrintOptions | HtmlPrintOptions
    produce: () => Promise<ProducedPdf>
  }): Promise<{ jobId: string }> {
    const { printerService, history, logger } = this.deps
    const jobId = randomUUID()
    const policy: PdfOutputPolicy = this.deps.pdfOutput?.() ?? { keep: false, dir: '' }
    const keepPdf = shouldKeepPdf(policy)
    let pdfPath = ''
    let paperMicrometers = { width: 0, height: 0 }

    const target = await printerService.resolve((input.print as PrintOptions).printerName)
    const printOptions: PrintOptions = { ...input.print, printerName: target.name }
    const settings = buildPrintJobSettings(printOptions)

    try {
      logger.info('开始打印', { jobId, template: input.name, printer: target.name })
      const produced = await input.produce()
      paperMicrometers = {
        width: millimetersToMicrometers(produced.paperMm.width),
        height: millimetersToMicrometers(produced.paperMm.height),
      }
      pdfPath = this.savePdf(jobId, Buffer.from(produced.pdf), policy)
      logger.info('PDF 生成完成', {
        jobId,
        pdfPath,
        size: produced.pdf.length,
        keep: keepPdf,
        paper: produced.paperMm,
        heightSource: produced.heightSource,
        pages: produced.pageCount,
      })

      // 出纸：显式声明纸张，避免驱动按队列默认纸张把横向页旋转成纵向
      await printPdfFile(pdfPath, {
        printerName: target.name,
        copies: settings.copies,
        paperName: settings.paperName,
        paper: produced.paperMm,
        logger,
      })

      const record: JobRecord = {
        jobId,
        ts: new Date().toISOString(),
        templateName: input.name,
        printerName: target.name,
        copies: settings.copies,
        paperMicrometers,
        paperHeightSource: produced.heightSource,
        outcome: 'success',
        ...(keepPdf ? { pdfPath } : {}),
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
