import type {
  CodeSpec,
  PdfTargetSpec,
  RawMeasurement,
  ScreenshotTargetSpec,
  ViewportPx,
} from './types.js'

/** 会话预算：PrintJob 天然满足本结构；print.submitHtml 这类无模板直出图场景也可直接传入 */
export interface SessionBudget {
  timeoutMs?: number
  readinessMs?: number
}

/** 一次任务内的文档槽位会话；方法内部已完成超时与错误归一化 */
export interface PrintSession {
  /** 码值 → SVG 映射；specs 为空时直接返回空 Map，不触碰宿主 */
  renderCodes(specs: CodeSpec[]): Promise<Map<string, string>>
  measure(html: string, viewport: ViewportPx): Promise<RawMeasurement[]>
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
