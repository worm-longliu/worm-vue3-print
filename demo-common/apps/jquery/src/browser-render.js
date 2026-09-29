// 浏览器侧渲染封装：调用 core 同构管线的浏览器适配器，在本页完成两遍渲染（测量 → 分页 → 最终 HTML）。
// 直挂形态下 core 已内联进 dist/common.js，能力全部从全局 WormPrintCommon 上取，没有 bare import。
// 产物既用于「打印预览」写入 iframe，也直送打印客户端，客户端不再执行模板渲染。

const W = window.WormPrintCommon

/**
 * @param templateJson 当前画布模板 JSON（单模板或 { pages } 多页面模板）
 * @param printData 业务数据；传非空对象数组时批量渲染并合并为单个 HTML（份间分页）
 * @param baseUrl 相对路径图片拼接用的宿主基址
 */
export async function renderInBrowser(templateJson, printData, baseUrl) {
  const result = await W.renderHtmlPages(templateJson, printData, baseUrl, W.browserCodeRenderer)
  return {
    html: result.html,
    paperMm: result.paperMm,
    continuous: result.continuous,
    pageCount: result.pageCount,
  }
}

/** 把渲染产物写入同源 iframe（替代 demo 里的 PrintHtmlPreview 组件，DOM 结构与类名一致） */
export function writeHtmlToFrame(frame, html) {
  const doc = frame?.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
}
