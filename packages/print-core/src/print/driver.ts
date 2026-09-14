import type { PdfTargetSpec, RawMeasurement, ScreenshotTargetSpec, ViewportPx } from './types.js'

/** 执行器可被宿主调用的方法名（与 browser/dom-executor.ts 一一对应） */
export type ExecutorMethod = 'waitReady' | 'readMeasurements' | 'readContentBottom' | 'renderCodes'

/** 执行器方法的宿主目标种类：window（waitReady）/ document（读 DOM）/ none（纯计算，无首参） */
export type ExecutorTargetKind = 'window' | 'document' | 'none'

/**
 * 各执行器方法的宿主目标注入方式：宿主据此决定是否补首参。
 * 三端 driver 均按本表装配参数，不得各自假设「非 waitReady 一律传 document」。
 */
export const EXECUTOR_TARGETS: Record<ExecutorMethod, ExecutorTargetKind> = {
  waitReady: 'window',
  readMeasurements: 'document',
  readContentBottom: 'document',
  renderCodes: 'none',
}

/** core 自带的 DOM 执行器产物；宿主负责把它送进页面 */
export interface ExecutorBundle {
  source: string
  version: string
}

/**
 * 单文档槽位原语：只做宿主 I/O，不含任何业务规则（纸张、分页、码制参数均不得出现在实现里）。
 * 工厂返回时该槽位必须已存在一个空白文档（open 只负责调整视口）。
 */
export interface PageDriver {
  /**
   * 是否需要注入 core 的 DOM 执行器产物；缺省 true。
   * 浏览器 iframe driver 在进程内直调执行器，置 false 即可不传 bundle。
   */
  requiresExecutor?: boolean
  open(viewport: ViewportPx): Promise<void>
  setContent(html: string): Promise<void>
  /** 同一文档内幂等；文档重建后必须重新注入 */
  injectExecutor(bundle: ExecutorBundle): Promise<void>
  evaluate<T>(method: ExecutorMethod, args?: unknown[]): Promise<T>
  pdf?(html: string, spec: PdfTargetSpec): Promise<Uint8Array>
  screenshot?(html: string, spec: ScreenshotTargetSpec): Promise<Uint8Array>
  close(): Promise<void>
}

export interface DriverFactory {
  createDriver(): Promise<PageDriver>
}
