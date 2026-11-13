import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// 产物版权头：npm 分发链路唯一能留存署名的位置
const licenseBanner = `/*!
 * ${pkg.name} v${pkg.version}
 * Copyright (c) 2026 worm <liu_long_qqcom@qq.com>
 * SPDX-FileCopyrightText: 2026 worm <liu_long_qqcom@qq.com>
 * SPDX-License-Identifier: MIT
 */`

function licenseBannerPlugin() {
  return {
    name: 'license-banner',
    generateBundle(_options: unknown, bundle: Record<string, { type: string; code: string }>) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') chunk.code = licenseBanner + chunk.code
      }
    },
  }
}

// 主入口（含设计器 Vue 组件）走 vite lib 构建；node 入口与 IIFE 执行器由 tsup 产出。
// 图表库 echarts 与框架依赖全部外置：本包是唯一允许依赖 echarts 的包，宿主自行安装。
export default defineConfig({
  plugins: [vue(), licenseBannerPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: [
        'vue',
        // 匹配 echarts 及 /core、/charts 等全部按需子路径：宿主安装、不打进本包
        /^echarts(\/.*)?$/,
        /^@worm-vue3-print\/core(\/.*)?$/,
        /^@worm-vue3-print\/canvas(\/.*)?$/,
      ],
    },
    sourcemap: false,
    emptyOutDir: true,
  },
})
