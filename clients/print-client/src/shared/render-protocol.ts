// 主进程 ↔ 隐藏渲染 worker 的 IPC 契约（仅类型与通道常量，main / worker-preload 共用）。

export const RENDER_REQUEST_CHANNEL = 'worm:render-request'
export const RENDER_RESPONSE_CHANNEL = 'worm:render-response'

export interface RenderJobSpec {
  templateJson: Record<string, unknown>
  printData?: Record<string, unknown>
  baseUrl?: string
  /** 连续纸显式纸高覆盖（mm，宿主逃生门）；undefined 时 core 按内容探针推导 */
  paperHeightMm?: number
}

export interface RenderJobResult {
  /** 最终 HTML（连续纸纸高已在 core 内按推导值写进 @page/.print-page） */
  html: string
  pageCount: number
  /** 最终纸张尺寸（mm，来自 core：连续纸为探针推导高度，其余为模板纸张） */
  paperMm: { width: number; height: number }
  /** 模板是否连续纸 */
  continuous: boolean
}

export type RenderResponse =
  | { ok: true; result: RenderJobResult }
  | { ok: false; message: string }
