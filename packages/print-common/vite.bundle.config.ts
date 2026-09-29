import { copyFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/**
 * 浏览器直挂产物：dist/common.js（UMD，可 <script src> 直接用）+ dist/common.css。
 * 与库构建（vite.config.ts）不同：core 与码制库全部内联，宿主不需要 bundler / bare import。
 * Shadow DOM 形态样式由组件内联注入；dist/common.css 取 src/styles/designer.css
 * （gen-styles.mjs 从 canvas 派生，含 :host 基线），供 light DOM 形态 <link> 引入。
 */
const CSS_SOURCE = fileURLToPath(new URL('./src/styles/designer.css', import.meta.url))
const CSS_TARGET = fileURLToPath(new URL('./dist/common.css', import.meta.url))

function emitCommonCss(): Plugin {
  return {
    name: 'emit-common-css',
    async closeBundle() {
      await copyFile(CSS_SOURCE, CSS_TARGET)
    },
  }
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@worm-vue3-print\/core\/designer$/, replacement: fileURLToPath(new URL('../print-core/src/designer/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/core\/browser$/, replacement: fileURLToPath(new URL('../print-core/src/browser/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/core\/client$/, replacement: fileURLToPath(new URL('../print-core/src/client/index.ts', import.meta.url)) },
      { find: /^@worm-vue3-print\/core$/, replacement: fileURLToPath(new URL('../print-core/src/index.ts', import.meta.url)) },
    ],
  },
  plugins: [emitCommonCss()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./src/browser-bundle.ts', import.meta.url)),
      output: {
        format: 'umd',
        name: 'WormPrintCommon',
        entryFileNames: 'common.js',
        inlineDynamicImports: true,
      },
    },
  },
})
