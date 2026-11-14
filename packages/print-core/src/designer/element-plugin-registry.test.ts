import { describe, it, expect, afterEach } from 'vitest'
import {
  defineElementPlugin,
  registerElementPlugin,
  getElementPlugin,
  getElementPluginById,
  getElementPlugins,
  getElementPluginTypes,
  configurePlugin,
  getPluginConfig,
  registerLegacyAlias,
  resolveLegacyAlias,
  getLegacyAliases,
  clearElementPlugins,
} from './element-plugin-registry.js'
import type { PrintElementPlugin } from './element-plugin-registry.js'

const plugin = (id: string, type: string, extra: Partial<PrintElementPlugin> = {}): PrintElementPlugin => ({
  kind: { id, version: '1.0.0', type, label: type },
  ...extra,
})

afterEach(() => clearElementPlugins())

describe('defineElementPlugin', () => {
  it('是恒等描述函数，保留全部字段', () => {
    const p = plugin('pkg/a', 'signature')
    expect(defineElementPlugin(p)).toBe(p)
  })

  it('缺 id / version / type 时给可行动错误', () => {
    expect(() => defineElementPlugin({ kind: { id: '', version: '1', type: 'x', label: 'x' } }))
      .toThrow(/kind\.id/)
    expect(() => defineElementPlugin({ kind: { id: 'p', version: '', type: 'x', label: 'x' } }))
      .toThrow(/kind\.version/)
    expect(() => defineElementPlugin({ kind: { id: 'p', version: '1', type: '', label: 'x' } }))
      .toThrow(/kind\.type/)
  })
})

describe('registerElementPlugin / 查询 / 注销', () => {
  it('注册后按 type、id 都能查到，getElementPlugins / Types 同步', () => {
    const p = plugin('pkg/a', 'signature')
    const dispose = registerElementPlugin(p)
    expect(getElementPlugin('signature')).toBe(p)
    expect(getElementPluginById('pkg/a')).toBe(p)
    expect(getElementPlugins()).toEqual([p])
    expect(getElementPluginTypes()).toEqual(['signature'])
    expect(getElementPlugin('unknown')).toBeUndefined()
    dispose()
    expect(getElementPlugin('signature')).toBeUndefined()
    expect(getElementPlugins()).toHaveLength(0)
  })

  it('同 id 重复注册幂等覆盖，旧句柄不会误删新描述符', () => {
    const v1 = plugin('pkg/a', 'signature', { kind: { id: 'pkg/a', version: '1.0.0', type: 'signature', label: '签名' } })
    const v2 = plugin('pkg/a', 'signature', { kind: { id: 'pkg/a', version: '2.0.0', type: 'signature', label: '签名' } })
    const disposeV1 = registerElementPlugin(v1)
    const disposeV2 = registerElementPlugin(v2)
    expect(getElementPlugins()).toHaveLength(1)
    expect(getElementPlugin('signature')?.kind.version).toBe('2.0.0')
    disposeV1()
    expect(getElementPlugin('signature')).toBe(v2)
    disposeV2()
    expect(getElementPlugin('signature')).toBeUndefined()
  })

  it('同 type 由后注册者覆盖，注销它后不回退到前一个插件', () => {
    const a = plugin('pkg/a', 'chart')
    const b = plugin('pkg/b', 'chart')
    const disposeA = registerElementPlugin(a)
    const disposeB = registerElementPlugin(b)
    expect(getElementPlugin('chart')).toBe(b)
    disposeB()
    expect(getElementPlugin('chart')).toBeUndefined()
    expect(getElementPluginById('pkg/a')).toBe(a)
    disposeA()
  })

  it('不同插件的 type 列表去重且按注册顺序', () => {
    registerElementPlugin(plugin('pkg/a', 'signature'))
    registerElementPlugin(plugin('pkg/b', 'seal'))
    expect(getElementPluginTypes()).toEqual(['signature', 'seal'])
  })
})

describe('惰性配置', () => {
  it('配置可早于注册、按浅合并累积，且读取是快照', () => {
    configurePlugin('pkg/a', { theme: 'dark', size: 10 })
    expect(getPluginConfig('pkg/a')).toEqual({ theme: 'dark', size: 10 })
    registerElementPlugin(plugin('pkg/a', 'signature'))
    configurePlugin('pkg/a', { size: 20, extra: true })
    expect(getPluginConfig('pkg/a')).toEqual({ theme: 'dark', size: 20, extra: true })
    const snap = getPluginConfig('pkg/a') as Record<string, unknown>
    snap.size = 999
    expect(getPluginConfig('pkg/a').size).toBe(20)
    expect(() => configurePlugin('', {})).toThrow(/id/)
  })

  it('注销插件不清配置（惰性配置独立于注册生命周期）', () => {
    configurePlugin('pkg/a', { theme: 'light' })
    const dispose = registerElementPlugin(plugin('pkg/a', 'signature'))
    dispose()
    expect(getPluginConfig('pkg/a')).toEqual({ theme: 'light' })
  })
})

describe('兼容别名桥（数据形式，主体零具体类型知识）', () => {
  it('描述符的 legacyAliases 在注册时自动登记', () => {
    registerElementPlugin(plugin('pkg/a', 'signature', {
      legacyAliases: { chartRenderer: 'renderers', renderCharts: 'renderAssets' },
    }))
    expect(resolveLegacyAlias('chartRenderer')).toBe('renderers')
    expect(resolveLegacyAlias('renderCharts')).toBe('renderAssets')
    expect(getLegacyAliases()).toEqual({ chartRenderer: 'renderers', renderCharts: 'renderAssets' })
  })

  it('可单独登记；未登记的别名原样返回', () => {
    registerLegacyAlias('chartBundle', 'bundles[0]')
    expect(resolveLegacyAlias('chartBundle')).toBe('bundles[0]')
    expect(resolveLegacyAlias('neverRegistered')).toBe('neverRegistered')
  })
})

describe('globalThis 单一实例', () => {
  it('注册状态挂在固定 Symbol key 上，模拟第二份 core 也能读到', () => {
    const KEY = Symbol.for('worm-vue3-print.element-plugin-registry.v1')
    const host = globalThis as unknown as Record<symbol, { plugins: Map<string, unknown> } | undefined>
    registerElementPlugin(plugin('pkg/a', 'signature'))
    // 另一份 core 产物会用同一个 Symbol.for key 取到同一个 Map
    expect(host[KEY]?.plugins.has('pkg/a')).toBe(true)
    expect(host[KEY]?.plugins.size).toBe(1)
    clearElementPlugins()
    expect(host[KEY]?.plugins.size).toBe(0)
  })
})
