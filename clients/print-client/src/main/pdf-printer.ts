// PDF 打印工具：调用系统命令打印 PDF 文件
// 支持 macOS (lp)、Windows (SumatraPDF)、Linux (lp)
//
// 已实测的坑：必须显式声明纸张（`-o media=…`）。不声明时 CUPS 按队列默认纸张
// （多为纵向 A4）处理，横向页面会被 pdftopdf 旋转成 `/Rotate 90`，出纸方向与浏览器/
// 服务端预览不一致。纸张名优先用宿主指定的驱动纸型（`paperName`），否则按页面尺寸
// 匹配标准纸型，再不匹配则用 `Custom.<宽>x<高>`（单位：点）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Logger } from './logger.js'

const execFileAsync = promisify(execFile)

/** 1mm = 72/25.4 点（PDF/CUPS 长度单位） */
export const PT_PER_MM = 72 / 25.4

/** 标准纸型（mm），用于把页面尺寸映射成驱动可识别的纸张名 */
const STANDARD_MEDIA: ReadonlyArray<{ name: string; width: number; height: number }> = [
  { name: 'A3', width: 297, height: 420 },
  { name: 'A4', width: 210, height: 297 },
  { name: 'A5', width: 148, height: 210 },
  { name: 'Letter', width: 215.9, height: 279.4 },
  { name: 'Legal', width: 215.9, height: 355.6 },
]

/** 尺寸匹配容差（mm）：驱动/渲染的取整误差范围内按标准纸型处理 */
const MEDIA_TOLERANCE_MM = 2

export interface PdfPrintOptions {
  printerName?: string
  copies?: number
  /** 驱动纸型名（如针式打印机的预置纸型）；优先于按尺寸推断 */
  paperName?: string
  /** 页面尺寸（mm）；用于向 CUPS 声明纸张，避免横向页被旋转成纵向 */
  paper?: { width: number; height: number }
  /** 是否双面打印 */
  duplex?: boolean
  /** 日志记录器 */
  logger?: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'>
}

/** 页面尺寸 → CUPS `media` 选项值；无法确定时返回 undefined（交给驱动默认） */
export function resolveMediaOption(
  paper?: { width: number; height: number },
  paperName?: string,
): string | undefined {
  const named = paperName?.trim()
  if (named) return `media=${named}`
  if (!paper || !(paper.width > 0) || !(paper.height > 0)) return undefined

  const shortSide = Math.min(paper.width, paper.height)
  const longSide = Math.max(paper.width, paper.height)
  const matched = STANDARD_MEDIA.find(
    (m) =>
      Math.abs(Math.min(m.width, m.height) - shortSide) <= MEDIA_TOLERANCE_MM
      && Math.abs(Math.max(m.width, m.height) - longSide) <= MEDIA_TOLERANCE_MM,
  )
  if (matched) return `media=${matched.name}`

  const round2 = (v: number) => Math.round(v * 100) / 100
  return `media=Custom.${round2(paper.width * PT_PER_MM)}x${round2(paper.height * PT_PER_MM)}`
}

/** 构造 CUPS（lp）命令行参数（纯函数，便于单测） */
export function buildCupsArgs(pdfPath: string, options: PdfPrintOptions = {}): string[] {
  const { printerName, copies = 1, paperName, paper, duplex } = options
  const args: string[] = []
  if (printerName) args.push('-d', printerName)
  args.push('-n', String(copies))

  const media = resolveMediaOption(paper, paperName)
  if (media) args.push('-o', media)
  if (duplex) args.push('-o', 'sides=two-sided-long-edge')

  args.push(pdfPath)
  return args
}

/** 构造 SumatraPDF 打印参数（纯函数，便于单测） */
export function buildSumatraSettings(options: PdfPrintOptions = {}): string {
  const { copies = 1 } = options
  return `${copies}x`
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
  await execFileAsync('lp', buildCupsArgs(pdfPath, options), { timeout: 30000 })
}

/** Windows: 使用 SumatraPDF 打印（需要预装） */
async function printOnWindows(
  pdfPath: string,
  options: PdfPrintOptions,
): Promise<void> {
  const { printerName } = options

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
  args.push('-print-settings', buildSumatraSettings(options))
  args.push('-silent')
  args.push(pdfPath)

  await execFileAsync(sumatraPath, args, { timeout: 60000 })
}

/** Linux: 使用 lp 命令打印 */
async function printOnLinux(
  pdfPath: string,
  options: PdfPrintOptions,
): Promise<void> {
  await execFileAsync('lp', buildCupsArgs(pdfPath, options), { timeout: 30000 })
}
