#!/usr/bin/env node
/**
 * 给类型声明产物（.d.ts / .d.cts）注入版权头。
 * tsup / vue-tsc 均无法稳定给 dts 产物加 banner，故在构建后统一补齐，
 * 保证 npm 分发链路上「代码 + 类型」两侧都带作者署名。
 * 用法：node ../../scripts/inject-license-banner.mjs dist
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('[license-banner] 缺少目标目录参数')
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(new URL('package.json', `file://${process.cwd()}/`), 'utf-8'))
const banner = `/*!
 * ${pkg.name} v${pkg.version}
 * Copyright (c) 2026 Worm Base AI
 * SPDX-FileCopyrightText: 2026 Worm Base AI
 * SPDX-License-Identifier: MIT
 */\n`

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.d\.(ts|cts|mts)$/.test(name)) out.push(full)
  }
  return out
}

let patched = 0
for (const file of walk(target)) {
  const code = readFileSync(file, 'utf-8')
  if (code.startsWith('/*!') && code.includes('SPDX-License-Identifier')) continue
  writeFileSync(file, banner + code, 'utf-8')
  patched += 1
}
console.log(`[license-banner] ${pkg.name} 类型声明注入版权头：${patched} 个文件`)
