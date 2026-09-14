// 服务端渲染入口：内部走 core 的共享管线，仅由 Playwright driver 提供宿主能力。
// 对外导出名与签名保持不变（server.ts 与既有集成测试直接 import）。
import {
  createDomHostRuntime,
  renderPdf as coreRenderPdf,
  renderScreenshot as coreRenderScreenshot,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
import type { PrintJob, PrintRuntime, RenderRequest } from '@worm-vue3-print/core'
import { BrowserPool } from './browser-pool.js'
import { createPlaywrightDriverFactory } from './driver-playwright.js'

/** 与 server.ts 的请求级超时同源；core 预算留 1s 余量，避免外层先回 504、内部仍在跑 */
const REQUEST_BUDGET_MS = 30_000
const BUDGET_MARGIN_MS = 1_000

let cachedRuntime: PrintRuntime | undefined

function runtime(): PrintRuntime {
  if (!cachedRuntime) {
    cachedRuntime = createDomHostRuntime(
      createPlaywrightDriverFactory(BrowserPool.getInstance()),
      loadExecutorBundle(),
    )
  }
  return cachedRuntime
}

function toJob(request: RenderRequest): PrintJob {
  return {
    templateJson: request.templateJson,
    printData: request.printData,
    baseUrl: request.baseUrl,
    paperOverride: request.paperOverride,
    paperHeightMm: request.paperHeightMm,
    timeoutMs: REQUEST_BUDGET_MS - BUDGET_MARGIN_MS,
  }
}

/** 两遍渲染生成 PDF：与浏览器、客户端走同一份 core 管线 */
export async function renderPdf(request: RenderRequest): Promise<Buffer> {
  const { pdf } = await coreRenderPdf(toJob(request), runtime())
  return Buffer.from(pdf as Uint8Array)
}

/** 单遍渲染生成 PNG 截图（测量模式 HTML，不分页） */
export async function renderScreenshot(request: RenderRequest): Promise<Buffer> {
  return Buffer.from(await coreRenderScreenshot(toJob(request), runtime()))
}
