import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // preload 统一输出 CommonJS .cjs：包为 type:module，.js 会被当 ESM
        // 导致 require 未定义；.cjs 在 sandbox true/false 下均按 CJS 加载，无歧义。
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'worker-preload': resolve(__dirname, 'src/preload/worker-preload.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [vue()],
    root: 'src',
    build: {
      rollupOptions: {
        // worker 主世界需把 core 等 workspace 依赖打包进产物（preload 才允许外置 electron）
        external: id => id === 'electron' || /node_modules\/electron\//.test(id),
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          worker: resolve(__dirname, 'src/worker/index.html'),
        },
      },
    },
  },
})
