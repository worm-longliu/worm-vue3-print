import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// 与 web 宿主一致：设计器/核心包按 monorepo 源码消费（Vite 直接编译包内 .vue/.ts）
export default defineConfig(({ mode }) => {
  // render 服务地址与鉴权密钥仅用于 dev 代理，不注入前端 bundle（避免密钥暴露到浏览器）
  // 可用环境变量覆盖：VITE_RENDER_TARGET / VITE_RENDER_API_KEY，或 .env.local
  const env = loadEnv(mode, process.cwd(), '')
  const renderTarget = env.VITE_RENDER_TARGET || 'http://localhost:3001'
  const renderApiKey = env.VITE_RENDER_API_KEY || 'dev-render-key'

  return {
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
      proxy: {
        // 前端统一调用同源 /render-api/*，由 dev server 转发到 render 微服务，规避浏览器跨域；
        // X-Render-Key 在代理层注入。注意：仅 dev 联调有效，生产部署需由宿主后端反向代理。
        '/render-api': {
          target: renderTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/render-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-Render-Key', renderApiKey)
            })
          },
        },
      },
    },
  }
})
