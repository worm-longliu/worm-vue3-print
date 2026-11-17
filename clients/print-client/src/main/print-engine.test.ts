// 打印引擎落盘行为与出纸分发：出纸固定走 Chromium 原生打印（HTML），PDF 通路的系统命令不被接线；
// 「保留生成的 PDF」开启时才产出配对验证件。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JobRecord } from './job-history.js'
import { buildWebPrintOptions } from './html-printer.js'

// 系统命令出纸已被引擎断开，桩掉它是为了让「误接线」在单测里当场变红而不是打出真纸
vi.mock('./pdf-printer.js', () => ({
  printPdfFile: vi.fn(async () => undefined),
}))

// 只桩掉真正开窗口打印那一步，参数构造仍走真实实现
vi.mock('./html-printer.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./html-printer.js')>()
  return { ...actual, printHtmlDocument: vi.fn(async () => undefined) }
})

const { PrintEngine } = await import('./print-engine.js')
const { JobHistoryStore } = await import('./job-history.js')
const { printPdfFile } = await import('./pdf-printer.js')
const { printHtmlDocument } = await import('./html-printer.js')

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'wpc-engine-'))
})
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

function createEngine(policy: { keep: boolean; dir: string }) {
  const records: JobRecord[] = []
  const history = new JobHistoryStore(join(workDir, 'jobs.jsonl'), 100)
  const toPdf = vi.fn(async (_html: string, _spec: unknown, _viewport: unknown) => new Uint8Array(Buffer.from('%PDF-1.4 fake')))
  const engine = new PrintEngine({
    printerService: {
      resolve: async (name?: string) => ({ name: name ?? '测试打印机', isDefault: true }),
    } as any,
    // core 运行时桩：只验证打印引擎的落盘/记录/出纸编排，渲染细节由 core 单测覆盖
    runtime: {
      withSession: async (_budget: unknown, fn: (session: unknown) => Promise<unknown>) =>
        fn({
          toPdf,
          renderCodes: async () => new Map(),
          measure: async () => ({ measurements: [], fits: [] }),
          probeContentBottom: async () => 0,
        }),
    } as any,
    history,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    pdfOutput: () => policy,
  })
  engine.onSettled((r) => records.push(r))
  return { engine, records, history, toPdf }
}

const payload = {
  html: '<!DOCTYPE html><html><body>test</body></html>',
  paperMm: { width: 210, height: 297 },
  print: { printerName: '测试打印机' },
}

describe('PrintEngine 生成 PDF 的落盘策略', () => {
  it('默认（keep=false）：任务结束后删除临时 PDF，记录不含路径', async () => {
    const { engine, records } = createEngine({ keep: false, dir: join(workDir, 'pdf') })
    const { jobId } = await engine.submitHtml(payload)

    expect(records).toHaveLength(1)
    expect(records[0]?.pdfPath).toBeUndefined()
    // 临时目录中不应残留本次任务的 PDF
    const tmpPath = join(tmpdir(), 'worm-print-client-pdf', `${jobId}.pdf`)
    expect(existsSync(tmpPath)).toBe(false)
  })

  it('开启保留：PDF 落指定目录并写入任务记录', async () => {
    const dir = join(workDir, 'pdf')
    const { engine, records, history } = createEngine({ keep: true, dir })
    const { jobId } = await engine.submitHtml(payload)

    const kept = join(dir, `${jobId}.pdf`)
    expect(existsSync(kept)).toBe(true)
    expect(readFileSync(kept).toString()).toContain('%PDF')
    expect(records[0]?.pdfPath).toBe(kept)
    expect(history.list()[0]?.pdfPath).toBe(kept)
  })
})

