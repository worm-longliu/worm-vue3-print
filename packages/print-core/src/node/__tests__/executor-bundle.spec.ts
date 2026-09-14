import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// 本用例验证构建产物本身，必须先构建：npm run build -w @worm-vue3-print/core
// 在真实 Node 子进程里加载产物（vitest 的 SSR 转换会把 import.meta.url 变成非 file: 协议，测不到真实行为）
const distNode = join(process.cwd(), 'dist/node/index.js')
const artifact = join(process.cwd(), 'dist/dom-executor.iife.global.js')

function runInNode(script: string): string {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }).trim()
}

describe('loadExecutorBundle', () => {
  it('产物已生成（否则先跑 core 构建）', () => {
    expect(existsSync(artifact), `缺少 ${artifact}，请先执行 npm run build -w @worm-vue3-print/core`).toBe(true)
  })

  it('真实 Node 进程能加载执行器产物（ESM 与 CJS 出口都要可用）', () => {
    const output = runInNode(`
      const esm = await import(${JSON.stringify(distNode)})
      const bundle = esm.loadExecutorBundle()
      const cjs = await import('node:module').then(m => m.createRequire(${JSON.stringify(distNode)}))
      const cjsBundle = cjs(${JSON.stringify(distNode.replace('index.js', 'index.cjs'))}).loadExecutorBundle()
      console.log(JSON.stringify({
        version: bundle.version,
        hasExecutor: bundle.source.includes('__wormDom'),
        sameSource: bundle.source === cjsBundle.source,
        sizeKb: Math.round(bundle.source.length / 1024),
      }))
    `)
    const result = JSON.parse(output)
    expect(result.version).toBe('1')
    expect(result.hasExecutor).toBe(true)
    expect(result.sameSource).toBe(true)
    expect(result.sizeKb).toBeGreaterThan(50)
  })
})
