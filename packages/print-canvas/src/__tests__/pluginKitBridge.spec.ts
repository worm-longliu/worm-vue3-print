// plugin-kit → canvas Vue 桥接回归：框架无关的 ElementUI 注册后自动出现素材卡/画布组件/
// 「自定义属性」tab；原生 Vue 组件仍优先；渲染结果三形态、options 重绘、update 写回与
// 自身重渲染抑制、hasProperties 判据、样式注入与清理。注册表是模块级单例，用例后必须清空。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, reactive } from 'vue'
import type { RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'
import { clearElementPlugins, registerElementPlugin } from '@worm-vue3-print/core/designer'
import { clearElementUIs, defineElementUI, registerElementUI } from '@worm-vue3-print/plugin-kit'
import type { ElementUI, ElementUIPropertyContext } from '@worm-vue3-print/plugin-kit'
import PropertyPanel from '../components/PropertyPanel.vue'
import LeftPanel from '../components/LeftPanel.vue'
import {
  CUSTOM_PROPERTY_TAB_LABEL,
  clearElementExtensions,
  getElementExtension,
  getElementExtensions,
  resolveElementPropertyTab,
} from '../composables/useElementExtensionRegistry'
import { getPluginKitCanvasComponent } from '../composables/pluginKitBridge'

const BADGE = 'testBadge'
const PLUGIN_ID = 'test.plugin-kit-badge'

/** 插件属性台渲染时捕获的上下文：测试里直接调用 update/repaint，验证宿主侧行为 */
let propertyCtx: ElementUIPropertyContext | undefined
let canvasRenderCount = 0
let propertyRenderCount = 0

function mkElement(type: string, options: Record<string, unknown> = {}): RuntimeElement {
  return reactive({
    id: `el-${type}`,
    options: { left: 0, top: 0, width: 100, height: 60, title: type, ...options },
    printElementType: { type, title: type },
  }) as unknown as RuntimeElement
}

function tpl(): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 0, elements: [] },
    footer: { height: 0, elements: [] },
    elements: [],
  } as TemplateData
}

function registerKind(): void {
  registerElementPlugin({
    id: PLUGIN_ID,
    version: '1',
    kinds: [{ type: BADGE, label: '徽章', icon: 'Badge', defaultOptions: () => ({ title: 'A' }) }],
  })
}

function registerUI(overrides: Partial<ElementUI> = {}): () => void {
  propertyCtx = undefined
  canvasRenderCount = 0
  propertyRenderCount = 0
  return registerElementUI(
    defineElementUI({
      types: [BADGE],
      renderCanvas(ctx) {
        canvasRenderCount++
        return `<div class="badge-canvas">${String(ctx.element.options.title ?? '')}|${ctx.designMode ? 'design' : 'print'}</div>`
      },
      renderProperty(ctx) {
        propertyRenderCount++
        propertyCtx = ctx
        return `<div class="badge-property">${String(ctx.element.options.title ?? '')}</div>`
      },
      searchKeywords: ['徽章', 'badge'],
      styles: '.badge-canvas { color: red; }',
      ...overrides,
    }),
  )
}

/** 一次性注册 core kind + plugin-kit UI，返回 UI 注销句柄 */
function registerBadgePlugin(overrides: Partial<ElementUI> = {}): () => void {
  registerKind()
  return registerUI(overrides)
}

/** 统一登记挂载实例：用例间必须卸载，否则残留实例会随注册态变化重复渲染并污染计数 */
const wrappers: Array<{ unmount: () => void }> = []

function mountTracked<T extends { unmount: () => void }>(wrapper: T): T {
  wrappers.push(wrapper)
  return wrapper
}

/** 用例内提前卸载（断言 dispose 等），同时从 afterEach 清理名单移除，避免二次卸载 */
function unmountTracked(wrapper: { unmount: () => void }): void {
  const index = wrappers.indexOf(wrapper)
  if (index >= 0) wrappers.splice(index, 1)
  wrapper.unmount()
}

function mountPropertyPanel(element: RuntimeElement, recordHistory?: () => void) {
  return mountTracked(mount(PropertyPanel, {
    props: { element, templateData: tpl(), fields: [], activeTab: 'custom', collapsed: false, recordHistory },
  }))
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  clearElementExtensions()
  clearElementUIs()
  clearElementPlugins()
})

