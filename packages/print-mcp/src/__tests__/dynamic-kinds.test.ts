import { describe, it, expect, afterEach } from 'vitest'
import { registerElementPlugin, clearElementPlugins } from '@worm-vue3-print/core/designer'
import type { PrintElementPlugin } from '@worm-vue3-print/core/designer'
import { getElementKinds } from '@worm-vue3-print/contract'
import { TOOLS } from '../tools.js'

const kindsTool = TOOLS.find(t => t.name === 'print_element_kinds')!
const draftTool = TOOLS.find(t => t.name === 'print_draft_template')!

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const tool = TOOLS.find(t => t.name === name)!
  const r = await tool.handler(args)
  const block = r.content[0]
  if (!block || block.type !== 'text') throw new Error(`工具 ${name} 未返回文本内容`)
  return JSON.parse(block.text)
}

const sealPlugin: PrintElementPlugin = {
  kind: {
    id: '@acme/seal',
    version: '0.4.0',
    type: 'seal',
    label: '电子印章',
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'],
  },
}

/** 从 tools/list 下发的 JSON Schema 里取出 elements[].type 的 enum */
function draftTypeEnum(schema: Record<string, unknown>): string[] {
  const spec = (schema.properties as Record<string, any>).spec
  const elements = spec.properties.elements
  return elements.items.properties.type.enum as string[]
}

afterEach(() => clearElementPlugins())

describe('print_element_kinds 动态返回注册态', () => {
  it('无插件时与 contract 的 getElementKinds 一致', async () => {
    const data = await call('print_element_kinds')
    expect(data.kinds.map((k: { type: string }) => k.type))
      .toEqual(getElementKinds().map(k => k.type))
  })

  it('注册插件后 kinds 立即包含新类型（无需重建工具表）', async () => {
    registerElementPlugin(sealPlugin)
    const data = await call('print_element_kinds')
    const seal = data.kinds.find((k: { type: string }) => k.type === 'seal')
    expect(seal).toMatchObject({ pluginId: '@acme/seal', requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'] })
  })
})

describe('print_draft_template 的 enum 与 kinds 同源', () => {
  it('工具提供 getInputSchema，且静态 inputSchema 与动态生成形状一致', () => {
    expect(kindsTool).toBeDefined()
    expect(typeof draftTool.getInputSchema).toBe('function')
    const live = draftTool.getInputSchema!()
    expect(live.type).toBe('object')
    expect(draftTypeEnum(live)).toEqual(getElementKinds().map(k => k.type))
    expect(draftTypeEnum(draftTool.inputSchema)).toEqual(draftTypeEnum(live))
  })

  it('注册插件后 tools/list 下发的 enum 实时包含新类型', () => {
    const before = draftTypeEnum(draftTool.getInputSchema!())
    expect(before).not.toContain('seal')
    registerElementPlugin(sealPlugin)
    const after = draftTypeEnum(draftTool.getInputSchema!())
    expect(after).toContain('seal')
    expect(after).toEqual(getElementKinds().map(k => k.type))
    expect(after).toHaveLength(before.length + 1)
  })

  it('注销后 enum 回落，且描述里带当前可用类型清单', () => {
    const dispose = registerElementPlugin(sealPlugin)
    const spec = (draftTool.getInputSchema!().properties as Record<string, any>).spec
    const typeField = spec.properties.elements.items.properties.type
    expect(typeField.description).toContain('seal')
    dispose()
    expect(draftTypeEnum(draftTool.getInputSchema!())).not.toContain('seal')
  })
})
