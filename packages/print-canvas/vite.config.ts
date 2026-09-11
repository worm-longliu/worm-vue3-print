import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
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
        'sortablejs',
      ],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
})
