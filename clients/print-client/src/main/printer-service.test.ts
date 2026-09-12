import { describe, it, expect } from 'vitest'
import {
  PrinterService,
  describePrinterStatus,
  normalizePrinters,
} from './printer-service.js'

const RAW = [
  { name: '针式-发票', isDefault: false, status: 0 },
  { name: '热敏-80', isDefault: true, status: 0 },
]

describe('describePrinterStatus', () => {
  it('非 Windows 平台只区分 idle 与 unknown', () => {
    expect(describePrinterStatus(0, 'darwin')).toBe('idle')
    expect(describePrinterStatus(0, 'linux')).toBe('idle')
    expect(describePrinterStatus(99, 'darwin')).toBe('unknown')
  })

  it('Windows 按位掩码识别 offline/error/printing/idle', () => {
    // PRINTER_STATUS_ERROR = 0x2，OFFLINE = 0x80，PRINTING = 0x400
    expect(describePrinterStatus(0x00000002, 'win32')).toBe('error')
    expect(describePrinterStatus(0x00000080, 'win32')).toBe('offline')
    expect(describePrinterStatus(0x00000400, 'win32')).toBe('printing')
    expect(describePrinterStatus(0, 'win32')).toBe('idle')
  })
})

describe('normalizePrinters', () => {
  it('映射为协议 PrinterInfo（名称/默认/状态字符串）', () => {
    expect(normalizePrinters(RAW, 'darwin')).toEqual([
      { name: '针式-发票', isDefault: false, status: 'idle' },
      { name: '热敏-80', isDefault: true, status: 'idle' },
    ])
  })
})

describe('PrinterService.resolve', () => {
  it('未指定打印机时返回系统默认', async () => {
    const svc = new PrinterService(async () => RAW)
    expect(await svc.resolve()).toEqual({ name: '热敏-80', isDefault: true })
  })

  it('指定名称精确匹配', async () => {
    const svc = new PrinterService(async () => RAW)
    expect(await svc.resolve('针式-发票')).toEqual({ name: '针式-发票', isDefault: false })
  })

  it('指定的打印机不存在时抛 PRINTER_NOT_FOUND', async () => {
    const svc = new PrinterService(async () => RAW)
    await expect(svc.resolve('不存在')).rejects.toMatchObject({ code: 'PRINTER_NOT_FOUND' })
  })

  it('无默认打印机且未指定名称时抛 PRINTER_NOT_FOUND', async () => {
    const svc = new PrinterService(async () => [{ name: 'A', status: 0 }])
    await expect(svc.resolve()).rejects.toMatchObject({ code: 'PRINTER_NOT_FOUND' })
  })
})
