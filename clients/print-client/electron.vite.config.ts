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
        },
      },
    },
  },
  renderer: {
    plugins: [vue()],
    root: 'src',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
})
