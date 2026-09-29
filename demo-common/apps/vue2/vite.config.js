import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue2 from '@vitejs/plugin-vue2'

/**
 * Vue 2.7 子 demo：标准 SFC 工程（模板 / 脚本 / 样式都在 src/App.vue 单文件组件里）。
 * 用的是 runtime-only 构建，不需要 `alias: vue/dist/vue.esm.js` 那条运行时编译器。
 * 9332；/render-api 代理到本地 render 微服务并注入密钥。
 */
export default defineConfig({
  plugins: [vue2()],
  server: {
    port: 9332,
    strictPort: true,
    host: true,
    fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] },
    proxy: {
      '/render-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/render-api/, ''),
        configure(proxy) {
          proxy.on('proxyReq', proxyReq => proxyReq.setHeader('X-Render-Key', 'dev-render-key'))
        },
      },
    },
  },
})
