import { describe, it, expect, vi } from 'vitest'
import { createTemplateSessionTools, unwrapTemplateShell, type TemplateSessionBridge, type OpenTemplateSession } from '../template-session-tools.js'
import { TOOLS } from '../tools.js'

const call = async (name: string, args: Record<string, unknown>) => {
  const tool = [...TOOLS, ...createTemplateSessionTools(makeBridge([]))]
    .find(t => t.name === name)
  if (!tool) throw new Error(`工具 ${name} 未注册`)
  const r = await tool.handler(args)
  const block = r.content[0]
  if (!block || block.type !== 'text') throw new Error(`工具 ${name} 未返回文本内容`)
  return { text: block.text, isError: !!r.isError }
}

const validTemplate = {
  paperSize: 'A4',
  orientation: 'portrait',
  unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{
    id: 'e1',
    type: 'text',
    options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}' },
    printElementType: { type: 'text' },
  }],
}

const htmlTemplate = (nest: 'content' | 'header' | 'footer' | 'multi') => {
  const htmlEl = { id: 'h', type: 'html', options: { left: 0, top: 0, width: 10, height: 10 }, printElementType: { type: 'html' } }
  const base = { paperSize: 'A4', orientation: 'portrait', unit: 'mm', margins: { top: 10, right: 10, bottom: 10, left: 10 } }
  if (nest === 'content') return { ...base, elements: [{ ...validTemplate.elements[0], id: 'e1' }, htmlEl] }
  if (nest === 'header') return { ...base, elements: [validTemplate.elements[0]], header: { height: 10, elements: [htmlEl] } }
  if (nest === 'footer') return { ...base, elements: [validTemplate.elements[0]], footer: { height: 10, elements: [htmlEl] } }
  return { version: 1, pages: [{ ...base, elements: [validTemplate.elements[0]] }, { ...base, elements: [htmlEl] }] }
}

function session(overrides: Partial<OpenTemplateSession> = {}): OpenTemplateSession {
  return {
    sessionId: 's' + Math.random().toString(36).slice(2, 18).padEnd(17, 'a'),
    name: '综合示例模板',
    url: 'http://localhost:9303/',
    lastActiveAt: Date.now(),
    ...overrides,
  }
}

function makeBridge(sessions: OpenTemplateSession[], overrides: Partial<TemplateSessionBridge> = {}): TemplateSessionBridge {
  return {
    listSessions: () => sessions,
    getTemplate: async () => ({
      session: sessions[0]!,
      revision: 'rev-1',
      templateJson: validTemplate,
      fields: [],
    }),
    applyTemplate: async () => ({
      revision: 'rev-2',
      templateJson: validTemplate,
      warnings: [],
    }),
    ...overrides,
  }
}

describe('模板会话工具 print_list_open_templates', () => {
  it('列出 bridge 会话信息', async () => {
    const r = await call('print_list_open_templates', {})
    const data = JSON.parse(r.text)
    expect(data.sessions).toHaveLength(0)
  })

  it('多会话时带出候选清单', async () => {
    const tools = createTemplateSessionTools(makeBridge(
      [session({ sessionId: 'aaaaaaaaaaaaaaaaaa1', url: 'http://a/' }), session({ sessionId: 'aaaaaaaaaaaaaaaaaa2' })],
    ))
    const t = tools.find(x => x.name === 'print_get_open_template')!
    const r = await t.handler({})
    expect(r.isError).toBe(true)
    expect(String(r.content[0].text)).toContain('aaaaaaaaaaaaaaaaaa1')
    expect(String(r.content[0].text)).toContain('需要指定 sessionId')
  })

  it('无会话时返回可行动文案', async () => {
    const tools = createTemplateSessionTools(makeBridge([]))
    const t = tools.find(x => x.name === 'print_get_open_template')!
    const r = await t.handler({})
    expect(r.isError).toBe(true)
    expect(String(r.content[0].text)).toContain('请先在浏览器打开')
  })

  it('单会话时自动选中', async () => {
    const tools = createTemplateSessionTools(makeBridge([session({ sessionId: 'aaaaaaaaaaaaaaaaaa1' })]))
    const t = tools.find(x => x.name === 'print_get_open_template')!
    const r = await t.handler({})
    const data = JSON.parse(String(r.content[0].text))
    expect(data.revision).toBe('rev-1')
    expect(data.session.templateName ?? '').toBeDefined()
  })

  it('bridge 抛 REVISION_CONFLICT 等错误时不泄漏堆栈且给出重新读取建议', async () => {
    const tools = createTemplateSessionTools(makeBridge([session()], {
      getTemplate: async () => {
        const e = new Error('stack leak: /top/secret')
        Object.assign(e, { code: 'SESSION_NOT_FOUND' })
        throw e
      },
    }))
    const t = tools.find(x => x.name === 'print_get_open_template')!
    const r = await t.handler({})
    expect(r.isError).toBe(true)
    const text = String(r.content[0].text)
    expect(text).toContain('会话不存在')
    expect(text).not.toContain('stack leak')
  })
})

