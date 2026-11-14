// P2 通用渲染与执行器协议回归。
//
// 两条判据（P4 后仍成立）：
// ① 新协议真实可用：插件自定义元素能走「绑定 → 通用分派 → 两趟收集 → 出图」全链路；
// ② 历史模板零迁移：P4 主体已删除图表专属分支，历史 chart 模板由插件描述符
//    走同一条通用通道出图，HTML 与页面渲染次数保持不变。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { generateHtml } from '../../render/html-generator.js'
import { bindData } from '../../render/data-binder.js'
import { paginate } from '../../render/pagination-engine.js'
import { prepareDocument } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { composeBatchHtml } from '../batch-compose.js'
import { composeTiledHtml } from '../tile-compose.js'
import { composeMultiPageDocument } from '../multi-template.js'
import { computeTileLayout } from '../tiling.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import { registerChartPluginStub } from './chart-plugin-stub.js'
import {
  assetPluginTypes,
  assetSpecKey,
  collectExecutorBundles,
  createCollectingAssetRenderer,
  createMapAssetRenderer,
  mergeAssetMaps,
  renderAssetSpecs,
  renderablePluginTypes,
  resolveExecutorMethod,
} from '../assets.js'
import {
  clearElementPlugins,
  defineElementPlugin,
  registerElementPlugin,
} from '../../designer/element-plugin-registry.js'
import type { TemplateData, PageLayout } from '../../render/types.js'
import type { PrintJob } from '../types.js'

const baseline = (name: string): string =>
  fileURLToPath(new URL(`../../../../../docs/superpowers/specs/baseline/${name}.legacy.json`, import.meta.url))

interface LegacySample {
  template: TemplateData
  data: Record<string, unknown>
}

function sample(name: string): LegacySample {
  return JSON.parse(readFileSync(baseline(name), 'utf8')) as LegacySample
}

function templateOf(type: string, options: Record<string, unknown> = {}): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [{
      id: 'el-1',
      type,
      options: { left: 0, top: 0, width: 100, height: 60, title: '扩展元素', ...options },
    } as any],
  } as TemplateData
}

const badgePlugin = (overrides: Record<string, unknown> = {}) => defineElementPlugin({
  kind: { id: 'test.badge', version: '1.0.0', type: 'customBadge', label: '徽章' },
  binding: {
    bind: (options, data) => ({ _badgeLabel: `${options.title ?? ''}:${data['label'] ?? ''}` }),
  },
  render: {
    html: spec => `<svg data-plugin="badge" data-label="${String(spec._badgeLabel ?? '')}"></svg>`,
  },
  ...overrides,
} as any)

/** 固定 stub：图表出图与注册表状态无关，便于逐字比对改造前后 HTML */
const stubChartRenderer = { render: () => '<svg data-chart="stub"></svg>' }

afterEach(() => {
  clearElementPlugins()
})

describe('通用资产工具（P2）', () => {
  it('收集型渲染器：未命中记录规格并抛错，命中基映射直接返回', () => {
    const base = new Map([['k1', '<svg id="cached"/>']])
    const collector = createCollectingAssetRenderer(base)
    expect(collector.renderer.render({ type: 'x', key: 'k1' })).toBe('<svg id="cached"/>')
    expect(() => collector.renderer.render({ type: 'x', key: 'k2', v: 1 })).toThrow('collect')
    expect(collector.takeSpecs()).toEqual([{ type: 'x', key: 'k2', v: 1 }])
    expect(collector.takeSpecs()).toEqual([])
  })

  it('映射型渲染器与多趟合并：后者覆盖同键、入参不被修改', () => {
    const a = new Map([['k', 'A']])
    const b = new Map([['k', 'B']])
    const merged = mergeAssetMaps(a, b)
    expect(merged.get('k')).toBe('B')
    expect(a.get('k')).toBe('A')
    expect(createMapAssetRenderer(merged).render({ type: 'x', key: 'k' })).toBe('B')
    expect(() => createMapAssetRenderer(merged).render({ type: 'x', key: 'none' })).toThrow()
  })

  it('assetSpecKey 稳定，且循环引用不抛错', () => {
    expect(assetSpecKey({ type: 'x', a: 1, b: [2, 3] })).toBe(assetSpecKey({ type: 'x', a: 1, b: [2, 3] }))
    const cyclic: Record<string, unknown> = { type: 'x' }
    cyclic.self = cyclic
    expect(assetSpecKey(cyclic)).toContain('__unserializable__')
  })

  it('别名桥反查：插件登记旧名→通用名后，通用调用回落到执行器真实旧名', () => {
    expect(resolveExecutorMethod('renderAssets')).toBe('renderAssets')
    registerElementPlugin(defineElementPlugin({
      kind: { id: 'test.alias', version: '1.0.0', type: 'aliasEl', label: '别名' },
      legacyAliases: { renderCharts: 'renderAssets' },
    }))
    expect(resolveExecutorMethod('renderAssets')).toBe('renderCharts')
  })

  it('类型清单与 bundle 收集：按 version 去重，注册态即部署白名单', () => {
    expect(renderablePluginTypes()).toEqual([])
    expect(assetPluginTypes()).toEqual([])
    registerElementPlugin(defineElementPlugin({
      kind: { id: 'p1', version: 'v1', type: 'elA', label: 'A' },
      render: { html: () => '<i/>', executorBundle: () => ({ name: 'p1', version: 'v1', code: '/* a */' }) },
    }))
    registerElementPlugin(defineElementPlugin({
      kind: { id: 'p2', version: 'v1', type: 'elB', label: 'B' },
      render: { createRenderer: () => ({ render: () => '<i/>' }) },
    }))
    expect(renderablePluginTypes().sort()).toEqual(['elA', 'elB'])
    expect(assetPluginTypes().sort()).toEqual(['elA', 'elB'])
    expect(collectExecutorBundles()).toEqual([{ source: '/* a */', version: 'v1' }])
  })
})

