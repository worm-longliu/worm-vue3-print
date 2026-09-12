// 任务记录：userData/jobs.jsonl，每行一条 JSON，环形保留最新 limit 条。
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type JobOutcome = 'success' | 'failed'

export interface JobRecord {
  jobId: string
  ts: string
  templateName: string
  printerName: string
  copies: number
  paperMicrometers: { width: number; height: number }
  /** 纸高来源：config=任务显式指定，derived=按渲染内容高度推导 */
  paperHeightSource: 'config' | 'derived'
  outcome: JobOutcome
  errorCode?: string
  errorMessage?: string
}

export class JobHistoryStore {
  constructor(
    private readonly filePath: string,
    private readonly limit = 500,
  ) {}

  append(record: JobRecord): JobRecord[] {
    mkdirSync(dirname(this.filePath), { recursive: true })
    appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf-8')

    const all = this.list()
    if (all.length > this.limit) {
      const kept = all.slice(all.length - this.limit)
      writeFileSync(this.filePath, kept.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf-8')
      return kept
    }
    return all
  }

  list(): JobRecord[] {
    if (!existsSync(this.filePath)) return []
    const records: JobRecord[] = []
    const lines = readFileSync(this.filePath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        records.push(JSON.parse(trimmed) as JobRecord)
      } catch {
        // 跳过损坏行
      }
    }
    return records
  }
}
