import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JobHistoryStore, type JobRecord } from './job-history.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wpc-history-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function makeRec(jobId: string): JobRecord {
  return {
    jobId,
    ts: new Date().toISOString(),
    templateName: '销售小票',
    printerName: '热敏-80',
    copies: 1,
    paperMicrometers: { width: 80000, height: 120000 },
    paperHeightSource: 'derived',
    outcome: 'success',
  }
}

describe('JobHistoryStore', () => {
  it('append 落盘为 JSONL 且 list 可读回', () => {
    const file = join(dir, 'jobs.jsonl')
    const store = new JobHistoryStore(file)
    store.append(makeRec('j1'))
    store.append({
      ...makeRec('j2'),
      outcome: 'failed',
      errorCode: 'PRINT_FAILED',
      errorMessage: '脱机',
    })

    const lines = readFileSync(file, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const list = store.list()
    expect(list.map(r => r.jobId)).toEqual(['j1', 'j2'])
    expect(list[1]!.errorCode).toBe('PRINT_FAILED')
  })

  it('超过上限环形裁剪，只保留最新 limit 条（按写入顺序）', () => {
    const file = join(dir, 'jobs.jsonl')
    const store = new JobHistoryStore(file, 3)
    for (let i = 1; i <= 5; i++) store.append(makeRec(`j${i}`))
    expect(store.list().map(r => r.jobId)).toEqual(['j3', 'j4', 'j5'])
  })

  it('文件不存在时 list 返回空数组；坏行被跳过', () => {
    const store = new JobHistoryStore(join(dir, 'none.jsonl'))
    expect(store.list()).toEqual([])
    const file2 = join(dir, 'bad.jsonl')
    const store2 = new JobHistoryStore(file2)
    store2.append(makeRec('ok'))
    appendFileSync(file2, 'not-json\n')
    expect(store2.list().map(r => r.jobId)).toEqual(['ok'])
  })
})
