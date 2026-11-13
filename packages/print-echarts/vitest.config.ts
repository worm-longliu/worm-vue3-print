import { defineConfig } from 'vitest/config'

// 图表渲染器与执行器均走 echarts SSR，测试不依赖真实 DOM，统一 node 环境。
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/*.test.ts'],
  },
})
