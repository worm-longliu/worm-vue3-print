// 隐藏渲染 worker（contextIsolation 主世界）：跑 core 浏览器侧两遍渲染，经 wormRender 桥返回结果。
// 仅从 shared 导入类型（编译擦除，无运行时跨包 require）；core 由 vite 打包进 renderer 产物。
import { renderHtmlPages, browserCodeRenderer } from '@worm-vue3-print/core/browser'
import type { PrintTemplateData } from '@worm-vue3-print/core'
import type { RenderJobSpec, RenderResponse } from '../shared/render-protocol.js'

declare global {
  interface Window {
    wormRender: {
      onRequest(cb: (id: string, spec: RenderJobSpec) => Promise<RenderResponse>): void
    }
  }
}

window.wormRender.onRequest(async (_id, spec) => {
  try {
    const template = spec.templateJson as unknown as PrintTemplateData
    // paperMm/continuous 由 core 直接返回（连续纸已探针推导并写入 HTML 纸高）
    const { html, pageCount, paperMm, continuous } = await renderHtmlPages(
      template,
      spec.printData as Record<string, unknown> | undefined,
      spec.baseUrl,
      browserCodeRenderer,
      { paperHeightMm: spec.paperHeightMm },
    )
    return { ok: true, result: { html, pageCount, paperMm, continuous } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : '渲染失败' }
  }
})
