// PDF 打印工具：调用系统命令打印 PDF 文件
// 支持 macOS (lp/lpr)、Windows (SumatraPDF)、Linux (lp/lpr)
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Logger } from './logger.js'

const execFileAsync = promisify(execFile)

export interface PdfPrintOptions {
  printerName?: string
  copies?: number
  /** 纸张尺寸名称，如 "A4"、"Letter" */
  paperName?: string
  /** 是否双面打印 */
  duplex?: boolean
  /** 日志记录器 */
  logger?: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
}

/**
 * 打印 PDF 文件
 * 根据操作系统调用相应的系统命令
 */
export async function printPdfFile(
  pdfPath: string,
  options: PdfPrintOptions = {},
): Promise<void> {
  const platform = process.platform
  const { printerName, copies = 1, paperName, duplex, logger } = options

  logger?.info('开始打印 PDF', { pdfPath, platform, printerName, copies })

  try {
    if (platform === 'darwin') {
      await printOnMac(pdfPath, { printerName, copies, paperName, duplex, logger })
    } else if (platform === 'win32') {
      await printOnWindows(pdfPath, { printerName, copies, logger })
    } else if (platform === 'linux') {
      await printOnLinux(pdfPath, { printerName, copies, paperName, duplex, logger })
    } else {
      throw new Error(`不支持的操作系统平台: ${platform}`)
    }
    logger?.info('PDF 打印完成', { pdfPath })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger?.error('PDF 打印失败', { pdfPath, error: message })
    throw err
  }
}

/** macOS: 使用 lp 命令打印 */
async function printOnMac(
  pdfPath: string,
  options: PdfPrintOptions,
): Promise<void> {
  const { printerName, copies = 1, paperName, duplex } = options
  const args: string[] = []

  if (printerName) {
    args.push('-d', printerName)
  }
  args.push('-n', String(copies))

  if (paperName) {
    args.push('-o', `media=${paperName}`)
  }
  if (duplex) {
    args.push('-o', 'sides=two-sided-long-edge')
  }

  args.push(pdfPath)

  await execFileAsync('lp', args, { timeout: 30000 })
}

/** Windows: 使用 SumatraPDF 打印（需要预装） */
async function printOnWindows(
  pdfPath: string,
  options: PdfPrintOptions,
): Promise<void> {
  const { printerName, copies = 1 } = options

  // SumatraPDF 路径（常见安装位置）
  const sumatraPaths = [
    'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
    'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\SumatraPDF\\SumatraPDF.exe` : '',
  ].filter(Boolean)

  let sumatraPath = ''
  for (const p of sumatraPaths) {
    try {
      const { statSync } = await import('node:fs')
      statSync(p)
      sumatraPath = p
      break
    } catch {
      // 继续尝试下一个路径
    }
  }

  if (!sumatraPath) {
    throw new Error(
      '未找到 SumatraPDF，请安装 SumatraPDF 或使用其他 PDF 打印方案。'
      + '下载地址: https://www.sumatrapdfreader.org/',
    )
  }

  const args = ['-print-to']
  if (printerName) {
    args.push(printerName)
  } else {
    args.push('default')
  }
  args.push('-print-settings', `${copies}x`)
  args.push('-silent')
  args.push(pdfPath)

  await execFileAsync(sumatraPath, args, { timeout: 60000 })
}

/** Linux: 使用 lp 命令打印 */
async function printOnLinux(
  pdfPath: string,
  options: PdfPrintOptions,
): Promise<void> {
  const { printerName, copies = 1, paperName, duplex } = options
  const args: string[] = []

  if (printerName) {
    args.push('-d', printerName)
  }
  args.push('-n', String(copies))

  if (paperName) {
    args.push('-o', `media=${paperName}`)
  }
  if (duplex) {
    args.push('-o', 'sides=two-sided-long-edge')
  }

  args.push(pdfPath)

  await execFileAsync('lp', args, { timeout: 30000 })
}
