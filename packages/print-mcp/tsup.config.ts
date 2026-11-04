import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  shims: true,
  external: ['@worm-vue3-print/core', '@worm-vue3-print/contract', '@modelcontextprotocol/sdk'],
})
