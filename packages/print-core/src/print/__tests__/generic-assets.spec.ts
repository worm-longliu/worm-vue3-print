// 通用渲染与执行器协议回归（P2/P4 后仍成立）。
//
// 判据：
// ① 新协议真实可用：插件自定义元素能走「绑定 → 通用分派 → 两趟收集 → 出图」全链路；
// ② 一插件多 kind：插件级 binding/render 作为默认、kind 级可覆盖，类型清单与 bundle 收集按 kind 展开；
// ③ 主体零具体元素知识：未注册类型维持既有文本占位，插件渲染抛错只降级不中断整页。
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
import { GENERIC_STUB_BUNDLE_VERSION, registerGenericPluginStub } from './generic-plugin-stub.js'
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

/** 单 kind 徽章插件：插件级 binding + render，作为通用链路的基准夹具 */
const badgePlugin = (overrides: Record<string, unknown> = {}) => defineElementPlugin({
  id: 'test.badge',
  version: '1.0.0',
  kinds: [{ type: 'customBadge', label: '徽章' }],
  binding: {
    bind: (options, data) => ({ _badgeLabel: `${options.title ?? ''}:${data['label'] ?? ''}` }),
  },
  render: {
    html: spec => `<svg data-plugin="badge" data-label="${String(spec._badgeLabel ?? '')}"></svg>`,
  },
  ...overrides,
} as any)

afterEach(() => {
  clearElementPlugins()
})

describe('通用资产工具', () => {
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
      id: 'test.alias',
      version: '1.0.0',
      kinds: [{ type: 'aliasEl', label: '别名' }],
      legacyAliases: { oldAsset: 'renderAssets' },
    }))
    expect(resolveExecutorMethod('renderAssets')).toBe('oldAsset')
  })

  it('类型清单与 bundle 收集：按 version 去重，注册态即部署白名单', () => {
    expect(renderablePluginTypes()).toEqual([])
    expect(assetPluginTypes()).toEqual([])
    registerElementPlugin(defineElementPlugin({
      id: 'p1', version: 'v1',
      kinds: [{ type: 'elA', label: 'A' }],
      render: { html: () => '<i/>', executorBundle: () => ({ name: 'p1', version: 'v1', code: '/* a */' }) },
    }))
    registerElementPlugin(defineElementPlugin({
      id: 'p2', version: 'v1',
      kinds: [{ type: 'elB', label: 'B' }],
      render: { createRenderer: () => ({ render: () => '<i/>' }) },
    }))
    expect(renderablePluginTypes().sort()).toEqual(['elA', 'elB'])
    expect(assetPluginTypes().sort()).toEqual(['elA', 'elB'])
    expect(collectExecutorBundles()).toEqual([{ source: '/* a */', version: 'v1' }])
  })

  it('一个插件多个 kind：类型清单按 kind 展开，executor bundle 只收集一份', () => {
    registerGenericPluginStub()
    expect(renderablePluginTypes().sort()).toEqual(['testBox', 'testSvg'])
    expect(assetPluginTypes().sort()).toEqual(['testBox', 'testSvg'])
    expect(collectExecutorBundles()).toEqual([{ source: '/* stub executor */', version: GENERIC_STUB_BUNDLE_VERSION }])
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

  it('注册无关插件不改变未注册类型的文本占位', () => {
    const template = templateOf('customBadge', { formatter: '未注册文本' })
    const layouts = paginate(template, new Map())
    const before = generateHtml(template, layouts, undefined)
    registerElementPlugin(defineElementPlugin({
      id: 'test.unrelated', version: '1', kinds: [{ type: 'unrelatedEl', label: '无关' }],
      render: { html: () => '<svg data-unrelated="1"></svg>' },
    }))
    expect(generateHtml(template, layouts, undefined)).toBe(before)
  })
})

describe('通用数据绑定（data-binder 插件优先）', () => {
  it('插件 binding.bind 的运行时字段写入 options', () => {
    registerElementPlugin(badgePlugin())
    const bound = bindData(templateOf('customBadge'), { label: '黄金' })
    expect((bound.elements[0] as any).options._badgeLabel).toBe('扩展元素:黄金')
  })

  it('kind 级绑定覆盖插件级绑定，未覆盖的 kind 回落插件级', () => {
    registerGenericPluginStub()
    const boundSvg = bindData(templateOf('testSvg', { chartOption: { series: [] } }), {})
    expect((boundSvg.elements[0] as any).options._svgOption).toEqual({ series: [] })
    const boundBox = bindData(templateOf('testBox'), {})
    expect((boundBox.elements[0] as any).options._svgOption).toBeUndefined()
  })

  it('无插件声明 binding 时元素不产生运行时字段', () => {
    const bound = bindData(templateOf('customBadge'), { label: 'x' })
    expect((bound.elements[0] as any).options._badgeLabel).toBeUndefined()
  })
})

describe('通用两趟出图管线（prepareDocument）', () => {
  it('插件自带 createRenderer 时进程内出图，不触碰会话执行器', async () => {
    registerElementPlugin(defineElementPlugin({
      id: 'test.proc', version: '1.0.0', kinds: [{ type: 'customBadge', label: '徽章' }],
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

  it('无进程内 renderer 时走会话通用执行器并注入插件 bundle', async () => {
    registerGenericPluginStub()
    const fake = createFakeDriverFactory()
    const runtime = createDomHostRuntime(fake.factory, EXECUTOR, collectExecutorBundles())
    const template = templateOf('testSvg', { chartOption: { series: [] } })
    const result = await prepareDocument({ templateJson: template, printData: {} }, runtime)
    expect(result.html).toContain('<svg data-asset="fake"')
    expect(fake.calls.filter(c => c === 'evaluate:renderAssets')).toHaveLength(1)
    expect(fake.calls.filter(c => c === 'evaluate:renderCodes')).toHaveLength(0)
  })

  it('renderAssetSpecs 两级都不产出时返回空映射，由生成器降级文本占位', async () => {
    const map = await renderAssetSpecs([{ key: 'k', type: 'unknown' }])
    expect(map.size).toBe(0)
  })
})

describe('通用渲染器在拼版/批量/多页路径的透传', () => {
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