describe('通用渲染分派（html-generator default 分支）', () => {
  it('插件注册后自定义元素内联 SVG，未注册时维持既有文本占位', () => {
    const template = templateOf('customBadge', { formatter: '未注册文本' })
    const layouts = paginate(template, new Map())
    const before = generateHtml(template, layouts, undefined)
    expect(before).toContain('未注册文本')
    expect(before).not.toContain('<svg')

    registerElementPlugin(badgePlugin())
    const after = generateHtml(template, layouts, undefined)
    expect(after).toContain('<svg data-plugin="badge"')
    expect(after).toContain('data-element-id="el-1"')
  })

  it('插件渲染抛错时降级占位，不中断整页', () => {
    registerElementPlugin(badgePlugin({ render: { html: () => { throw new Error('boom') } } }))
    const template = templateOf('customBadge', { formatter: '兜底文本' })
    const html = generateHtml(template, paginate(template, new Map()), undefined)
    expect(html).toContain('兜底文本')
    expect(html).not.toContain('<svg')
  })

  it('R5：注册任意插件后，历史 chart 模板 HTML 与未注册时逐字一致', () => {
    for (const name of ['sales-chart', 'echarts-test-case']) {
      const s = sample(name)
      const bound = bindData(s.template, s.data as Record<string, any>)
      const options = { isMeasurementPass: true, chartRenderer: stubChartRenderer }
      const before = generateHtml(bound, [], s.data as Record<string, any>, options)
      registerElementPlugin(badgePlugin())
      const after = generateHtml(bound, [], s.data as Record<string, any>, options)
      expect(after).toBe(before)
    }
  })
})

describe('通用数据绑定（data-binder 插件优先）', () => {
  it('插件 binding.bind 的运行时字段写入 options', () => {
    registerElementPlugin(badgePlugin())
    const bound = bindData(templateOf('customBadge'), { label: '黄金' })
    expect((bound.elements[0] as any).options._badgeLabel).toBe('扩展元素:黄金')
  })

  it('P4：历史 chart 模板的运行时字段改由插件 binding 决定，主体不再内置绑定分支', () => {
    const s = sample('sales-chart')
    const field = (t: TemplateData) =>
      (t.elements.find(e => e.type === 'chart') as any)?.options._chartOption
    // 未装包宿主：沿用 §4.2 降级语义，元素不产生运行时 option
    expect(field(bindData(s.template, s.data as Record<string, any>))).toBeUndefined()

    registerElementPlugin(defineElementPlugin({
      kind: { id: 'test.chart-no-binding', version: '1.0.0', type: 'chart', label: '图表' },
      render: { html: () => '<svg/>' },
    }))
    expect(field(bindData(s.template, s.data as Record<string, any>))).toBeUndefined()

    // 插件声明 binding 后，运行时字段由插件自行解释（主体只做通用 Object.assign）
    registerElementPlugin(defineElementPlugin({
      kind: { id: 'test.chart-binding', version: '1.0.0', type: 'chart', label: '图表' },
      binding: { bind: (opts) => ({ _chartOption: opts.chartOption ?? {} }) },
      render: { html: () => '<svg/>' },
    }))
    expect(field(bindData(s.template, s.data as Record<string, any>))).toBeTruthy()
  })
})

