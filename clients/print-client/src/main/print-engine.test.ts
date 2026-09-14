// 打印引擎落盘行为：开启「保留生成的 PDF」时不删除，并写入任务记录
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JobRecord } from './job-history.js'

// 出纸命令替换为桩，避免单测真的调用 lp
vi.mock('./pdf-printer.js', () => ({
  printPdfFile: vi.fn(async () => undefined),
}))

const { PrintEngine } = await import('./print-engine.js')
const { JobHistoryStore } = await import('./job-history.js')

let workDir: string

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'wpc-engine-'))
})
afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function createEngine(policy: { keep: boolean; dir: string }) {
  const records: JobRecord[] = []
  const history = new JobHistoryStore(join(workDir, 'jobs.jsonl'), 100)
  const engine = new PrintEngine({
    printerService: {
      resolve: async (name?: string) => ({ name: name ?? '测试打印机', isDefault: true }),
    } as any,
    // core 运行时桩：只验证打印引擎的落盘/记录/出纸编排，渲染细节由 core 单测覆盖
    runtime: {
      withSession: async (_budget: unknown, fn: (session: unknown) => Promise<unknown>) =>
        fn({
          toPdf: async () => new Uint8Array(Buffer.from('%PDF-1.4 fake')),
          renderCodes: async () => new Map(),
          measure: async () => [],
          probeContentBottom: async () => 0,
          toScreenshot: async () => new Uint8Array(),
        }),
    } as any,
    history,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    pdfOutput: () => policy,
  })
  engine.onSettled((r) => records.push(r))
  return { engine, records, history }
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
    expect(records[0].pdfPath).toBeUndefined()
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
    expect(records[0].pdfPath).toBe(kept)
    expect(history.list()[0].pdfPath).toBe(kept)
  })
})
