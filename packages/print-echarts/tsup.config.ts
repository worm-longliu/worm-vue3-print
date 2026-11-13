import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * Copyright (c) 2026 worm <liu_long_qqcom@qq.com>
 * SPDX-FileCopyrightText: 2026 worm <liu_long_qqcom@qq.com>
 * SPDX-License-Identifier: MIT
 */`

export default defineConfig([
  {
    // Node 宿主入口（服务端/Electron 主进程）：读取 IIFE 产物，构建期用 shims 处理 import.meta.url
    entry: { node: 'src/node.ts' },
    format: ['esm', 'cjs'],
    platform: 'node',
    target: 'node18',
    dts: false,
    clean: false,
    shims: true,
    banner: { js: banner },
  },
  {
    // 注入用产物：三端页面上下文共用同一份图表执行器（echarts 随包打入 IIFE）
    // tsup 对 iife 格式固定追加 .global.js 后缀 → dist/executor.iife.global.js
    entry: { 'executor.iife': 'src/browser/executor.iife.ts' },
    format: ['iife'],
    globalName: '__wormEchartsExecutor',
    platform: 'browser',
    target: 'es2018',
    dts: false,
    clean: false,
    minify: true,
    noExternal: ['echarts'],
    banner: { js: banner },
  },
])
