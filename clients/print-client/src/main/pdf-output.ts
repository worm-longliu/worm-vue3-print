// 生成 PDF 的落盘策略（纯逻辑，便于单测）：
// - 默认（keep=false）：写到系统临时目录，打印完成后由调用方删除；
// - 排查（keep=true）：写到指定目录并保留，供人工用 PDF 阅读器核对颜色/方向等问题。
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** 不保留时的临时目录 */
export const TEMP_PDF_DIR = join(tmpdir(), 'worm-print-client-pdf')

export interface PdfOutputPolicy {
  /** 是否保留生成的 PDF */
  keep: boolean
  /** keep=true 时的输出目录（调用方负责给出已解析的绝对路径） */
  dir: string
}

/** 组装落盘策略所需的最小配置（避免依赖完整 AppConfig，便于单测） */
export interface PdfOutputConfig {
  keepGeneratedPdf: boolean
  pdfOutputDir: string
}

/**
 * 由配置与 userData 目录组装落盘策略：目录留空时用 `<userData>/pdf`。
 * 放在这里而不是写死在入口，保证「配置项 → 实际落盘目录」可单测。
 */
export function buildPdfOutputPolicy(config: PdfOutputConfig, userDataDir: string): PdfOutputPolicy {
  const configured = config.pdfOutputDir.trim()
  return {
    keep: config.keepGeneratedPdf === true,
    dir: configured || join(userDataDir, 'pdf'),
  }
}

/** 解析本次任务 PDF 的落盘路径；`keep=false` 时落在系统临时目录 */
export function resolvePdfPath(jobId: string, policy: PdfOutputPolicy): string {
  const dir = policy.keep && policy.dir ? policy.dir : TEMP_PDF_DIR
  return join(dir, `${jobId}.pdf`)
}

/** 该任务生成的 PDF 是否需要保留（保留时不在任务结束后删除） */
export function shouldKeepPdf(policy: PdfOutputPolicy): boolean {
  return policy.keep === true && policy.dir.trim().length > 0
}
