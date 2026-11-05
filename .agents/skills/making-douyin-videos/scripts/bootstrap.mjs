#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const at = args.indexOf('--target')
const target = resolve(at >= 0 ? args[at + 1] : join(process.cwd(), '.video'))
if (existsSync(target) && readdirSync(target).length) {
  console.error(`目标目录非空，未覆盖：${target}\n已有 .video 时直接使用；空目录引导请传 --target <空目录>。`)
  process.exit(1)
}
mkdirSync(target, { recursive: true })
cpSync(join(here, '..', 'assets', 'pipeline'), target, { recursive: true, force: false, errorOnExist: true })
console.log(`流水线已生成：${target}\n下一步：npm install（仓库根目录），再按技能文档选择横屏或竖屏链路。`)
