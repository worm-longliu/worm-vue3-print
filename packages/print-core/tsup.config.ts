import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// 产物版权头：npm 分发链路（含 minify 的 iife）唯一能留存署名的位置
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * Copyright (c) 2026 worm <liu_long_qqcom@qq.com>
 * SPDX-FileCopyrightText: 2026 worm <liu_long_qqcom@qq.com>
 * SPDX-License-Identifier: MIT
 */`

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/designer/index.ts', 'src/browser/index.ts', 'src/node/index.ts', 'src/client/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    banner: { js: banner },
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
    banner: { js: banner },
  },
])
