// Node 宿主专用出口（服务端 Playwright、Electron 主进程）；浏览器端不得 import 本文件。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PluginExecutorBundle } from '@worm-vue3-print/core/designer'
// named import 同样触发 plugin.ts 的自注册；再把页面执行器产物挂到描述符，
// core 的 collectExecutorBundles() 即可按注册态自动收集（宿主零改动）。
import { CHART_PLUGIN_ID, registerChartExecutorBundle } from './plugin.js'
import { CHART_EXECUTOR_VERSION } from './version.js'

/** 与 dist/node.{js,cjs} 同级目录定位产物（tsup shims 让 ESM/CJS 都成立） */
const EXECUTOR_FILE = new URL('./executor.iife.global.js', import.meta.url)

/** 惰性读取：只有 collectExecutorBundles() 真正需要注入页面时才碰磁盘 */
function chartExecutorBundle(): PluginExecutorBundle {
  return {
    name: CHART_PLUGIN_ID,
    version: CHART_EXECUTOR_VERSION,
    code: readFileSync(fileURLToPath(EXECUTOR_FILE), 'utf8'),
  }
}

registerChartExecutorBundle(chartExecutorBundle)
