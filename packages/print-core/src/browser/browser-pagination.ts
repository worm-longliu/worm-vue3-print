// 浏览器端入口：与 print-render / print-client 走同一份 core 管线，仅 driver 不同。
import { createBrowserPrintRuntime } from './browser-runtime.js'
import { prepareDocument } from '../print/pipeline.js'
import type { CodeRenderer, PageLayout, TemplateData as PrintTemplateData } from '../render/types.js'

export interface BrowserRenderResult {
  /** 最终多页 HTML 字符串 */
  html: string
  /** 总页数 */
  pageCount: number
  /** 分页布局（调试/高级用途） */
  pageLayouts: PageLayout[]
  /** 最终纸张尺寸（mm，已含方向）；连续纸为探针推导后的高度 */
  paperMm: { width: number; height: number }
  /** 模板是否连续纸 */
  continuous: boolean
  /** 份数（对象数据=1；数组=数组长度） */
  copies: number
  /** 批量时每份纸张尺寸（连续纸各份高度可能不同） */
  copyPaperMm?: { width: number; height: number }[]
}

export interface BrowserRenderOptions {
  /** 连续纸显式纸高覆盖（mm）；仅对 CONTINUOUS 生效 */
  paperHeightMm?: number
  /**
   * 相对路径字体基址。缺省空串 = 不拼接，由文档自身 origin 解析——
   * 与设计器画布注入 @font-face 的语义一致（画布能加载的字体，预览/浏览器打印也能加载）。
   * 传值则拼在该基址上，供字体与页面不同源的宿主使用。
   */
  fontBaseUrl?: string
}

/**
 * 浏览器内完成「数据绑定 → 码值渲染 → 测量 → 分页 → 连续纸推导 → 最终 HTML」。
 * @param template 模板 JSON（设计器 TemplateData 结构兼容）
 * @param printData 业务数据
 * @param baseUrl 图片相对路径拼接前缀
 * @param codeRenderer 调用方提供的码值渲染器；传入时沿用该渲染器（既有覆盖语义）
 * @param options 渲染选项（连续纸纸高覆盖等）
 */
export async function renderHtmlPages(
  template: PrintTemplateData,
  printData?: Record<string, any> | Record<string, any>[],
  baseUrl?: string,
  codeRenderer?: CodeRenderer,
  options?: BrowserRenderOptions,
): Promise<BrowserRenderResult> {
  const prepared = await prepareDocument(
    {
      templateJson: template,
      printData,
      baseUrl,
      fontBaseUrl: options?.fontBaseUrl ?? '',
      paperHeightMm: options?.paperHeightMm,
      codeRenderer,
    },
    createBrowserPrintRuntime(),
  )
  return {
    html: prepared.html,
    pageCount: prepared.pageCount,
    pageLayouts: prepared.pageLayouts,
    paperMm: prepared.paperMm,
    continuous: prepared.continuous,
    copies: prepared.copies,
    copyPaperMm: prepared.copyPaperMm,
  }
}