describe('PrintEngine 出纸分发', () => {
  it('模板直打也保留横纵混排，方向覆盖冲突在出纸前被拒绝', async () => {
    const { engine } = createEngine({ keep: false, dir: join(workDir, 'pdf') })
    const page = {
      paperSize: 'A4', orientation: 'landscape', unit: 'mm',
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] }, elements: [],
    }
    const job = { templateJson: { pages: [page, { ...page, orientation: 'portrait' }] }, print: { copies: 2 } }
    await engine.submit(job)
    expect(printHtmlDocument).toHaveBeenCalledTimes(1)
    const [html, options] = vi.mocked(printHtmlDocument).mock.calls[0]!
    expect(html).toContain('@page mt-0 { size: 297mm 210mm;')
    expect(html).toContain('@page mt-1 { size: 210mm 297mm;')
    expect(options).toMatchObject({ copies: 2, pageSize: { width: 210000, height: 297000 } })
    await expect(engine.submit({ ...job, print: { landscape: false } })).rejects.toThrow('混排')
    expect(printHtmlDocument).toHaveBeenCalledTimes(1)
  })

  it('预渲染混排仍为一次打印作业，保留 PDF 按页采用 CSS 纸张', async () => {
    const { engine, toPdf } = createEngine({ keep: true, dir: join(workDir, 'pdf') })
    await engine.submitHtml({
      ...payload,
      paperMm: { width: 297, height: 210 },
      pagePaperMm: [{ width: 297, height: 210 }, { width: 210, height: 297 }],
      pageCount: 2,
    })
    expect(printHtmlDocument).toHaveBeenCalledTimes(1)
    expect(vi.mocked(printHtmlDocument).mock.calls[0]![1].pageSize).toEqual({ width: 210000, height: 297000 })
    expect(toPdf.mock.calls[0]![1]).toMatchObject({ preferCSSPageSize: true })
  })

  it('出纸只走 Chromium 原生打印，并按 paperMm 声明微米纸张；系统命令不被调用', async () => {
    const dir = join(workDir, 'pdf')
    const { engine, records } = createEngine({ keep: false, dir })
    const { jobId } = await engine.submitHtml(payload)

    expect(printHtmlDocument).toHaveBeenCalledTimes(1)
    const [html, options] = (printHtmlDocument as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(html).toContain('<body>test</body>')
    expect(options).toEqual(buildWebPrintOptions(payload.print, payload.paperMm))
    expect(printPdfFile).not.toHaveBeenCalled()
    expect(existsSync(join(dir, `${jobId}.pdf`))).toBe(false)
    expect(records[0]?.pdfPath).toBeUndefined()
    expect(records[0]?.printRoute).toBe('html')
  })

  it('未开启保留时不出图：渲染只到准备阶段，记录仍带纸张与页数', async () => {
    const { engine, records } = createEngine({ keep: false, dir: join(workDir, 'pdf') })
    await engine.submitHtml(payload)

    expect(records[0]?.paperMicrometers).toEqual({ width: 210000, height: 297000 })
    expect(records[0]?.outcome).toBe('success')
  })

  it('开启保留时产出配对验证件：出纸走 HTML，PDF 仅落盘供比对', async () => {
    const dir = join(workDir, 'pdf')
    const { engine, records } = createEngine({ keep: true, dir })
    const { jobId } = await engine.submitHtml(payload)

    const kept = join(dir, `${jobId}.pdf`)
    expect(readFileSync(kept).toString()).toContain('%PDF')
    expect(printHtmlDocument).toHaveBeenCalledTimes(1)
    expect(printPdfFile).not.toHaveBeenCalled()
    expect(records[0]?.pdfPath).toBe(kept)
  })

  it('出纸失败：记录失败原因与路由', async () => {
    ;(printHtmlDocument as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('驱动无响应'))
    const { engine, records } = createEngine({ keep: false, dir: join(workDir, 'pdf') })
    await expect(engine.submitHtml(payload)).rejects.toThrow('驱动无响应')

    expect(records[0]?.outcome).toBe('failed')
    expect(records[0]?.errorMessage).toContain('驱动无响应')
    expect(records[0]?.printRoute).toBe('html')
  })
})
