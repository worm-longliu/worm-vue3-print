// Node 宿主专用出口（服务端 Playwright、Electron 主进程）；浏览器端不得 import 本文件。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ExecutorBundle } from '@worm-vue3-print/core'
import type { PluginExecutorBundle } from '@worm-vue3-print/core/designer'
// named import 同样触发 plugin.ts 的自注册（D7 / §3.7 跨进程注册）；
// 此外把页面执行器产物挂到描述符，供 core 的 collectExecutorBundles() 按注册态自动收集（P5）。
import { CHART_PLUGIN_ID, registerChartExecutorBundle } from './plugin.js'
import { CHART_EXECUTOR_VERSION } from './version.js'

/** 与 dist/node.{js,cjs} 同级目录定位产物（tsup shims 让 ESM/CJS 都成立） */
const EXECUTOR_FILE = new URL('./executor.iife.global.js', import.meta.url)

/** 惰性读取：只有 collectExecutorBundles() / 旧 API 真正需要注入页面时才碰磁盘 */
function chartExecutorBundle(): PluginExecutorBundle {
  return {
    name: CHART_PLUGIN_ID,
    version: CHART_EXECUTOR_VERSION,
    code: readFileSync(fileURLToPath(EXECUTOR_FILE), 'utf8'),
  }
}

registerChartExecutorBundle(chartExecutorBundle)

/**
 * 兼容 API（§4.3）：旧宿主显式装载图表执行器 IIFE 产物。
 * P5 起宿主无需再调用本函数，注册表会自动收集同一份产物。
 */
export function loadChartExecutorBundle(): ExecutorBundle {
  const bundle = chartExecutorBundle()
  return { source: bundle.code, version: bundle.version }
}
