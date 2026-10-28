// 浏览器侧渲染封装：调用 core 同构管线的浏览器适配器，在本页完成两遍渲染（测量 → 分页 → 最终 HTML）。
// 产物既用于「打印预览」写入 iframe，也直送打印客户端，客户端不再执行模板渲染。
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import {
  applyPreviewViewZoom, paperWidthPx, resolvePrinterDpi, resolveZoomKey, zoomPresets, zoomValueOf,
} from '@worm-vue3-print/core/designer'

/**
 * @param templateJson 当前画布模板 JSON（单模板或 { pages } 多页面模板）
 * @param printData 业务数据；传非空对象数组时批量渲染并合并为单个 HTML（份间分页）
 * @param baseUrl 相对路径图片拼接用的宿主基址
 */
export async function renderInBrowser(templateJson, printData, baseUrl) {
  const result = await renderHtmlPages(templateJson, printData, baseUrl, browserCodeRenderer)
  return {
    html: result.html,
    paperMm: result.paperMm,
    continuous: result.continuous,
    pageCount: result.pageCount,
    // 出纸裁切提示（旋转外接盒顶越页首、元素超出纸面左右缘）：与保存闸门同一份 core 判据，
    // 预览层直接读它提示用户，不必再自己解析分页结果
    warnings: [...new Set((result.pageLayouts ?? []).flatMap(l => l.warnings ?? []))],
  }
}

/** 把渲染产物写入同源 iframe（替代 demo 里的 PrintHtmlPreview 组件，DOM 结构、类名与缩放档位条都按同一形态复刻） */
export function writeHtmlToFrame(frame, html) {
  const doc = frame?.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(html)
  doc.close()
}

/**
 * 预览的「查看缩放」控制器：档位表、点阵倍率、纸宽结算与守卫样式全在 core 的 designer/preview-zoom，
 * 与 demo 用的 PrintHtmlPreview 同一份判据；本函数只负责宿主侧的取模板、量容器宽与写文档。
 */
export function createPreviewZoom({ getTemplate, measureContainer }) {
  let presets = []
  let zoomKey = ''

  /** 重算档位（模板变化、容器宽度变化后调用）；档位消失时落回默认档 */
  function sync() {
    const template = getTemplate()
    const dpi = resolvePrinterDpi(template)
    presets = zoomPresets(dpi, measureContainer(), paperWidthPx(template))
    zoomKey = resolveZoomKey(presets, zoomKey, dpi)
    return { presets: [...presets], zoomKey }
  }

  /** 缩放只写进预览文档，不改渲染产物：规则自带 `@media print{zoom:1}`，打印与分页不受影响 */
  function apply(frame) {
    applyPreviewViewZoom(frame?.contentWindow?.document, zoomValueOf(presets, zoomKey))
  }

  /** 切档：非法档位名忽略（与 PrintHtmlPreview 的 setViewZoom 同口径） */
  function setKey(key) {
    if (presets.some(p => p.key === key)) zoomKey = key
    return zoomKey
  }

  return { sync, apply, setKey }
}
