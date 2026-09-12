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
        // sandbox:true 的 preload 统一输出 CommonJS .js（Electron 沙箱 preload 兼容性最佳）
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
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