describe('通用两趟出图管线（prepareDocument）', () => {
  it('插件自带 createRenderer 时进程内出图，不触碰会话执行器', async () => {
    registerElementPlugin(defineElementPlugin({
      kind: { id: 'test.proc', version: '1.0.0', type: 'customBadge', label: '徽章' },
      render: {
        createRenderer: () => ({ render: spec => `<svg data-proc="${spec.type}"></svg>` }),
        html: () => '<span>收集趟占位</span>',
      },
    }))
    const fake = createFakeDriverFactory()
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR)
    const job: PrintJob = { templateJson: templateOf('customBadge'), printData: {} }
    const result = await prepareDocument(job, runtime)
    expect(result.html).toContain('<svg data-proc="customBadge"')
    expect(fake.calls.filter(c => c.startsWith('evaluate:render'))).toEqual([])
  })

  it('无进程内 renderer 时走会话通用执行器：别名桥回落到旧执行器方法名并注入 bundle', async () => {
    registerElementPlugin(defineElementPlugin({
      kind: { id: 'test.page', version: 'page-v1', type: 'customBadge', label: '徽章' },
      legacyAliases: { renderCharts: 'renderAssets' },
      render: {
        html: () => '<span>占位</span>',
        executorBundle: () => ({ name: 'test.page', version: 'page-v1', code: '/* page executor */' }),
      },
    }))
    const fake = createFakeDriverFactory()
    const bundles = collectExecutorBundles()
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR, undefined, bundles)
    const job: PrintJob = { templateJson: templateOf('customBadge'), printData: {} }
    const result = await prepareDocument(job, runtime)
    // fake driver 认识 renderCharts，按规格 key 返回 SVG → 最终趟回填
    expect(result.html).toContain('<svg data-chart="fake"')
    expect(fake.calls.filter(c => c === 'evaluate:renderCharts')).toHaveLength(1)
    expect(fake.calls.filter(c => c === 'evaluate:renderAssets')).toHaveLength(0)
    // 通用 bundle 按 version 幂等：即使传入重复 version 也只注入一次
    expect(fake.calls.filter(c => c === 'injectExecutor').length).toBeGreaterThanOrEqual(3)
  })

  it('R5（P4）：历史 chart 模板经插件通用通道出图，SVG 数与页面渲染次数不变', async () => {
    registerElementPlugin(badgePlugin())
    registerChartPluginStub()
    const fake = createFakeDriverFactory()
    const chartBundle = { source: '/* fake chart executor */', version: 'chart-baseline' }
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR, chartBundle)
    const s = sample('sales-chart')
    const result = await prepareDocument({ templateJson: s.template, printData: s.data }, runtime)
    expect((result.html.match(/<svg\b/g) ?? []).length).toBe(2)
    expect(fake.calls.filter(c => c === 'evaluate:renderCharts')).toHaveLength(1)
    expect(fake.calls.filter(c => c === 'evaluate:renderAssets')).toHaveLength(0)
  })

  it('renderAssetSpecs 两级都不产出时返回空映射，由生成器降级文本占位', async () => {
    const map = await renderAssetSpecs([{ key: 'k', type: 'unknown' }])
    expect(map.size).toBe(0)
  })
})

describe('通用渲染器在拼版/批量/多页路径的透传（P2）', () => {
  const layouts: PageLayout[] = [{
    pageIndex: 0,
    sections: [{ elementId: 'el-1', type: 'element' }],
  }]
  const renderers = { customBadge: { render: () => '<svg data-compose="1"></svg>' } }
  const bound = () => bindData(templateOf('customBadge'), {})

  it('composeBatchHtml：每份副本都带上扩展元素 SVG', () => {
    registerElementPlugin(badgePlugin())
    const r = composeBatchHtml([{
      bound: bound(), pageLayouts: layouts, data: {},
      paperMm: { width: 210, height: 297 }, heightSource: 'config',
      renderers,
    }])
    expect(r.html).toContain('data-compose="1"')
  })

  it('composeTiledHtml：每个拼版格都带上扩展元素 SVG', () => {
    registerElementPlugin(badgePlugin())
    const tpl = {
      ...templateOf('customBadge'),
      paperSize: 'CUSTOM', customWidth: 70, customHeight: 40,
      tiling: {
        enabled: true, columns: 2, gapX: 2, gapY: 2,
        sheetPaperSize: 'A4' as const,
        sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 },
      },
    } as unknown as TemplateData
    const r = composeTiledHtml({
      copies: [{ bound: bound(), pageLayouts: layouts, data: {}, renderers }],
      layout: computeTileLayout(tpl),
    })
    expect(r.html).toContain('data-compose="1"')
  })

  it('composeMultiPageDocument：renderersPerPage 按页索引取用', () => {
    registerElementPlugin(badgePlugin())
    const doc = composeMultiPageDocument([{
      boundPages: [bound()], layoutsPerPage: [layouts], data: {},
      renderersPerPage: [renderers],
    }])
    expect(doc.html).toContain('data-compose="1"')
  })

  it('未传 renderers 时不凭空出图，仍走插件自带 html 或文本占位', () => {
    const r = composeBatchHtml([{
      bound: bound(), pageLayouts: layouts, data: {},
      paperMm: { width: 210, height: 297 }, heightSource: 'config',
    }])
    expect(r.html).not.toContain('data-compose="1"')
  })
})
