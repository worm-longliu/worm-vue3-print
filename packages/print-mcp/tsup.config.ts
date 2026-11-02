import { defineConfig } from 'tsup'

export default defineConfig({
  // index = 无副作用库入口（桌面主进程 import）；stdio = 命令行连接器入口（bin/start）
  entry: ['src/index.ts', 'src/stdio.ts'],
  format: ['esm'],
  target: 'node18',
  dts: true,
  clean: true,
  shims: true,
  // shebang 必须由 banner 落进产物首行，否则 npx/node 起不来
  banner: { js: '#!/usr/bin/env node' },
  external: ['@worm-vue3-print/core', '@worm-vue3-print/contract', '@modelcontextprotocol/sdk'],
})
