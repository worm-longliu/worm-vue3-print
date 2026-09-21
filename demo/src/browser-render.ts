// 浏览器侧渲染封装：业务页直接调用 core 同构管线的浏览器适配器，
// 在页面内完成两遍渲染（测量 → 分页 → 最终 HTML），产物直送打印客户端，客户端不再渲染。
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import type { MultiPageTemplateData, PrintTemplateData } from '@worm-vue3-print/core'
import type { RenderedHtmlPages } from '@worm-vue3-print/core/client'

/**
 * 在当前浏览器页面内渲染模板，返回可直接提交给 PrintClient.printHtml 的结果。
 * @param templateJson 当前画布模板 JSON（单模板或 { pages } 多页面模板）
 * @param printData 业务数据；传非空对象数组时批量渲染并合并为单个 HTML（份间分页）
 * @param baseUrl 相对路径图片（如 /docfiles/...）拼接用的宿主基址
 * @param fontBaseUrl 相对路径字体基址；产物要在客户端进程内加载，故需绝对地址
 */
export async function renderInBrowser(
  templateJson: PrintTemplateData | MultiPageTemplateData,
  printData: Record<string, unknown> | Array<Record<string, unknown>>,
  baseUrl: string,
  fontBaseUrl?: string,
): Promise<RenderedHtmlPages> {
  const result = await renderHtmlPages(
    templateJson,
    printData,
    baseUrl,
    browserCodeRenderer,
    { fontBaseUrl },
  )
  return {
    html: result.html,
    paperMm: result.paperMm,
    continuous: result.continuous,
    pageCount: result.pageCount,
  }
}
