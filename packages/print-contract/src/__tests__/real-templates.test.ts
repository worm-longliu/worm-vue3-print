import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TemplateData } from '@worm-vue3-print/core/designer'
import { validateTemplateJson } from '../validate.js'
import { inspectTemplate } from '../inspect.js'

// 仓内真实模板：demo 模板、客户端冒烟模板、core 回归 fixture
const ROOT = join(fileURLToPath(new URL('../../../../', import.meta.url)))
const DIRS = [
  { dir: 'demo/src', pattern: /^template-.*\.json$/ },
  { dir: 'packages/print-core/src/render/__tests__/fixtures', pattern: /\.json$/ },
]

function collect(): string[] {
  const files: string[] = []
  for (const { dir, pattern } of DIRS) {
    const abs = join(ROOT, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) {
      if (pattern.test(name)) files.push(join(dir, name))
    }
  }
  files.push('clients/print-client/src/main/test-template.json')
  return files.filter(f => existsSync(join(ROOT, f)))
}

/** 模板文件可能是裸 TemplateData、{version,pages} 多页、或 {templateJson} 包裹 */
function unwrap(raw: unknown): unknown {
  const obj = raw as { templateJson?: unknown }
  return obj && Object.prototype.hasOwnProperty.call(obj, 'templateJson') ? obj.templateJson : raw
}

function pagesOf(input: unknown): TemplateData[] {
  const tpl = input as { pages?: TemplateData[] }
  return Array.isArray(tpl.pages) ? tpl.pages : [input as TemplateData]
}

describe('仓内真实模板必须通过契约校验', () => {
  const files = collect()

  it('至少覆盖到 5 份真实模板（清单失效要立刻知道）', () => {
    expect(files.length).toBeGreaterThanOrEqual(5)
  })

  for (const rel of files) {
    it(`${rel}：无 error 级校验问题`, () => {
      const input = unwrap(JSON.parse(readFileSync(join(ROOT, rel), 'utf8')))
      const result = validateTemplateJson(input)
      const errors = result.issues.filter(i => i.level === 'error')
      // 契约层不得拒绝本仓库自己在用的模板：这里的 error 一定是 schema 写错，不是模板写错
      expect(errors).toEqual([])
      expect(result.ok).toBe(true)
    })

    it(`${rel}：无 error 级版面问题`, () => {
      const input = unwrap(JSON.parse(readFileSync(join(ROOT, rel), 'utf8')))
      const findings = pagesOf(input).flatMap((page, i) =>
        inspectTemplate(page).findings
          .filter(f => f.level === 'error')
          .map(f => `pages[${i}].${f.code} ${f.path}: ${f.message}`),
      )
      // 侵入页边距、同区交叠这类 warning 允许存在于存量模板；error 会判死宿主 AI
      expect(findings).toEqual([])
    })
  }
})
