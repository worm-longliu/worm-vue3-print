import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Vue 3 子 demo：只依赖 npm 包（@worm-vue3-print/common 与 /core），没有任何共用壳层。
 * 9331；/render-api 由 dev 代理转发到本地 render 微服务并注入密钥，前端代码不带密钥。
 */
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 编译期就要告诉 Vue：print-* 是自定义元素，不是未注册组件
          isCustomElement: tag => tag.startsWith('print-'),
        },
      },
    }),
  ],
  server: {
    port: 9331,
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
