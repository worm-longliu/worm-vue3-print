// 客户端配置：userData/config.json。纯逻辑 + 文件读写，不直接依赖 electron，便于单测。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppConfig {
  /** 监听端口；默认 17521，启动时若被占用自动递增（实际端口见运行态） */
  port: number
  autoStart: boolean
  logLevel: LogLevel
  /** 排查用：保留每次打印生成的 PDF（默认关闭，打印完即删） */
  keepGeneratedPdf: boolean
  /** 保留 PDF 的目录；留空则用 userData/pdf */
  pdfOutputDir: string
  /** 安全开关：Origin 白名单 + 配对 token */
  securityEnabled: boolean
  allowedOrigins: string[]
  pairingToken: string
}

export const DEFAULT_CONFIG: AppConfig = {
  port: 17521,
  autoStart: false,
  logLevel: 'info',
  keepGeneratedPdf: false,
  pdfOutputDir: '',
  securityEnabled: false,
  allowedOrigins: [],
  pairingToken: '',
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

/** 校验是否为 http(s) Origin（白名单项）；'x' 这类非 URL 或非 http 协议一律拒绝 */
function isValidHttpOrigin(value: string): boolean {
  try {
    const u = new URL(value)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === value
  } catch {
    return false
  }
}

/** 生成 32 字节随机十六进制配对 token */
export function generatePairingToken(): string {
  return randomBytes(32).toString('hex')
}

/** 把任意外部输入解析为合法配置；逐字段校验，非法值回退默认 */
export function parseConfig(raw: unknown): AppConfig {
  const src = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const portNum = Number(src.port)
  const port =
    Number.isInteger(portNum) && portNum >= 1024 && portNum <= 65535
      ? portNum
      : DEFAULT_CONFIG.port
  const logLevel =
    typeof src.logLevel === 'string' && (LOG_LEVELS as readonly string[]).includes(src.logLevel)
      ? (src.logLevel as LogLevel)
      : DEFAULT_CONFIG.logLevel
  const allowedOrigins = Array.isArray(src.allowedOrigins)
    ? src.allowedOrigins.filter(
        (o): o is string => typeof o === 'string' && isValidHttpOrigin(o),
      )
    : []
  return {
    port,
    autoStart: src.autoStart === true,
    logLevel,
    keepGeneratedPdf: src.keepGeneratedPdf === true,
    pdfOutputDir: typeof src.pdfOutputDir === 'string' ? src.pdfOutputDir.trim() : DEFAULT_CONFIG.pdfOutputDir,
    securityEnabled: src.securityEnabled === true,
    allowedOrigins,
    pairingToken:
      typeof src.pairingToken === 'string' ? src.pairingToken : DEFAULT_CONFIG.pairingToken,
  }
}

export class ConfigStore {
  private cfg: AppConfig | null = null

  constructor(private readonly filePath: string) {}

  load(): AppConfig {
    try {
      if (existsSync(this.filePath)) {
        this.cfg = parseConfig(JSON.parse(readFileSync(this.filePath, 'utf-8')))
      } else {
        this.cfg = { ...DEFAULT_CONFIG }
        this.persist(this.cfg)
      }
    } catch {
      this.cfg = { ...DEFAULT_CONFIG }
    }
    return this.cfg
  }

  save(cfg: AppConfig): void {
    this.cfg = parseConfig(cfg)
    this.persist(this.cfg)
  }

  update(patch: Partial<AppConfig>): AppConfig {
    const base = this.cfg ?? this.load()
    this.save({ ...base, ...patch })
    return this.cfg!
  }

  get current(): AppConfig {
    return this.cfg ?? this.load()
  }

  private persist(cfg: AppConfig): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(cfg, null, 2), 'utf-8')
  }
}
