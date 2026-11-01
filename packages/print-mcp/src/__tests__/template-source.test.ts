import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveTemplateSource } from '../template-source.js'

async function dir() {
  return mkdtemp(join(tmpdir(), 'mcp-src-'))
}

const tpl = {
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [],
}

describe('resolveTemplateSource', () => {
  it('优先用直接传入的 templateJson，忽略路径', async () => {
    const r = await resolveTemplateSource({ templateJson: tpl, templatePath: '/不存在.json' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.template).toEqual(tpl)
  })

  it('给路径时读出模板，不必让模型重发整份 JSON', async () => {
    const d = await dir()
    const p = join(d, 'a.json')
    await writeFile(p, JSON.stringify(tpl), 'utf8')
    const r = await resolveTemplateSource({ templatePath: p })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.template).toEqual(tpl)
  })

  it('解包 { templateJson } 外壳（demo 与客户端模板文件常见形状）', async () => {
    const d = await dir()
    const p = join(d, 'wrapped.json')
    await writeFile(p, JSON.stringify({ templateJson: tpl, printData: { a: 1 } }), 'utf8')
    const r = await resolveTemplateSource({ templatePath: p })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.template).toEqual(tpl)
  })

  it('两者都不给 → 明确报错文案', async () => {
    const r = await resolveTemplateSource({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('templateJson')
  })

  it('文件不存在 → 带路径的可行动文案，不抛栈', async () => {
    const r = await resolveTemplateSource({ templatePath: '/tmp/worm-不存在-__nope__.json' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('/tmp/')
  })

  it('非 .json 后缀直接拒（避免把任意文件读给模型）', async () => {
    const r = await resolveTemplateSource({ templatePath: '/etc/hosts' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('.json')
  })

  it('JSON 解析失败 → 说明是解析问题而不是模板不合法', async () => {
    const d = await dir()
    const p = join(d, 'bad.json')
    await writeFile(p, '{ "paperSize": ', 'utf8')
    const r = await resolveTemplateSource({ templatePath: p })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('解析')
  })

  it('超大文件按上限拒绝（默认 5MB）', async () => {
    const d = await dir()
    const p = join(d, 'big.json')
    await writeFile(p, JSON.stringify({ pad: 'x'.repeat(6 * 1024 * 1024) }), 'utf8')
    const r = await resolveTemplateSource({ templatePath: p })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('MB')
    expect((await readFile(p, 'utf8')).length).toBeGreaterThan(5 * 1024 * 1024)
  })
})
