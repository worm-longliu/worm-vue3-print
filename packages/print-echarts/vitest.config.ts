import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 图表渲染器与执行器均走 echarts SSR，测试不依赖真实 DOM，统一 node 环境。
// P5 的生命周期回归会 import 包入口（链路含 .vue 设计器组件），故需挂 Vue 插件做 SFC 转换。
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/__tests__/*.test.ts'],
  },
})
