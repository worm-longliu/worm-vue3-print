import { defineConfig } from 'vitest/config'

// 属性台 UI 是原生 DOM 渲染，测试需要 document（happy-dom）
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/__tests__/*.test.ts'],
  },
})
