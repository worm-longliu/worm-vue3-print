// 渲染编排：worker 两遍渲染 + 纸张推导 + Electron 打印参数映射。
import type { PrintOptions } from '@worm-vue3-print/client'
import { resolvePaper } from './paper.js'
import type { RendererPool } from './renderer-pool.js'
import type { RenderJobSpec, RenderJobResult } from '../shared/render-protocol.js'

export interface PreparedPrint {
  html: string
  pageCount: number
  paper: { width: number; height: number }
  heightSource: 'config' | 'derived'
}

/** 与 Electron webContents.print 的 WebPreferences 打印选项对齐（不引 electron 类型以便单测） */
export interface WebPrintSettings {
  silent: boolean
  printBackground: boolean
  copies: number
  deviceName?: string
  landscape?: boolean
  color?: boolean
  pageSize: string | { width: number; height: number }
  margins:
    | { marginType: 'none' | 'default' }
    | { marginType: 'custom'; top: number; bottom: number; left: number; right: number }
  pageRanges?: Array<{ from: number; to: number }>
}

/** 协议打印参数 → Electron 打印设置；core HTML 以 padding 自控边距，故默认零边距 */
export function buildWebPrintSettings(
  print: PrintOptions,
  paper: { width: number; height: number },
): WebPrintSettings {
  const settings: WebPrintSettings = {
    silent: true,
    printBackground: true,
    copies: print.copies && print.copies > 0 ? Math.trunc(print.copies) : 1,
    pageSize: print.paperName ?? { width: paper.width, height: paper.height },
    margins: print.margins
      ? { marginType: 'custom', ...print.margins }
      : { marginType: 'none' },
  }
  if (print.printerName) settings.deviceName = print.printerName
  if (typeof print.landscape === 'boolean') settings.landscape = print.landscape
  if (typeof print.color === 'boolean') settings.color = print.color
  if (print.pageRanges && print.pageRanges.length > 0) settings.pageRanges = print.pageRanges
  return settings
}

export class RenderEngine {
  constructor(private readonly pool: RendererPool) {}

  async prepare(spec: RenderJobSpec, print: PrintOptions): Promise<PreparedPrint> {
    // 连续纸显式高度逃生门：换算为 mm 透传给 worker，core 会用它生成 HTML 纸高（保证 @page 与出纸一致）
    const overrideH = print.paperSize?.height
    const jobSpec: RenderJobSpec =
      overrideH && overrideH > 0 ? { ...spec, paperHeightMm: overrideH / 1000 } : spec
    const result: RenderJobResult = await this.pool.render(jobSpec)
    const { paper, heightSource } = resolvePaper({
      print,
      paperMm: result.paperMm,
      continuous: result.continuous,
    })
    return {
      html: result.html,
      pageCount: result.pageCount,
      paper,
      heightSource,
    }
  }
}
