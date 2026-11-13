// Node 宿主专用出口（服务端 Playwright、Electron 主进程）；浏览器端不得 import 本文件。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ExecutorBundle } from '@worm-vue3-print/core'
import { CHART_EXECUTOR_VERSION } from './version.js'

/** 与 dist/node.{js,cjs} 同级目录定位产物（tsup shims 让 ESM/CJS 都成立） */
const EXECUTOR_FILE = new URL('./executor.iife.global.js', import.meta.url)

/**
 * 读取图表执行器 IIFE 产物；宿主注入页面后（core 执行器之后）即可调用
 * `globalThis.__wormDom.renderCharts(specs)`。
 */
export function loadChartExecutorBundle(): ExecutorBundle {
  return { source: readFileSync(fileURLToPath(EXECUTOR_FILE), 'utf8'), version: CHART_EXECUTOR_VERSION }
}
