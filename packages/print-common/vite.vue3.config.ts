import { defineConfig } from 'vite'

/**
 * /vue3 子路径独立构建。主入口 vite.config.ts 保持单入口、零框架、逐字不动。
 *
 * vue 与所有 @worm-vue3-print/* 包外置，由宿主 bundler 去重。
 * @worm-vue3-print/common 是 package self-reference（exports 已含 "."），运行时解析到
 * 本包的 dist/index.js，因此不会把设计器源码重复打进子路径产物。
 * emptyOutDir 必须关闭：本构建排在主构建之后，不能清掉 dist/index.js 等产物。
 */
export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/vue3/index.ts',
      formats: ['es', 'cjs'],
      fileName: format => `vue3/index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['vue', /^@worm-vue3-print\/.*$/],
    },
    sourcemap: false,
  },
})
