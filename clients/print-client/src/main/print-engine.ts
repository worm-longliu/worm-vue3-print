// 打印引擎：串行执行「校验目标打印机 →（渲染 / 直取预渲染 HTML）→ 生成 PDF → 打印 PDF → 记录」。
// 采用 PDF 中间方案：先用 Electron 生成 PDF（复用 Chromium 渲染引擎，与服务端 Playwright 一致），
// 再调用系统命令打印 PDF，避免 webContents.print() 直接打印时的水印位置偏移和渲染异常。
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import type { PrintOptions } from '@worm-vue3-print/client'
import type { Logger } from './logger.js'
import type { JobHistoryStore, JobRecord } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import { buildWebPrintSettings } from './render-engine.js'
import type { RenderEngine } from './render-engine.js'
import type { RendererPool } from './renderer-pool.js'
import { SerialGate } from './serial-gate.js'
import { ProtocolFailure } from './protocol-error.js'
import {
  parsePrintSubmit,
  parsePrintSubmitHtml,
  readTemplateName,
  type HtmlPrintOptions,
} from './request-validation.js'
import { printPdfFile } from './pdf-printer.js'
import { renderPdf } from './pdf-generator.js'

const FONTS_READY_TIMEOUT_MS = 5000
// PDF 生成超时：正常模板在 1s 内完成，超过即视为异常并释放串行锁
const PDF_GENERATION_TIMEOUT_MS = 30_000
// PDF 临时文件目录
const PDF_TEMP_DIR = join(tmpdir(), 'worm-print-client-pdf')

interface PreparedJob {
  html: string
  paper: { width: number; height: number }
  heightSource: 'config' | 'derived'
  pageCount?: number
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
      renderEngine: RenderEngine
      pool: RendererPool
      history: JobHistoryStore
      logger: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
    },
  ) {}

  get isBusy(): boolean {
    return this.gate.isBusy
  }

  /** 处理 print.submit 原始 payload（客户端内渲染）；成功在出纸回调后才 resolve */
  submit(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(() => {
      const { spec, print, templateName } = parsePrintSubmit(raw)
      const name = readTemplateName(spec.templateJson, templateName)
      return this.runJob({
        name,
        print,
        prepare: async () => {
          const prepared = await this.deps.renderEngine.prepare(spec, print)
          return {
            html: prepared.html,
            paper: prepared.paper,
            heightSource: prepared.heightSource,
            pageCount: prepared.pageCount,
          }
        },
      })
    })
  }

  /** 处理 print.submitHtml 原始 payload（浏览器预渲染 HTML，客户端不再渲染） */
  submitHtml(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(() => {
      const job = parsePrintSubmitHtml(raw)
      const MM_TO_UM = 1000
      const prepared: PreparedJob = {
        html: job.html,
        paper: {
          width: Math.round(job.paperMm.width * MM_TO_UM),
          height: Math.round(job.paperMm.height * MM_TO_UM),
        },
        // 连续纸高度来自浏览器探针推导，其余为模板纸张，均不可在协议层覆盖
        heightSource: job.continuous ? 'derived' : 'config',
        pageCount: job.pageCount,
      }
      return this.runJob({
        name: job.templateName || '未命名模板',
        print: job.print,
        prepare: async () => prepared,
      })
    })
  }

  private async runJob(input: {
    name: string
    print: PrintOptions | HtmlPrintOptions
    prepare: () => Promise<PreparedJob>
  }): Promise<{ jobId: string }> {
    const { printerService, pool, history, logger } = this.deps
    const jobId = randomUUID()
    let pdfPath = ''

    const target = await printerService.resolve(
      (input.print as PrintOptions).printerName,
    )
    const printOptions: PrintOptions = { ...input.print, printerName: target.name }
    const prepared = await input.prepare()
    const settings = buildWebPrintSettings(printOptions, prepared.paper)

    logger.info('开始打印', {
      jobId,
      template: input.name,
      printer: target.name,
      paper: prepared.paper,
      heightSource: prepared.heightSource,
      pages: prepared.pageCount,
    })

    const win = await pool.loadPrintHtml(prepared.html)
    try {
      // 等待字体和图片就绪
      await this.waitReady(win.webContents)

      // 生成 PDF（Electron printToPDF，复用 Chromium 渲染引擎，与服务端 Playwright 一致）
      const pdfBuffer = await renderPdf(win.webContents, prepared.paper, PDF_GENERATION_TIMEOUT_MS)
      pdfPath = this.savePdfToTemp(jobId, pdfBuffer)
      logger.info('PDF 生成完成', { jobId, pdfPath, size: pdfBuffer.length })

      // 关闭渲染窗口（PDF 已生成，不再需要窗口）
      if (!win.isDestroyed()) win.close()

      // 调用系统命令打印 PDF
      // paper 用于向 CUPS 声明纸张：不声明时驱动按默认纸张处理会把横向页旋转成纵向
      await printPdfFile(pdfPath, {
        printerName: target.name,
        copies: settings.copies,
        paperName: typeof settings.pageSize === 'string' ? settings.pageSize : undefined,
        paper: {
          width: prepared.paper.width / 1000,
          height: prepared.paper.height / 1000,
        },
        logger,
      })

      const record: JobRecord = {
        jobId,
        ts: new Date().toISOString(),
        templateName: input.name,
        printerName: target.name,
        copies: settings.copies,
        paperMicrometers: prepared.paper,
        paperHeightSource: prepared.heightSource,
        outcome: 'success',
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
        copies: printOptions.copies ?? 1,
        paperMicrometers: prepared?.paper ?? { width: 0, height: 0 },
        paperHeightSource: prepared?.heightSource ?? 'config',
        outcome: 'failed',
        errorCode: code,
        errorMessage: message,
      }
      history.append(record)
      this.emitSettled(record)
      throw err instanceof ProtocolFailure ? err : new ProtocolFailure('PRINT_FAILED', message)
    } finally {
      if (!win.isDestroyed()) win.close()
      // 清理临时 PDF 文件
      if (pdfPath) {
        try {
          rmSync(pdfPath, { force: true })
          logger.debug('临时 PDF 已清理', { pdfPath })
        } catch {
          // 忽略清理失败
        }
      }
    }
  }

  /** 保存 PDF 到临时目录 */
  private savePdfToTemp(jobId: string, pdfBuffer: Buffer): string {
    mkdirSync(PDF_TEMP_DIR, { recursive: true })
    const pdfPath = join(PDF_TEMP_DIR, `${jobId}.pdf`)
    writeFileSync(pdfPath, pdfBuffer)
    return pdfPath
  }

  /** 等待字体与图片就绪（带兜底超时，不阻塞打印） */
  private waitReady(wc: Electron.WebContents): Promise<void> {
    return Promise.race([
      wc.executeJavaScript(
        `Promise.all([document.fonts ? document.fonts.ready : true,`
          + ` Promise.all(Array.from(document.images).filter(i => !i.complete)`
          + `   .map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })))])`,
      ),
      new Promise<void>(r => setTimeout(r, FONTS_READY_TIMEOUT_MS)),
    ])
  }
}
