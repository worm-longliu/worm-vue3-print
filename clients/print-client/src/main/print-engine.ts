// 打印引擎：串行执行「校验目标打印机 → 两遍渲染 → 载入打印窗口 → 静默出纸 → 记录」。
import { randomUUID } from 'node:crypto'
import type { PrintOptions } from '@worm-vue3-print/client'
import type { Logger } from './logger.js'
import type { JobHistoryStore, JobRecord } from './job-history.js'
import type { PrinterService } from './printer-service.js'
import { buildWebPrintSettings, type WebPrintSettings } from './render-engine.js'
import type { RenderEngine } from './render-engine.js'
import type { RendererPool } from './renderer-pool.js'
import { SerialGate } from './serial-gate.js'
import { ProtocolFailure } from './protocol-error.js'
import { parsePrintSubmit, readTemplateName } from './request-validation.js'

const FONTS_READY_TIMEOUT_MS = 5000

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
      logger: Pick<Logger, 'info' | 'warn' | 'error'>
    },
  ) {}

  get isBusy(): boolean {
    return this.gate.isBusy
  }

  /** 处理 print.submit 原始 payload；成功在出纸回调后才 resolve */
  submit(raw: unknown): Promise<{ jobId: string }> {
    return this.gate.run(() => this.runJob(raw))
  }

  private async runJob(raw: unknown): Promise<{ jobId: string }> {
    const { spec, print } = parsePrintSubmit(raw)
    const jobId = randomUUID()
    const { printerService, renderEngine, pool, history, logger } = this.deps

    const target = await printerService.resolve(print.printerName)
    const printOptions: PrintOptions = { ...print, printerName: target.name }
    const prepared = await renderEngine.prepare(spec, printOptions)
    const settings = buildWebPrintSettings(printOptions, prepared.paper)

    logger.info('开始打印', {
      jobId,
      template: readTemplateName(spec.templateJson),
      printer: target.name,
      paper: prepared.paper,
      heightSource: prepared.heightSource,
      pages: prepared.pageCount,
    })

    const win = await pool.loadPrintHtml(prepared.html)
    try {
      await this.waitReady(win.webContents)
      await this.silentPrint(win.webContents, settings)
      const record: JobRecord = {
        jobId,
        ts: new Date().toISOString(),
        templateName: readTemplateName(spec.templateJson),
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
        templateName: readTemplateName(spec.templateJson),
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
    }
  }

  /** 等待字体与图片就绪（带兜底超时，不阻塞打印） */
  private async waitReady(wc: Electron.WebContents): Promise<void> {
    await Promise.race([
      wc.executeJavaScript(
        `Promise.all([document.fonts ? document.fonts.ready : true,`
          + ` Promise.all(Array.from(document.images).filter(i => !i.complete)`
          + `   .map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })))])`,
      ),
      new Promise<void>(r => setTimeout(r, FONTS_READY_TIMEOUT_MS)),
    ])
  }

  private silentPrint(wc: Electron.WebContents, settings: WebPrintSettings): Promise<void> {
    return new Promise((resolve, reject) => {
      wc.print(settings as Electron.WebContentsPrintOptions, (success, failureReason) => {
        if (success) {
          resolve()
          return
        }
        const reason = String(failureReason ?? '').toLowerCase()
        const code =
          reason.includes('offline') || reason.includes('unavailable') || reason.includes('not available')
            ? 'PRINTER_OFFLINE'
            : 'PRINT_FAILED'
        reject(new ProtocolFailure(code, `打印失败：${failureReason || '未知原因'}`))
      })
    })
  }
}
