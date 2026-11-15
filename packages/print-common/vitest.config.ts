import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // /vue3 门面通过 package self-reference 拿 definePrintDesigner；
    // 测试期直指源码，避免依赖上一次构建产物的新旧。
    alias: {
      '@worm-vue3-print/common': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/__tests__/*.spec.ts'],
  },
})
