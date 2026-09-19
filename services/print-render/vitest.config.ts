import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // spike/ 用于方案验证探针（手写 HTML + 真实 Chromium，单文件可达数分钟），
    // 不属于常规测试，需显式指定路径运行（`npx vitest run spike/xxx.spike.test.ts`），
    // 否则会拖慢 `npm test`。此目录按约定临时存在、验证完即删。
    exclude: [...configDefaults.exclude, 'spike/**'],
  },
})
