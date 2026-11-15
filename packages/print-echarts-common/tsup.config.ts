import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  shims: true,
  external: [
    '@worm-vue3-print/core',
    '@worm-vue3-print/core/designer',
    '@worm-vue3-print/echarts',
    '@worm-vue3-print/echarts/kit',
    '@worm-vue3-print/plugin-kit',
  ],
})
