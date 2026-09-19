// Node 宿主专用出口（服务端、Electron 主进程）；浏览器端不得 import 本文件。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ExecutorBundle } from '../print/driver.js'

/** 与 dist/node/index.{js,cjs} 同级目录定位产物：不依赖包自引用解析，ESM/CJS 都成立 */
const EXECUTOR_FILE = new URL('../dom-executor.iife.global.js', import.meta.url)

/** 读取 core 自带的 DOM 执行器 IIFE 产物；宿主把它注入页面后即可调用 __wormDom */
export function loadExecutorBundle(): ExecutorBundle {
  // version 与 browser/dom-executor.ts 的 EXECUTOR_VERSION 保持一致（此处字面量避免把浏览器执行器拖进 Node 入口）
  return { source: readFileSync(fileURLToPath(EXECUTOR_FILE), 'utf8'), version: '2' }
}
