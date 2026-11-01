import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@worm-vue3-print\/core\/browser$/, replacement: fileURLToPath(new URL('../../packages/print-core/src/browser/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/core$/, replacement: fileURLToPath(new URL('../../packages/print-core/src/index.ts', import.meta.url)) },
    ],
  },
  server: {
    port: 5199,
    host: '127.0.0.1',
    fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] },
  },
})
