// 通用扩展元素资产协议（P2）
//
// 与 charts.ts / codes.ts 同构的「收集 → 批量渲染 → 回填」两趟流程，但不认识任何具体元素
// 类型：资产规格只要求一个稳定键，其余字段由插件自行解释。P2 阶段 chart 旧链路保持独立
// 且 100% 不变，P4 原子切换后 chart 插件改用本层，主体即可删除所有图表专属分支。
import type { ElementRenderer, ElementRenderers, ElementRenderSpec } from '../render/types.js'
import type { ExecutorBundle } from './driver.js'
import type { PrintSession } from './ports.js'
import {
  getElementPlugin,
  getElementPlugins,
  getLegacyAliases,
} from '../designer/element-plugin-registry.js'

/** 资产规格：稳定键必填，type 选填（兼容 ChartSpec / CodeSpec 这类无 type 的旧规格） */
export interface AssetSpec {
  key: string
  type?: string
  [field: string]: unknown
}

/** 稳定键：同一份绑定后 options 在测量趟与最终趟必须得到同一个键 */
export function assetSpecKey(spec: Record<string, unknown>): string {
  try {
    return JSON.stringify(spec)
  } catch {
    // 循环引用 / BigInt 等不可序列化内容：退化为字段清单，保证不抛错打断整页渲染
    return `__unserializable__:${Object.keys(spec).sort().join(',')}`
  }
}

function specKey(spec: ElementRenderSpec | AssetSpec): string {
  return spec.key ?? assetSpecKey(spec as Record<string, unknown>)
}

export interface CollectingAssetRenderer {
  /** 传入 generateHtml 的收集型渲染器：命中基映射则返回，否则记录规格并抛错 */
  renderer: ElementRenderer
  /** 取走本趟收集到的规格并清空（按 key 去重） */
  takeSpecs(): AssetSpec[]
}

/**
 * 收集型渲染器：第一趟用它生成 HTML，抛错由 html-generator 降级为占位；
 * 收集到的规格交给会话批量出图，再用映射渲染器第二趟回填。
 */
export function createCollectingAssetRenderer(base?: Map<string, string>): CollectingAssetRenderer {
  const collected = new Map<string, AssetSpec>()
  return {
    renderer: {
      render(spec: ElementRenderSpec): string {
        const key = specKey(spec)
        const hit = base?.get(key)
        if (hit) return hit
        collected.set(key, { ...spec, key } as AssetSpec)
        throw new Error('collect')
      },
    },
    takeSpecs() {
      const specs = [...collected.values()]
      collected.clear()
      return specs
    },
  }
}

/** 映射型渲染器：未命中抛错，由 html-generator 的既有降级逻辑输出占位 */
export function createMapAssetRenderer(map: Map<string, string>): ElementRenderer {
  return {
    render(spec: ElementRenderSpec): string {
      const svg = map.get(specKey(spec))
      if (!svg) throw new Error('扩展元素未渲染')
      return svg
    },
  }
}

/** 合并多趟资产映射；后者覆盖同键，入参不被修改 */
export function mergeAssetMaps(...maps: Array<Map<string, string>>): Map<string, string> {
  const merged = new Map<string, string>()
  for (const map of maps) {
    for (const [key, svg] of map) merged.set(key, svg)
  }
  return merged
}

/** 把单个通用渲染器按已注册类型铺成 renderers 表（generateHtml 按 type 查表） */
export function createAssetRenderers(renderer: ElementRenderer, types: readonly string[]): ElementRenderers {
  const out: Record<string, ElementRenderer> = {}
  for (const type of types) out[type] = renderer
  return out
}

/** 注册表里具备渲染能力（进程内 renderer / 页面 bundle / 静态 html）的元素类型 */
export function renderablePluginTypes(): string[] {
  return getElementPlugins()
    .filter(p => p.render && (p.render.html || p.render.createRenderer || p.render.executorBundle))
    .map(p => p.kind.type)
}

/** 需要「收集 → 批量出图 → 回填」两趟的类型；只提供 html 的插件单趟直出即可 */
export function assetPluginTypes(): string[] {
  return getElementPlugins()
    .filter(p => p.render && (p.render.createRenderer || p.render.executorBundle))
    .map(p => p.kind.type)
}

/**
 * 浏览器进程内出图：没有会话执行器时，逐个查插件自带的 createRenderer。
 * 单个规格失败只跳过该键（由 html-generator 降级为文本占位），不中断整页。
 */
export function renderAssetSpecsInProcess(specs: readonly AssetSpec[]): Map<string, string> {
  const out = new Map<string, string>()
  const cache = new Map<string, ElementRenderer>()
  for (const spec of specs) {
    const type = spec.type ?? ''
    if (!type) continue
    let renderer = cache.get(type)
    if (!renderer) {
      renderer = getElementPlugin(type)?.render?.createRenderer?.()
      if (!renderer) continue
      cache.set(type, renderer)
    }
    try {
      out.set(spec.key, renderer.render(spec as ElementRenderSpec))
    } catch {
      // 与图表/码制同口径：失败键不写映射，最终趟走文本占位
    }
  }
  return out
}

/**
 * 批量出图：先用插件自带的进程内 renderer（浏览器预览/设计器零注入），
 * 未命中的规格再交给会话的通用执行器（服务端 PDF / Electron 页面上下文）。
 * 两级都不产出时返回空映射，由 html-generator 降级为文本占位，不中断整页。
 */
export async function renderAssetSpecs(
  specs: readonly AssetSpec[],
  session?: Pick<PrintSession, 'renderAssets'>,
): Promise<Map<string, string>> {
  if (specs.length === 0) return new Map<string, string>()
  const inProcess = renderAssetSpecsInProcess(specs)
  const rest = specs.filter(s => !inProcess.has(s.key))
  if (rest.length === 0 || !session?.renderAssets) return inProcess
  const fromSession = await session.renderAssets(rest as ElementRenderSpec[])
  return mergeAssetMaps(inProcess, fromSession)
}

/**
 * 从注册表收集插件的页面执行器 bundle，转成 driver 可直接注入的形状。
 * 按 version 去重；禁止按模板字符串动态 import，注册态即部署白名单。
 */
export function collectExecutorBundles(): ExecutorBundle[] {
  const seen = new Set<string>()
  const out: ExecutorBundle[] = []
  for (const plugin of getElementPlugins()) {
    const bundle = plugin.render?.executorBundle?.()
    if (!bundle || seen.has(bundle.version)) continue
    seen.add(bundle.version)
    out.push({ source: bundle.code, version: bundle.version })
  }
  return out
}

/**
 * 通用执行器方法名 → 实际执行器方法名（§3.9 别名桥的反向查表）。
 * 插件注册 `legacyAliases: { renderCharts: 'renderAssets' }` 后，主体调用通用名
 * `renderAssets` 会自动落到执行器真实提供的旧名，主体源码因此零具体类型字面量。
 * 未注册别名时原样返回，供新插件自带 renderAssets 执行器使用。
 */
export function resolveExecutorMethod(method: string): string {
  const aliases = Object.entries(getLegacyAliases())
    .filter(([, to]) => to === method)
    .map(([from]) => from)
    .sort()
  return aliases[0] ?? method
}
