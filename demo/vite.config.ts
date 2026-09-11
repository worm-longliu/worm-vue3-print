import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 与 web 宿主一致：设计器/核心包按 monorepo 源码消费（Vite 直接编译包内 .vue/.ts）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    // 数组按顺序匹配：子路径（browser/designer）必须在主入口之前命中
    alias: [
      { find: '@worm-vue3-print/canvas/native-controls.css', replacement: fileURLToPath(new URL('../packages/print-canvas/src/styles/native-controls.css', import.meta.url)) },
      { find: /^@worm-vue3-print\/core\/browser$/, replacement: fileURLToPath(new URL('../packages/print-core/src/browser/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/core\/designer$/, replacement: fileURLToPath(new URL('../packages/print-core/src/designer/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/core$/, replacement: fileURLToPath(new URL('../packages/print-core/src/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/canvas$/, replacement: fileURLToPath(new URL('../packages/print-canvas/src/index.ts', import.meta.url)) },
    ],
  },
  server: {
    port: 9303,
    host: true,
    open: true,
    fs: {
      // 允许读取 monorepo 内 packages 源码
      allow: [fileURLToPath(new URL('..', import.meta.url))],
    },
  },
})