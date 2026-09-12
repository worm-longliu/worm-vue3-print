// 分级日志：stdout + 可选文件（每行一条 JSON）+ 订阅广播（配置窗口实时日志）。
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LogLevel } from './config.js'

export interface LogEntry {
  ts: string
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LoggerOptions {
  level: LogLevel
  filePath?: string
  stdout?: (line: string) => void
}

export class Logger {
  private level: LogLevel
  private readonly cbs = new Set<(entry: LogEntry) => void>()

  constructor(private readonly opts: LoggerOptions) {
    this.level = opts.level
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }

  onLog(cb: (entry: LogEntry) => void): () => void {
    this.cbs.add(cb)
    return () => this.cbs.delete(cb)
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta)
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta)
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta)
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta)
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {}),
    }
    const line = JSON.stringify(entry)
    ;(this.opts.stdout ?? console.log)(line)
    if (this.opts.filePath) {
      try {
        mkdirSync(dirname(this.opts.filePath), { recursive: true })
        appendFileSync(this.opts.filePath, line + '\n', 'utf-8')
      } catch {
        // 日志写盘失败不影响主流程
      }
    }
    for (const cb of this.cbs) cb(entry)
  }
}
