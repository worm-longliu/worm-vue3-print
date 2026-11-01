import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  shims: true,
  // shebang 必须由 banner 落进产物首行，否则 npx/node 起不来
  banner: { js: '#!/usr/bin/env node' },
  external: ['@worm-vue3-print/core', '@worm-vue3-print/contract', '@modelcontextprotocol/sdk'],
})
