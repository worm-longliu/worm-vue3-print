// @vitest-environment happy-dom
// 第三方「图表式」插件的端到端回归：一个插件同时提供 core 描述符（绑定/出图）与
// plugin-kit UI（画布/属性台），验证它在 common 里从素材卡一路走到出纸都不掉链子。
// 与 plugin-elements.spec.ts 的分工：那边测宿主消费机制，这边测「用户自己写插件」的完整链路。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DEMO_DATA, defineElementPlugin, getElementPluginKinds, registerElementPlugin,
} from '@worm-vue3-print/core/designer'
import type { ElementType, PrintBusinessField, RuntimeElement } from '@worm-vue3-print/core/designer'
import { renderHtmlPages } from '@worm-vue3-print/core/browser'
import { clearElementUIs, defineElementUI, registerElementUI } from '@worm-vue3-print/plugin-kit'
import type { DesignerStore } from '../core/store'
import { PrintDesignerElement, definePrintDesigner } from '../print-designer'

/** happy-dom 该版本未实现 Storage：面板折叠态读写需要 localStorage */
function stubStorage() {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, String(v)) },
      removeItem: (k: string) => { map.delete(k) },
      clear: () => map.clear(),
    },
  })
}

// happy-dom 不实现 canvas 2d 上下文：出纸管线的码制测量与标尺绘制都要它。
// 用 Proxy 兜住所有绘图方法（与 expression-dblclick.spec.ts 同款），避免覆盖后标尺缺方法。
const ctxTarget: Record<string, unknown> = { measureText: (t: unknown) => ({ width: String(t).length * 8 }) }
const noopCtx: Record<string, unknown> = new Proxy(ctxTarget, {
  get: (target, prop) => (prop in target ? target[prop as string] : () => noopCtx),
  set: () => true,
})
;(HTMLCanvasElement.prototype as unknown as { getContext: (t: string) => unknown }).getContext = () => noopCtx

function frame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

interface ChartRow { name: string; value: number }

const CHART_TYPE = 'acmeBarChart'
const PLUGIN_ID = '@acme/bar-chart'
const HOST_ROWS: ChartRow[] = [{ name: '一月', value: 12 }, { name: '二月', value: 28 }, { name: '三月', value: 19 }]
const HOST_FIELDS: PrintBusinessField[] = [
  { fieldKey: 'trend', fieldLabel: '趋势数据', fieldType: 'list', sortOrder: 1 },
  { fieldKey: 'title', fieldLabel: '报表标题', fieldType: 'string', sortOrder: 2 },
]
const HOST_DATA = { trend: HOST_ROWS, title: '三季度趋势' }

const disposeCanvas = vi.fn()
const disposeProperty = vi.fn()

function svgFor(rows: readonly ChartRow[], title: string): string {
  const bars = rows.map(r => `<rect data-name="${r.name}" data-value="${r.value}"/>`).join('')
  return `<svg class="acme-chart" data-title="${title}" data-count="${rows.length}">${bars}</svg>`
}

const rowsOf = (spec: unknown): ChartRow[] => {
  const value = (spec as { chartRows?: unknown }).chartRows
  return Array.isArray(value) ? value as ChartRow[] : []
}

/** 一个「类似百度图表」的第三方插件：数据绑定 + 进程内 SSR + 兜底内联 SVG */
const CHART_PLUGIN = defineElementPlugin({
  id: PLUGIN_ID,
  version: '1.0.0',
  kinds: [{
    type: CHART_TYPE,
    label: '柱状图（第三方）',
    icon: 'ChartColumn',
    fixedHeight: true,
    designer: { materialCard: { group: '第三方图表' } },
    requiredOptionKeys: ['left', 'top', 'width', 'height', 'dataSource'],
    optionMeta: {
      dataSource: { kind: 'text', label: '数据源', default: 'trend' },
      chartTitle: { kind: 'text', label: '图表标题', default: '趋势' },
    },
    defaultOptions: () => ({ width: 100, height: 55, dataSource: 'trend', chartTitle: '趋势' }),
  }],
  binding: {
    bind: (options, data) => {
      const rows = data[String(options.dataSource ?? '')]
      return Array.isArray(rows) ? { chartRows: rows } : {}
    },
  },
  render: {
    html: spec => svgFor(rowsOf(spec), String((spec as { chartTitle?: string }).chartTitle ?? '')),
    createRenderer: () => ({ render: spec => svgFor(rowsOf(spec), String((spec as { chartTitle?: string }).chartTitle ?? '')) }),
  },
})