describe('plugin-kit 扩展映射', () => {
  it('注册 kind + UI 后自动出现扩展，桥接组件按 type 缓存', () => {
    registerBadgePlugin()

    const extensions = getElementExtensions()
    expect(extensions.map(ext => ext.type)).toEqual([BADGE])
    expect(extensions[0]?.label).toBe('徽章')
    expect(extensions[0]?.icon).toBe('Badge')

    const canvasComponent = getElementExtension(BADGE)?.canvasComponent
    expect(canvasComponent).toBeTruthy()
    // 同一 type 多次解析必须返回同一组件对象，否则画面会反复重挂载
    expect(getElementExtension(BADGE)?.canvasComponent).toBe(canvasComponent)
    expect(getPluginKitCanvasComponent(BADGE)).toBe(canvasComponent)

    // 重新注册 UI（热更新）后才生成新的桥接组件
    registerUI()
    expect(getElementExtension(BADGE)?.canvasComponent).not.toBe(canvasComponent)
  })

  it('原生 designer.canvasComponent 优先，plugin-kit 不覆盖原生画布与属性行为', () => {
    const NativeCanvas = defineComponent({
      name: 'NativeBadgeCanvas',
      setup: () => () => h('div', { class: 'native-badge-canvas' }),
    })
    registerElementPlugin({
      id: PLUGIN_ID,
      version: '1',
      kinds: [{ type: BADGE, label: '徽章', designer: { canvasComponent: NativeCanvas } }],
    })
    registerUI()

    expect(getElementExtension(BADGE)?.canvasComponent).toBe(NativeCanvas)
    // 原生组件在且未声明 propertyTab 时维持旧行为：不凭空冒出插件 UI 的 tab
    expect(getElementExtension(BADGE)?.propertyTab).toBeUndefined()
    expect(resolveElementPropertyTab(mkElement(BADGE))).toBeUndefined()
  })

  it('素材卡随 plugin-kit 注册态响应式出现/消失', async () => {
    const props = { fields: [], elements: [], selectedIds: new Set<string>(), collapsed: false }
    const w = mountTracked(mount(LeftPanel, { props }))
    expect(w.findAll('.material-label').map(node => node.text())).not.toContain('徽章')

    registerBadgePlugin()
    await nextTick()
    expect(w.findAll('.material-card')).toHaveLength(12)
    expect(w.findAll('.material-label').map(node => node.text())).toContain('徽章')

    clearElementUIs()
    await nextTick()
    expect(w.findAll('.material-card')).toHaveLength(11)
    expect(w.findAll('.material-label').map(node => node.text())).not.toContain('徽章')
  })

  it('core 描述符没有 materialCard.group 时回落到 UI.group', () => {
    registerKind()
    registerUI({ group: 'UI 分组' })
    expect(getElementExtension(BADGE)?.group).toBe('UI 分组')
  })

  it('resolveElementPropertyTab：label 缺省「自定义属性」、icon 取 kind、搜索词取 UI', () => {
    registerBadgePlugin()
    const tab = resolveElementPropertyTab(mkElement(BADGE))
    expect(tab?.label).toBe(CUSTOM_PROPERTY_TAB_LABEL)
    expect(tab?.icon).toBe('Badge')
    expect(tab?.searchKeywords).toEqual(['徽章', 'badge'])
    expect(tab?.component).toBeTruthy()
  })

  it('插件未提供 renderProperty 时不生成自定义属性 tab', () => {
    registerBadgePlugin({ renderProperty: undefined })
    expect(resolveElementPropertyTab(mkElement(BADGE))).toBeUndefined()
  })

  it('hasProperties=false 时该实例不显示 tab（属性台无「自定义属性」页签）', () => {
    registerBadgePlugin({ hasProperties: () => false })
    expect(resolveElementPropertyTab(mkElement(BADGE))).toBeUndefined()

    const w = mountPropertyPanel(mkElement(BADGE))
    expect(w.findAll('.pd-tab').map(tab => tab.text())).toEqual(['元素属性', '页面属性'])
    expect(w.text()).not.toContain(CUSTOM_PROPERTY_TAB_LABEL)
  })

  it('注销 UI 后 tab 随响应式版本号即时回落', async () => {
    const element = mkElement(BADGE)
    const tab = computed(() => resolveElementPropertyTab(element))
    const off = registerBadgePlugin()
    expect(tab.value).toBeTruthy()

    off()
    await nextTick()
    expect(tab.value).toBeUndefined()
  })
})

describe('plugin-kit 画布桥接组件', () => {
  it('渲染字符串结果，options 变更重绘（含 designMode 透传）', async () => {
    registerBadgePlugin()
    const element = mkElement(BADGE, { title: 'A' })
    const Canvas = getElementExtension(BADGE)!.canvasComponent
    const w = mountTracked(mount(Canvas, { props: { element, data: [], designMode: true } }))

    expect(w.find('.badge-canvas').text()).toBe('A|design')
    expect(canvasRenderCount).toBe(1)

    element.options.title = 'B'
    await nextTick()
    expect(w.find('.badge-canvas').text()).toBe('B|design')
    expect(canvasRenderCount).toBe(2)
  })

  it('渲染 Node / { node, dispose } 结果：重绘前 dispose 旧结果，卸载时再次 dispose', async () => {
    registerBadgePlugin()
    const dispose = vi.fn()
    const off = registerUI({
      renderCanvas(ctx) {
        canvasRenderCount++
        const node = document.createElement('div')
        node.className = 'badge-node'
        node.textContent = String(ctx.element.options.title ?? '')
        return { node, dispose }
      },
    })
    const element = mkElement(BADGE, { title: 'A' })
    const Canvas = getElementExtension(BADGE)!.canvasComponent
    const w = mountTracked(mount(Canvas, { props: { element } }))

    expect(w.find('.badge-node').text()).toBe('A')
    element.options.title = 'B'
    await nextTick()
    expect(w.find('.badge-node').text()).toBe('B')
    expect(dispose).toHaveBeenCalledTimes(1)

    unmountTracked(w)
    expect(dispose).toHaveBeenCalledTimes(2)
    off()
  })

  it('渲染异常时显示占位而不打断画布', () => {
    registerBadgePlugin({
      renderCanvas: () => {
        throw new Error('boom')
      },
    })
    const Canvas = getElementExtension(BADGE)!.canvasComponent
    const w = mountTracked(mount(Canvas, { props: { element: mkElement(BADGE) } }))
    expect(w.find('.plugin-kit-canvas--error').text()).toContain(BADGE)
  })
})

