// P0 基线专用配置：刻意不加载 vitest.setup.ts（那会给 *.integration.test.ts 预热真实 Chromium）。
// 默认 vitest.config.ts 已 exclude *.baseline.test.ts，所以 `npm test` 仍只跑原有集成用例；
// 本配置由 `npm run test:baseline -w @worm-vue3-print/render` 显式调用，秒级完成、无需浏览器。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.baseline.test.ts'],
  },
})