const CHART_UI = defineElementUI({
  types: [CHART_TYPE],
  styles: '.acme-chart-canvas{width:100%;height:100%}',
  searchKeywords: ['柱状图', '图表'],
  renderCanvas: ({ element, data }) => {
    const box = document.createElement('div')
    box.className = 'acme-chart-canvas'
    const source = String(element.options.dataSource ?? '')
    const rows = (data?.[0]?.[source] as ChartRow[] | undefined) ?? []
    box.setAttribute('data-source', source)
    box.setAttribute('data-count', String(rows.length))
    // 专属属性由插件声明合并注入；测试夹具不走 declare module，直接按动态键读取
    box.innerHTML = svgFor(rows, String((element.options as unknown as Record<string, unknown>).chartTitle ?? ''))
    return { node: box, dispose: disposeCanvas }
  },
  renderProperty: ({ element, fields, update, repaint }) => {
    const wrap = document.createElement('div')
    wrap.className = 'acme-chart-props'
    const select = document.createElement('select')
    select.className = 'acme-data-source'
    for (const field of fields ?? []) {
      const option = document.createElement('option')
      option.value = field.fieldKey
      option.textContent = field.fieldLabel
      select.appendChild(option)
    }
    select.value = String(element.options.dataSource ?? '')
    select.addEventListener('change', () => update({ dataSource: select.value }))
    const rename = document.createElement('button')
    rename.type = 'button'
    rename.className = 'acme-rename'
    rename.textContent = '改标题'
    rename.addEventListener('click', () => repaint())
    wrap.append(select, rename)
    return { node: wrap, dispose: disposeProperty }
  },
})

let unregisterPlugin: (() => void) | null = null
let unregisterUI: (() => void) | null = null

function registerChartPlugin() {
  unregisterPlugin = registerElementPlugin(CHART_PLUGIN)
  unregisterUI = registerElementUI(CHART_UI)
}

async function mountDesigner(init?: { designData?: unknown; fields?: PrintBusinessField[] }) {
  definePrintDesigner()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = document.createElement('print-designer') as PrintDesignerElement
  host.appendChild(el)
  if (init?.fields) el.fields = init.fields
  if (init?.designData !== undefined) el.designData = init.designData
  await frame()
  return { el, root: el.shadowRoot!, store: (el as unknown as { store: DesignerStore }).store }
}

function addChart(store: DesignerStore): RuntimeElement {
  return store.addElement(CHART_TYPE as ElementType, { left: 20, top: 20, width: 100, height: 55 })
}

const propTabs = (root: ParentNode) =>
  Array.from(root.querySelectorAll<HTMLElement>('.prop-tabs .pd-tab-bar .pd-tab'))

beforeEach(() => {
  stubStorage()
  disposeCanvas.mockClear()
  disposeProperty.mockClear()
})

afterEach(() => {
  document.body.replaceChildren()
  unregisterUI?.()
  unregisterUI = null
  unregisterPlugin?.()
  unregisterPlugin = null
  clearElementUIs()
})

