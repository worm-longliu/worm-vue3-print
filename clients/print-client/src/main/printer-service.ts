// 打印机枚举与选择：Electron getPrintersAsync 结果归一化为协议结构。
// Electron API 通过构造函数注入，本文件除 fetchRaw 外均为纯逻辑，可在 Node 环境单测。
import type { PrinterInfo } from '@worm-vue3-print/core/client'
import { ProtocolFailure } from './protocol-error.js'

export interface RawPrinter {
  name: string
  isDefault?: boolean
  /** Windows 为 PRINTER_STATUS_* 位掩码；macOS/CUPS 通常为 0 */
  status?: number
}

export type NormalizedPrinterStatus = 'idle' | 'printing' | 'offline' | 'error' | 'unknown'

/** Windows 打印机状态位掩码（winspool PRINTER_STATUS_*） */
const WIN_STATUS = {
  ERROR: 0x00000002,
  OFFLINE: 0x00000080,
  PRINTING: 0x00000400,
} as const

export function describePrinterStatus(
  code: number,
  platform: NodeJS.Platform = process.platform,
): NormalizedPrinterStatus {
  if (platform !== 'win32') {
    return code === 0 ? 'idle' : 'unknown'
  }
  // 按严重度优先：硬件错误 → 脱机 → 打印中 → 空闲
  if (code & WIN_STATUS.ERROR) return 'error'
  if (code & WIN_STATUS.OFFLINE) return 'offline'
  if (code & WIN_STATUS.PRINTING) return 'printing'
  return code === 0 ? 'idle' : 'unknown'
}

export function normalizePrinters(
  raw: RawPrinter[],
  platform: NodeJS.Platform = process.platform,
): PrinterInfo[] {
  return raw.map(p => ({
    name: p.name,
    isDefault: p.isDefault === true,
    status: describePrinterStatus(p.status ?? 0, platform),
  }))
}

export class PrinterService {
  constructor(private readonly fetchRaw: () => Promise<RawPrinter[]>) {}

  async list(): Promise<PrinterInfo[]> {
    return normalizePrinters(await this.fetchRaw())
  }

  /** 解析实际打印目标；未指定名称时取系统默认打印机 */
  async resolve(printerName?: string): Promise<{ name: string; isDefault: boolean }> {
    const printers = await this.fetchRaw()
    if (printerName !== undefined) {
      const hit = printers.find(p => p.name === printerName)
      if (!hit) {
        throw new ProtocolFailure('PRINTER_NOT_FOUND', `打印机不存在：${printerName}`)
      }
      return { name: hit.name, isDefault: hit.isDefault === true }
    }
    const def = printers.find(p => p.isDefault === true)
    if (!def) {
      throw new ProtocolFailure(
        'PRINTER_NOT_FOUND',
        '系统未设置默认打印机，请在打印参数中指定 printerName',
      )
    }
    return { name: def.name, isDefault: true }
  }
}