describe('plugin-kit 属性桥接组件', () => {
  it('update 写回 element.options 并 emit change；自身变更不重渲染，外部变更重渲染', async () => {
    registerBadgePlugin()
    const element = mkElement(BADGE, { title: 'A' })
    const Property = getElementExtension(BADGE)!.propertyTab!.component
    const w = mountTracked(mount(Property, { props: { element, data: [] } }))

    expect(w.find('.badge-property').text()).toBe('A')
    expect(propertyRenderCount).toBe(1)

    propertyCtx!.update({ title: 'B' })
    await nextTick()
    expect(element.options.title).toBe('B')
    expect(w.emitted('change')).toHaveLength(1)
    // 自身 update 不重建 DOM：输入焦点与插件内部态不被重置
    expect(propertyRenderCount).toBe(1)
    expect(w.find('.badge-property').text()).toBe('A')

    // 外部变更（撤销/重做等）仍然重渲染
    element.options.title = 'C'
    await nextTick()
    expect(propertyRenderCount).toBe(2)
    expect(w.find('.badge-property').text()).toBe('C')
  })

  it('属性台挂载桥接组件：tab 排第一位，update 汇入 recordHistory', async () => {
    registerBadgePlugin()
    const element = mkElement(BADGE, { title: 'A' })
    const recordHistory = vi.fn()
    const w = mountPropertyPanel(element, recordHistory)

    expect(w.findAll('.pd-tab').map(tab => tab.text()))
      .toEqual([CUSTOM_PROPERTY_TAB_LABEL, '元素属性', '页面属性'])
    expect(w.find('.badge-property').exists()).toBe(true)

    propertyCtx!.update({ title: 'B' })
    await nextTick()
    expect(element.options.title).toBe('B')
    expect(recordHistory).toHaveBeenCalledTimes(1)
  })

  it('属性台把宿主业务字段透传给插件属性上下文（图表插件的数据源下拉）', () => {
    registerBadgePlugin()
    const element = mkElement(BADGE, { title: 'A' })
    const fields = [
      { fieldKey: 'trend', fieldLabel: '趋势数据', fieldType: 'list', sortOrder: 1 },
      { fieldKey: 'title', fieldLabel: '报表标题', fieldType: 'string', sortOrder: 2 },
    ]
    mountTracked(mount(PropertyPanel, {
      props: { element, templateData: tpl(), fields, activeTab: 'custom', collapsed: false },
    }))

    expect(propertyCtx!.fields?.map(f => f.fieldKey)).toEqual(['trend', 'title'])
  })

  it('repaint 只重渲染、不写数据、不记历史', async () => {
    registerBadgePlugin()
    const element = mkElement(BADGE, { title: 'A' })
    const recordHistory = vi.fn()
    mountPropertyPanel(element, recordHistory)

    propertyCtx!.repaint()
    await nextTick()
    expect(propertyRenderCount).toBe(2)
    expect(element.options.title).toBe('A')
    expect(recordHistory).not.toHaveBeenCalled()
  })
})

describe('plugin-kit 样式注入与清理', () => {
  const styleOf = () => document.head.querySelector(`[data-plugin-kit-style="${BADGE}"]`)

  it('ui.styles 按 type 幂等注入 document.head', () => {
    expect(styleOf()).toBeNull()
    registerBadgePlugin()
    expect(styleOf()?.textContent).toContain('.badge-canvas')

    // 同 type 重复注册不重复注入
    registerUI()
    expect(document.head.querySelectorAll(`[data-plugin-kit-style="${BADGE}"]`)).toHaveLength(1)
  })

  it('注销 UI 或 clearElementExtensions 后样式与扩展均无残留', async () => {
    const off = registerBadgePlugin()
    expect(styleOf()).not.toBeNull()

    off()
    await nextTick()
    expect(styleOf()).toBeNull()

    registerUI()
    expect(styleOf()).not.toBeNull()
    clearElementExtensions()
    expect(styleOf()).toBeNull()

    clearElementUIs()
    clearElementPlugins()
    expect(getElementExtensions()).toEqual([])
  })
})
