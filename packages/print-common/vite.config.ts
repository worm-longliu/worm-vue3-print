import { defineConfig } from 'vite'

/**
 * 库构建：ESM + CJS 双出口，零框架依赖。
 * core 与码制库外置，由宿主 bundler 去重（与 canvas 同口径）。
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
    },
    rollupOptions: {
      external: [/^@worm-vue3-print\/core(\/.*)?$/, 'jsbarcode', 'qrcode'],
      output: { assetFileNames: 'style.css' },
    },
    sourcemap: false,
    emptyOutDir: true,
  },
})
