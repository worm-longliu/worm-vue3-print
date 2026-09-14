import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/designer/index.ts', 'src/browser/index.ts', 'src/node/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    shims: true,
  },
  {
    // 注入用产物：服务端 Playwright 与客户端 Electron 共用同一份 DOM 执行器
    // tsup 对 iife 格式固定追加 .global.js 后缀 → dist/dom-executor.iife.global.js
    entry: { 'dom-executor.iife': 'src/browser/dom-executor.iife.ts' },
    format: ['iife'],
    globalName: '__wormDomBundle',
    platform: 'browser',
    dts: false,
    clean: false,
    minify: true,
  },
])
