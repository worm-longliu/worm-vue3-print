import type {
  CodeSpec,
  PdfTargetSpec,
  RawMeasurement,
  ScreenshotTargetSpec,
  ViewportPx,
} from './types.js'
import type { FitFontSize } from '../render/text-fit.js'

/** 会话预算：PrintJob 天然满足本结构；print.submitHtml 这类无模板直出图场景也可直接传入 */
export interface SessionBudget {
  timeoutMs?: number
  readinessMs?: number
}

/** 测量结果：原始几何 + 自动缩小算出的最终字号（需回写模板后再出最终 HTML） */
export interface MeasureResult {
  measurements: RawMeasurement[]
  fits: FitFontSize[]
}

/** 一次任务内的文档槽位会话；方法内部已完成超时与错误归一化 */
export interface PrintSession {
  /** 码值 → SVG 映射；specs 为空时直接返回空 Map，不触碰宿主 */
  renderCodes(specs: CodeSpec[]): Promise<Map<string, string>>
  /**
   * 测量：载入测量趟 HTML → 自动缩小（data-fit="shrink"）→ 读取元素/行高。
   * 自动缩小结果随测量一并返回，供调用方回写模板使最终趟与测量同口径。
   */
  measure(html: string, viewport: ViewportPx): Promise<MeasureResult>
  probeContentBottom(html: string, viewport: ViewportPx): Promise<number>
  toPdf(html: string, spec: PdfTargetSpec, viewport: ViewportPx): Promise<Uint8Array>
  toScreenshot(html: string, spec: ScreenshotTargetSpec, viewport: ViewportPx): Promise<Uint8Array>
}

export interface PrintRuntime {
  /** 借用一个槽位跑完整个任务；退出时无论成败都释放 */
  withSession<T>(budget: SessionBudget, fn: (session: PrintSession) => Promise<T>): Promise<T>
}

export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_READINESS_MS = 5_000
