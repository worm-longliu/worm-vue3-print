import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * React 18 子 demo：只用 npm 包，集成代码全在 src/App.jsx。
 * 9335；/render-api 代理到本地 render 微服务。
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 9335,
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
