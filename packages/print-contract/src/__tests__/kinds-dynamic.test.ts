import { describe, it, expect, afterEach } from 'vitest'
import { registerElementPlugin, clearElementPlugins } from '@worm-vue3-print/core/designer'
import type { PrintElementPlugin } from '@worm-vue3-print/core/designer'
import { ELEMENT_KINDS, getElementKinds, getElementKindTypes } from '../kinds.js'
import { elementTypeSchema } from '../schema/element.js'

const sealPlugin: PrintElementPlugin = {
  kind: {
    id: '@acme/seal',
    version: '0.4.0',
    type: 'seal',
    label: '电子印章',
    blocked: true,
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'sealId'],
    notes: '印章图片来自宿主服务',
  },
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

  it('P4：扩展类型不再是内置项，由插件注册态进入动态 kinds', () => {
    // 主体已删除内置 chart 说明，未注册时 AI/契约侧看不到该类型
    expect(getElementKinds().some(k => k.type === 'chart')).toBe(false)
    registerElementPlugin({
      kind: { id: '@acme/chart-pro', version: '1.0.0', type: 'chart', label: '增强图表' },
    })
    const chartKinds = getElementKinds().filter(k => k.type === 'chart')
    expect(chartKinds).toHaveLength(1)
    expect(chartKinds[0].pluginId).toBe('@acme/chart-pro')
    expect(chartKinds[0].requiredOptionKeys).toEqual(['left', 'top', 'width', 'height'])
  })

  it('未声明 blocked / notes 的插件回落为通用说明与 blocked=false', () => {
    registerElementPlugin({
      kind: { id: '@acme/signature', version: '1.0.0', type: 'signature', label: '手写签名' },
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
