// 批量渲染：同一模板对多条数据各跑一次 core 同构管线，再把每份完整 HTML
// 文档拼接为单个文档（每份 .print-copy 之间强制分页），供一个 iframe 一次打印。
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import type { PrintTemplateData } from '@worm-vue3-print/core'

export interface BatchRenderResult {
  /** 拼接后的完整 HTML 文档 */
  html: string
  /** 各份总页数之和 */
  pageCount: number
  /** 份数 */
  copies: number
}

/** 每份结束后强制翻页（覆盖 core 末页 .print-page 的 break-after:auto） */
const COPY_BREAK_STYLE =
  '<style>.print-copy:not(:last-child){break-after:page;page-break-after:always;}</style>'

export async function renderBatchInBrowser(
  templateJson: Record<string, unknown>,
  dataList: Record<string, any>[],
  baseUrl?: string,
): Promise<BatchRenderResult> {
  if (dataList.length === 0) throw new Error('批量打印数据为空')

  // 串行渲染，避免并发隐藏 iframe 测量互相干扰
  const pages: Array<{ html: string; pageCount: number }> = []
  for (let i = 0; i < dataList.length; i++) {
    try {
      const result = await renderHtmlPages(
        templateJson as unknown as PrintTemplateData,
        dataList[i],
        baseUrl,
        browserCodeRenderer,
      )
      pages.push({ html: result.html, pageCount: result.pageCount })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      throw new Error(`第 ${i + 1} 份渲染失败：${reason}`)
    }
  }

  // 同模板多次渲染的 head（@page/样式）一致，以首份为骨架
  const docs = pages.map(p => new DOMParser().parseFromString(p.html, 'text/html'))
  const skeleton = docs[0]
  skeleton.body.innerHTML = ''
  for (const doc of docs) {
    const section = skeleton.createElement('section')
    section.className = 'print-copy'
    section.innerHTML = doc.body.innerHTML
    skeleton.body.appendChild(section)
  }
  skeleton.head.insertAdjacentHTML('beforeend', COPY_BREAK_STYLE)

  return {
    html: `<!DOCTYPE html>\n${skeleton.documentElement.outerHTML}`,
    pageCount: pages.reduce((sum, p) => sum + p.pageCount, 0),
    copies: dataList.length,
  }
}
