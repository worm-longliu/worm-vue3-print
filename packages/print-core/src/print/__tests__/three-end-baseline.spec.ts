// 三端出图路由基线：三个出图端共用同一条 core 管线，差异只在「谁提供 DriverFactory」。
// 本文件用 fake driver 把三端路由形态跑一遍：
//   prepareDocument —— 浏览器打印预览 / Electron 静默打印（HTML 路由）
//   renderPdf       —— 服务端 PDF / 静默打印「保留验证件 PDF」
//   job.renderers   —— 浏览器设计器预览的调用方覆盖旁路
//   缺插件 bundle   —— 宿主未装配插件执行器时的降级路径
// 图表实现已归插件包，core 侧用无渲染库依赖的通用多 kind 替身走通用通道。
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { prepareDocument, renderPdf } from '../pipeline.js'
import { createDomHostRuntime } from '../dom-host-runtime.js'
import { collectExecutorBundles } from '../assets.js'
import { clearElementPlugins } from '../../designer/element-plugin-registry.js'
import { EXECUTOR, createFakeDriverFactory } from './fake-driver.js'
import { GENERIC_STUB_BUNDLE_VERSION, registerGenericPluginStub } from './generic-plugin-stub.js'
import type { ExecutorBundle } from '../driver.js'
import type { ElementRenderers, TemplateData } from '../../render/types.js'
import type { PrintJob } from '../types.js'

const svgCount = (html: string): number => (html.match(/<svg\b/g) ?? []).length

/** 两个 testSvg 元素：只登记页面执行器，强制走「收集 → 会话出图 → 回填」两趟 */
function genericTemplate(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [
      { id: 'svg-1', type: 'testSvg', options: { left: 0, top: 0, width: 100, height: 60, chartOption: { series: [] } } },
      { id: 'svg-2', type: 'testSvg', options: { left: 0, top: 70, width: 100, height: 60, chartOption: { series: [] } } },
    ],
  } as unknown as TemplateData
}

const jobOf = (overrides: Partial<PrintJob> = {}): PrintJob => ({
  templateJson: genericTemplate(),
  printData: { rows: [{ name: 'A', value: 12 }] },
  ...overrides,
})

function runtimeOf(withBundles = true) {
  const fake = createFakeDriverFactory()
  const injectedVersions: string[] = []
  const originalInject = fake.driver.injectExecutor
  fake.driver.injectExecutor = async (bundle: ExecutorBundle) => {
    injectedVersions.push(bundle.version)
    await originalInject(bundle)
  }
  const bundles = withBundles ? collectExecutorBundles() : []
  const runtime = createDomHostRuntime(fake.factory, EXECUTOR, bundles)
  return { fake, injectedVersions, runtime, bundles }
}

describe('三端扩展元素出图路由（通用通道）', () => {
  beforeAll(() => { registerGenericPluginStub() })
  afterAll(() => { clearElementPlugins() })

  it('prepareDocument：内联 2 个 SVG，页面只渲染一次，core 与插件执行器各按需注入', async () => {
    const { fake, injectedVersions, runtime, bundles } = runtimeOf()
    expect(bundles).toEqual([{ source: '/* stub executor */', version: GENERIC_STUB_BUNDLE_VERSION }])

    const result = await prepareDocument(jobOf(), runtime)

    expect(svgCount(result.html)).toBe(2)
    expect(svgCount(fake.documents.at(-1) ?? '')).toBe(2)
    // 测量趟渲染一次，最终趟复用 assetBaseMap，不重复渲染
    expect(fake.calls.filter(call => call === 'evaluate:renderAssets')).toHaveLength(1)
    // core 执行器 ×2（文档重建后注入标记重置）+ 插件执行器 ×1
    expect(injectedVersions.filter(v => v === EXECUTOR.version)).toHaveLength(2)
    expect(injectedVersions.filter(v => v === GENERIC_STUB_BUNDLE_VERSION)).toHaveLength(1)
    expect(result.pageCount).toBe(1)
  })

  it('renderPdf：PDF 与 HTML 出自同一份含 2 个 SVG 的文档', async () => {
    const { runtime } = runtimeOf()
    const result = await renderPdf(jobOf(), runtime)
    expect(svgCount(result.prepared.html)).toBe(2)
    expect(result.pdf).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('job.renderers 覆盖：宿主直供渲染器时不再收集、不触碰会话执行器', async () => {
    const { fake, runtime } = runtimeOf()
    const renderers: ElementRenderers = {
      testSvg: { render: (spec: { type?: unknown }) => `<svg data-host="${String(spec.type)}"></svg>` },
    }
    const result = await prepareDocument(jobOf({ renderers }), runtime)
    expect(svgCount(result.html)).toBe(2)
    expect(result.html).toContain('data-host="testSvg"')
    expect(fake.calls.filter(call => call.startsWith('evaluate:render'))).toEqual([])
  })

  it('未装配插件 bundle 时不影响测量与分页，出图由会话降级（fake driver 仍返回资产 SVG）', async () => {
    const { runtime, injectedVersions } = runtimeOf(false)
    const result = await prepareDocument(jobOf(), runtime)
    expect(result.pageCount).toBe(1)
    expect(injectedVersions.filter(v => v === GENERIC_STUB_BUNDLE_VERSION)).toHaveLength(0)
  })
})
