// 服务端渲染入口：内部走 core 的共享管线，仅由 Playwright driver 提供宿主能力。
// 对外导出名与签名保持不变（server.ts 与既有集成测试直接 import）。
import {
  collectExecutorBundles,
  createDomHostRuntime,
  renderPdf as coreRenderPdf,
} from '@worm-vue3-print/core'
import { loadExecutorBundle } from '@worm-vue3-print/core/node'
// 部署白名单（设计文档 D3）：服务端只允许显式 import 的插件进入注册表，
// 模板字符串永远无法触发 import()。此处只做副作用注册，不装载任何具体插件产物。
import '@worm-vue3-print/echarts/node'
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
      // 第三参是 §4.3 旧 chartBundle 兼容位，P5 起留空；
      // 扩展元素执行器一律由注册表自动收集，新增插件无需改本文件。
      undefined,
      collectExecutorBundles(),
    )
  }
  return cachedRuntime
}

function toJob(request: RenderRequest): PrintJob {
  return {
    templateJson: request.templateJson,
    printData: request.printData,
    baseUrl: request.baseUrl,
    // 字体基址：请求优先，其次容器环境变量 FONT_BASE_URL（容器里 localhost 指向容器自身，
    // 模板里的相对字体地址通常需要宿主用环境变量指到可达的静态站/CDN）
    fontBaseUrl: request.fontBaseUrl ?? (process.env.FONT_BASE_URL || undefined),
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
