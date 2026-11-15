import { describe, it, expect, afterEach } from 'vitest'
import { registerElementPlugin, clearElementPlugins } from '@worm-vue3-print/core/designer'
import type { PrintElementPlugin } from '@worm-vue3-print/core/designer'
import { ELEMENT_KINDS, getElementKinds, getElementKindTypes } from '../kinds.js'
import { elementTypeSchema } from '../schema/element.js'

const sealPlugin: PrintElementPlugin = {
  id: '@acme/seal',
  version: '0.4.0',
  kinds: [{
    type: 'seal',
    label: '电子印章',
    blocked: true,
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'],
    notes: '印章图片来自宿主服务',
  }],
}

const chartsPlugin: PrintElementPlugin = {
  id: '@acme/charts',
  version: '2',
  kinds: [
    { type: 'barChart', label: '柱状图' },
    { type: 'pieChart', label: '饼图' },
  ],
  render: { html: () => '<svg/>' },
}

afterEach(() => clearElementPlugins())

describe('内置 kinds 与静态 enum 的一致性', () => {
  it('ELEMENT_KINDS 与 elementTypeSchema 集合一致（P4 删 chart 后自动同步）', () => {
    expect(new Set(ELEMENT_KINDS.map(k => k.type))).toEqual(new Set(elementTypeSchema.options))
    expect(new Set(getElementKindTypes()).size).toBe(getElementKindTypes().length)
  })

  it('无插件注册时动态清单等价于静态基线', () => {
    expect(getElementKinds()).toEqual([...ELEMENT_KINDS])
  })
})

describe('注册态动态 kinds（P1 D4 前置）', () => {
  it('注册插件后 getElementKinds / getElementKindTypes 同时出现新类型', () => {
    registerElementPlugin(sealPlugin)
    const kinds = getElementKinds()
    expect(kinds).toHaveLength(ELEMENT_KINDS.length + 1)
    const seal = kinds.find(k => k.type === 'seal')
    expect(seal).toMatchObject({
      blocked: true,
      pluginId: '@acme/seal',
      requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'],
      notes: '印章图片来自宿主服务',
    })
    expect(getElementKindTypes()).toContain('seal')
  })

  it('一个插件注册多个 kind 时，kinds 与类型清单按 kind 数量展开', () => {
    registerElementPlugin(chartsPlugin)
    const kinds = getElementKinds()
    expect(kinds).toHaveLength(ELEMENT_KINDS.length + 2)
    expect(kinds.filter(k => k.pluginId === '@acme/charts').map(k => k.type)).toEqual(['barChart', 'pieChart'])
    expect(getElementKindTypes()).toEqual(expect.arrayContaining(['barChart', 'pieChart']))
  })

  it('同 type 的插件后注册者覆盖，内置类型不被覆盖', () => {
    registerElementPlugin(chartsPlugin)
    registerElementPlugin({ id: '@acme/charts-pro', version: '1', kinds: [{ type: 'barChart', label: '柱状图 Pro' }] })
    const bar = getElementKinds().find(k => k.type === 'barChart')
    expect(bar?.pluginId).toBe('@acme/charts-pro')
    expect(bar?.notes).toContain('@acme/charts-pro')
    // 内置类型语义不被插件覆盖
    registerElementPlugin({ id: '@acme/text', version: '1', kinds: [{ type: 'text', label: '文本 Pro' }] })
    expect(getElementKinds().find(k => k.type === 'text')?.pluginId).toBeUndefined()
  })

  it('未声明 blocked / notes 的插件回落为通用说明与 blocked=false', () => {
    registerElementPlugin({
      id: '@acme/signature',
      version: '1.0.0',
      kinds: [{ type: 'signature', label: '手写签名' }],
    })
    const kind = getElementKinds().find(k => k.type === 'signature')
    expect(kind?.blocked).toBe(false)
    expect(kind?.requiredOptionKeys).toEqual(['left', 'top', 'width', 'height'])
    expect(kind?.notes).toContain('@acme/signature')
  })

  it('注销插件后动态清单回落到内置基线', () => {
    const dispose = registerElementPlugin(sealPlugin)
    expect(getElementKindTypes()).toContain('seal')
    dispose()
    expect(getElementKindTypes()).not.toContain('seal')
    expect(getElementKinds()).toEqual([...ELEMENT_KINDS])
  })
})
