import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'))

// 产物版权头：npm 分发链路唯一能留存署名的位置
const licenseBanner = `/*!
 * ${pkg.name} v${pkg.version}
 * Copyright (c) 2026 Worm Base AI
 * SPDX-FileCopyrightText: 2026 Worm Base AI
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
        // 匹配主包及 /designer、/browser 等全部子路径，均作为外部依赖不打进 canvas
        /^@worm-vue3-print\/core(\/.*)?$/,
        'dompurify',
        'jsbarcode',
        'qrcode',
        // lucide 图标按需命名导入，外置后由宿主 bundler tree-shaking
        'lucide-vue-next',
      ],
    },
    sourcemap: false,
    emptyOutDir: true,
  },
})
