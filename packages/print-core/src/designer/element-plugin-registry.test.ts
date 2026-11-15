import { describe, it, expect, afterEach } from 'vitest'
import {
  defineElementPlugin,
  registerElementPlugin,
  getElementPlugin,
  getElementPluginById,
  getElementPluginKinds,
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

const plugin = (
  id: string,
  types: string | string[],
  extra: Partial<PrintElementPlugin> = {},
): PrintElementPlugin => ({
  id,
  version: '1.0.0',
  kinds: (Array.isArray(types) ? types : [types]).map(type => ({ type, label: type })),
  ...extra,
})

afterEach(() => clearElementPlugins())

describe('defineElementPlugin', () => {
  it('是恒等描述函数，保留全部字段', () => {
    const p = plugin('pkg/a', 'signature')
    expect(defineElementPlugin(p)).toBe(p)
  })

  it('缺 id / version / kinds / type 时给可行动错误', () => {
    expect(() => defineElementPlugin({ id: '', version: '1', kinds: [{ type: 'x', label: 'x' }] }))
      .toThrow(/id/)
    expect(() => defineElementPlugin({ id: 'p', version: '', kinds: [{ type: 'x', label: 'x' }] }))
      .toThrow(/version/)
    expect(() => defineElementPlugin({ id: 'p', version: '1', kinds: [] }))
      .toThrow(/kinds/)
    expect(() => defineElementPlugin({ id: 'p', version: '1', kinds: [{ type: '', label: 'x' }] }))
      .toThrow(/kinds\[\]\.type/)
  })

  it('同插件内 kind.type 重复直接报错', () => {
    expect(() => defineElementPlugin({
      id: 'p', version: '1',
      kinds: [{ type: 'x', label: 'X' }, { type: 'x', label: 'Y' }],
    })).toThrow(/重复/)
  })
})

describe('registerElementPlugin / 查询 / 注销', () => {
  it('注册后按 type、id 都能查到，getElementPlugins / Types 同步', () => {
    const p = plugin('pkg/a', 'signature')
    const dispose = registerElementPlugin(p)
    // 按 type 返回解析视图，kind 为命中项
    expect(getElementPlugin('signature')?.kind.type).toBe('signature')
    expect(getElementPlugin('signature')?.id).toBe('pkg/a')
    expect(getElementPluginById('pkg/a')).toBe(p)
    expect(getElementPlugins()).toEqual([p])
    expect(getElementPluginTypes()).toEqual(['signature'])
    expect(getElementPlugin('unknown')).toBeUndefined()
    dispose()
    expect(getElementPlugin('signature')).toBeUndefined()
    expect(getElementPlugins()).toHaveLength(0)
  })

  it('一个插件注册多个 kind，按 type 解析出各自的合并视图', () => {
    registerElementPlugin({
      id: '@acme/charts', version: '2',
      kinds: [
        { type: 'barChart', label: '柱状图', defaultOptions: () => ({ width: 100, height: 60 }) },
        { type: 'pieChart', label: '饼图', binding: { bind: () => ({ _kindLevel: true }) } },
      ],
      binding: { bind: () => ({ _pluginLevel: true }) },
      render: { html: () => '<svg data-acme="1"></svg>' },
    })
    expect(getElementPlugin('barChart')?.kind.label).toBe('柱状图')
    expect(getElementPlugin('pieChart')?.kind.label).toBe('饼图')
    // kind 级 binding 覆盖插件级；未覆盖的 kind 回落插件级
    expect(getElementPlugin('pieChart')?.binding?.bind({}, {})).toEqual({ _kindLevel: true })
    expect(getElementPlugin('barChart')?.binding?.bind({}, {})).toEqual({ _pluginLevel: true })
    expect(getElementPlugin('barChart')?.render?.html?.({ type: 'barChart' })).toContain('acme')
    expect(getElementPluginKinds().map(({ kind }) => kind.type)).toEqual(['barChart', 'pieChart'])
    expect(getElementPluginTypes()).toEqual(['barChart', 'pieChart'])
  })

  it('kind 级 designer/render 覆盖插件级默认', () => {
    const shared = { canvasComponent: 'shared' }
    const own = { canvasComponent: 'own' }
    registerElementPlugin({
      id: 'pkg/k', version: '1',
      kinds: [{ type: 'a', label: 'A' }, { type: 'b', label: 'B', designer: own }],
      designer: shared,
    })
    expect(getElementPlugin('a')?.designer).toMatchObject(shared)
    expect(getElementPlugin('b')?.designer).toMatchObject(own)
  })

  it('同 id 重复注册幂等覆盖，旧句柄不会误删新描述符', () => {
    const v1 = plugin('pkg/a', 'signature')
    const v2 = { ...plugin('pkg/a', ['signature', 'seal']), version: '2.0.0' }
    const disposeV1 = registerElementPlugin(v1)
    const disposeV2 = registerElementPlugin(v2)
    expect(getElementPlugins()).toHaveLength(1)
    expect(getElementPluginById('pkg/a')?.version).toBe('2.0.0')
    expect(getElementPluginTypes()).toEqual(['signature', 'seal'])
    disposeV1()
    expect(getElementPluginById('pkg/a')).toBe(v2)
    expect(getElementPlugin('seal')?.id).toBe('pkg/a')
    disposeV2()
    expect(getElementPlugin('signature')).toBeUndefined()
    expect(getElementPlugin('seal')).toBeUndefined()
  })

  it('同 id 重注册会清理旧描述符独占的 type 索引', () => {
    registerElementPlugin(plugin('pkg/a', ['barChart', 'pieChart']))
    registerElementPlugin(plugin('pkg/a', 'lineChart'))
    expect(getElementPlugin('barChart')).toBeUndefined()
    expect(getElementPlugin('pieChart')).toBeUndefined()
    expect(getElementPlugin('lineChart')?.id).toBe('pkg/a')
  })

  it('同 type 由后注册者覆盖，注销它后不回退到前一个插件', () => {
    const a = plugin('pkg/a', 'chart')
    const b = plugin('pkg/b', 'chart')
    const disposeA = registerElementPlugin(a)
    const disposeB = registerElementPlugin(b)
    expect(getElementPlugin('chart')?.id).toBe('pkg/b')
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
    registerElementPlugin({
      ...plugin('pkg/a', 'signature'),
      legacyAliases: { oldRender: 'renderers', oldBundle: 'bundles[0]' },
    })
    expect(resolveLegacyAlias('oldRender')).toBe('renderers')
    expect(resolveLegacyAlias('oldBundle')).toBe('bundles[0]')
    expect(getLegacyAliases()).toEqual({ oldRender: 'renderers', oldBundle: 'bundles[0]' })
  })

  it('可单独登记；未登记的别名原样返回', () => {
    registerLegacyAlias('oldAsset', 'renderAssets')
    expect(resolveLegacyAlias('oldAsset')).toBe('renderAssets')
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