describe('模板会话工具 print_apply_open_template', () => {
  const target = session({ sessionId: 'aaaaaaaaaaaaaaaaaa1' })

  it('happy path：走 bridge 写回并返回新 revision', async () => {
    const apply = vi.fn(async () => ({ revision: 'rev-2', templateJson: validTemplate, warnings: [] }))
    const tools = createTemplateSessionTools(makeBridge([target], { applyTemplate: apply }))
    const t = tools.find(x => x.name === 'print_apply_open_template')!
    const r = await t.handler({ baseRevision: 'rev-1', templateJson: validTemplate })
    expect(r.isError).toBeFalsy()
    const data = JSON.parse(String(r.content[0].text))
    expect(data.revision).toBe('rev-2')
    expect(data.ok).toBe(true)
    // 传递的是规范化后的数据
    expect(apply.mock.calls[0]![0].baseRevision).toBe('rev-1')
    expect((apply.mock.calls[0]![0].templateJson as { paperSize: string }).paperSize).toBe('A4')
  })

  it('契约 error 时拒绝且 bridge 未被调用', async () => {
    const apply = vi.fn()
    const tools = createTemplateSessionTools(makeBridge([target], { applyTemplate: apply }))
    const t = tools.find(x => x.name === 'print_apply_open_template')!
    const r = await t.handler({ baseRevision: 'r', templateJson: { paperSize: 'A99' } })
    expect(r.isError).toBe(true)
    expect(JSON.parse(String(r.content[0].text)).stage).toBe('validate')
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(['content', 'header', 'footer', 'multi'] as const)('拒绝 html 元素（%s 处，%s）', async (nest) => {
    const apply = vi.fn()
    const tools = createTemplateSessionTools(makeBridge([target], { applyTemplate: apply }))
    const t = tools.find(x => x.name === 'print_apply_open_template')!
    const r = await t.handler({ baseRevision: 'r', templateJson: htmlTemplate(nest) })
    expect(r.isError).toBe(true)
    const data = JSON.parse(String(r.content[0].text))
    expect(data.stage).toBe('blocked-elements')
    expect(data.blockedPaths.length).toBeGreaterThan(0)
    expect(apply).not.toHaveBeenCalled()
  })

  it('size 超 4MiB 拒绝', async () => {
    const fat = {
      ...validTemplate,
      elements: Array.from({ length: 45000 }, (_, i) => ({
        id: 'e' + i, type: 'rect', options: { left: 1, top: 1, width: 2, height: 2 }, printElementType: { type: 'rect' },
      })),
    }
    expect(JSON.stringify(fat).length).toBeGreaterThan(4 * 1024 * 1024 - 10)
    const apply = vi.fn()
    const tools = createTemplateSessionTools(makeBridge([target], { applyTemplate: apply }))
    const t = tools.find(x => x.name === 'print_apply_open_template')!
    const r = await t.handler({ baseRevision: 'r', templateJson: fat })
    expect(r.isError).toBe(true)
    expect(String(r.content[0].text)).toContain('MiB')
    expect(apply).not.toHaveBeenCalled()
  })

  it('缺 baseRevision / templateJson 直接拒绝', async () => {
    const tools = createTemplateSessionTools(makeBridge([target]))
    const t = tools.find(x => x.name === 'print_apply_open_template')!
    expect((await t.handler({ templateJson: validTemplate })).isError).toBe(true)
    expect((await t.handler({ baseRevision: 'r' })).isError).toBe(true)
  })

  it('bridge 抛 REVISION_CONFLICT 转为可行动文案', async () => {
    const tools = createTemplateSessionTools(makeBridge([target], {
      applyTemplate: async () => {
        const e = new Error('x')
        Object.assign(e, { code: 'REVISION_CONFLICT' })
        throw e
      },
    }))
    const t = tools.find(x => x.name === 'print_apply_open_template')!
    const r = await t.handler({ baseRevision: 'old', templateJson: validTemplate })
    expect(r.isError).toBe(true)
    const text = String(r.content[0].text)
    expect(text).toContain('重新读取')
    expect(text).toContain('revision')
  })
})

describe('unwrapTemplateShell', () => {
  it('解包 { templateJson } 外壳', () => {
    expect(unwrapTemplateShell({ templateJson: validTemplate, printData: {} })).toEqual(validTemplate)
    expect(unwrapTemplateShell(validTemplate)).toEqual(validTemplate)
  })
})

describe('工具集组合', () => {
  it('桌面组合共 8 个工具且无重复定义', () => {
    const desktop = [...TOOLS, ...createTemplateSessionTools(makeBridge([]))]
    expect(desktop).toHaveLength(8)
    expect(new Set(desktop.map(t => t.name)).size).toBe(8)
  })

  it('apply 工具声明 destructiveHint，宿主应要求批准', () => {
    const t = createTemplateSessionTools(makeBridge([])).find(x => x.name === 'print_apply_open_template')!
    expect(t.annotations?.readOnlyHint).toBe(false)
    expect(t.annotations?.destructiveHint).toBe(true)
  })
})