describe('第三方图表插件：设计器链路', () => {
  it('素材卡按 core 注册顺序出现，分组标题与拖拽载荷都由描述符决定', async () => {
    registerChartPlugin()
    const { root } = await mountDesigner()
    const card = root.querySelector<HTMLElement>(`[data-test="material-${CHART_TYPE}"]`)!
    expect(card).not.toBeNull()
    expect(card.querySelector('.material-label')?.textContent).toBe('柱状图（第三方）')
    expect(card.previousElementSibling?.textContent).toBe('第三方图表')
    const setData = vi.fn()
    const ev = new Event('dragstart') as DragEvent
    Object.defineProperty(ev, 'dataTransfer', { value: { setData, effectAllowed: '' } })
    card.dispatchEvent(ev)
    expect(setData).toHaveBeenCalledWith('elementType', CHART_TYPE)
  })

  it('core 注册表把新类型纳入动态 kinds，宿主无需第二份白名单', () => {
    registerChartPlugin()
    expect(getElementPluginKinds().some(entry => entry.kind.type === CHART_TYPE)).toBe(true)
  })

  it('宿主注入 designData 后画布用的是真实业务数据，而不是内置 demo 数据', async () => {
    registerChartPlugin()
    const { root, store } = await mountDesigner({ designData: HOST_DATA, fields: HOST_FIELDS })
    const el = addChart(store)
    await frame()
    const box = root.querySelector<HTMLElement>(`[data-el-id="${el.id}"] .acme-chart-canvas`)!
    expect(box.getAttribute('data-source')).toBe('trend')
    expect(box.getAttribute('data-count')).toBe('3')
    expect(box.querySelector('[data-name="二月"]')).not.toBeNull()
  })

  it('未注入 designData 时回落 DEFAULT_DEMO_DATA，老宿主零改动', async () => {
    registerChartPlugin()
    const { root, store } = await mountDesigner({ fields: HOST_FIELDS })
    const el = addChart(store)
    await frame()
    const box = root.querySelector<HTMLElement>(`[data-el-id="${el.id}"] .acme-chart-canvas`)!
    // demo 数据里没有插件默认的 'trend' 键，因此柱数为 0；重点是没把宿主数据凭空造出来
    expect(box.getAttribute('data-count')).toBe('0')
    expect(DEFAULT_DEMO_DATA.trend).toBeUndefined()
  })

  it('design-data attribute 与 setter 等价，单对象自动归一成数组信封', async () => {
    registerChartPlugin()
    const { el, root, store } = await mountDesigner({ fields: HOST_FIELDS })
    el.setAttribute('design-data', JSON.stringify([HOST_DATA]))
    const chart = addChart(store)
    await frame()
    expect(root.querySelector<HTMLElement>(`[data-el-id="${chart.id}"] .acme-chart-canvas`)!.getAttribute('data-count')).toBe('3')
  })

  it('属性台首位「自定义属性」拿到宿主业务字段，update 可撤销、repaint 不记历史', async () => {
    registerChartPlugin()
    const { root, store } = await mountDesigner({ designData: HOST_DATA, fields: HOST_FIELDS })
    const chart = addChart(store)
    await frame()
    expect(propTabs(root).map(tab => tab.textContent)).toEqual(['自定义属性', '元素属性', '页面属性'])
    const select = root.querySelector<HTMLSelectElement>('.acme-data-source')!
    expect(Array.from(select.options).map(o => o.value)).toEqual(['trend', 'title'])
    select.value = 'title'
    select.dispatchEvent(new Event('change'))
    await frame()
    expect(store.elements.find(e => e.id === chart.id)!.options.dataSource).toBe('title')
    store.undo()
    expect(store.elements.find(e => e.id === chart.id)!.options.dataSource).toBe('trend')
    const before = store.getTemplateJson()
    root.querySelector<HTMLButtonElement>('.acme-rename')!.click()
    await frame()
    expect(store.getTemplateJson()).toBe(before)
  })

  it('插件注销后素材卡消失、实例被 dispose、样式节点回收', async () => {
    registerChartPlugin()
    const { root, store } = await mountDesigner({ designData: HOST_DATA })
    addChart(store)
    await frame()
    expect(root.querySelectorAll('style[data-plugin-ui]')).toHaveLength(1)
    unregisterUI?.()
    unregisterUI = null
    await frame()
    expect(root.querySelector(`[data-test="material-${CHART_TYPE}"]`)).toBeNull()
    expect(root.querySelector('.acme-chart-canvas')).toBeNull()
    expect(disposeCanvas).toHaveBeenCalled()
    expect(root.querySelectorAll('style[data-plugin-ui]')).toHaveLength(0)
  })
})

describe('第三方图表插件：出纸链路', () => {
  it('renderHtmlPages 按注册态分派插件 SVG，且数据绑定已生效', async () => {
    registerChartPlugin()
    const { el, store } = await mountDesigner({ designData: HOST_DATA })
    addChart(store)
    await frame()
    const template = JSON.parse(el.getTemplateJson()) as Record<string, unknown>
    const result = await renderHtmlPages(template as never, HOST_DATA)
    expect(result.html).toContain('class="acme-chart"')
    expect(result.html).toContain('data-count="3"')
    expect(result.html).toContain('data-name="二月"')
    expect(result.html).toContain('data-title="趋势"')
  })
})
