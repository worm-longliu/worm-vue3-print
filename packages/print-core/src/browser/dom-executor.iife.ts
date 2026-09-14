import { domExecutor } from './dom-executor.js'

// IIFE 入口：服务端 Playwright 与客户端 Electron 注入该产物后调用同一份执行器
;(globalThis as Record<string, unknown>).__wormDom = domExecutor
