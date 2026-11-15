// @vitest-environment happy-dom
// 插件元素接入：core 插件注册表 + plugin-kit ElementUI → 素材卡/画布/自定义属性页签。
// 断言的是与 canvas 同口径的行为（分组标题、默认 custom 页签、update 写回历史），
// 而不是内部实现细节。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineElementPlugin, registerElementPlugin } from '@worm-vue3-print/core/designer'
import type { ElementType, RuntimeElement } from '@worm-vue3-print/core/designer'
import { clearElementUIs, registerElementUI } from '@worm-vue3-print/plugin-kit'
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

/** repaint 走 requestAnimationFrame，断言前先等一帧 */
function frame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

const disposeCanvas = vi.fn()
const disposeProperty = vi.fn()

const FAKE_PLUGIN = defineElementPlugin({
  id: 'fake-chart',
  version: '1.0.0',
  kinds: [
    { type: 'fakeChart', label: '假图表', icon: 'ChartLine', designer: { materialCard: { group: '图表' } } },
    { type: 'fakeNoProps', label: '无属性图表', icon: 'ChartPie' },
    { type: 'fakeBroken', label: '渲染失败图表', icon: 'ChartColumn' },
    { type: 'fakePlain', label: '无界面元素', icon: 'Box' },
  ],
})

let unregisterPlugin: (() => void) | null = null

/** 注册假 core kind + plugin-kit UI（fakePlain 不注册 UI，用于验证「无 UI 的 kind 不出现」） */
function registerFakePlugin() {
  unregisterPlugin = registerElementPlugin(FAKE_PLUGIN)
  registerElementUI({
    types: ['fakeChart'],
    styles: '.fake-chart-canvas{color:rgb(1,2,3)}',
    searchKeywords: ['图表', 'fakeChart'],
    renderCanvas: ({ element }) => {
      const node = document.createElement('div')
      node.className = 'fake-chart-canvas'
      node.textContent = `画布:${element.id}`
      return { node, dispose: disposeCanvas }
    },
    renderProperty: ctx => {
      const wrap = document.createElement('div')
      wrap.className = 'fake-chart-props'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'fake-chart-update'
      button.textContent = '改标题'
      button.addEventListener('click', () => ctx.update({ title: '已改标题' }))
      wrap.appendChild(button)
      return { node: wrap, dispose: disposeProperty }
    },
  })
  registerElementUI({
    types: ['fakeNoProps'],
    renderCanvas: () => '<div class="fake-no-props-canvas"></div>',
    renderProperty: () => document.createElement('div'),
    hasProperties: () => false,
  })
  registerElementUI({
    types: ['fakeBroken'],
    renderCanvas: () => { throw new Error('renderCanvas 失败') },
  })
}

async function mountDesigner() {
  definePrintDesigner()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = document.createElement('print-designer') as PrintDesignerElement
  host.appendChild(el)
  const store = (el as unknown as { store: DesignerStore }).store
  await frame() // paint() 走 rAF，等首帧画出来才能取到节点
  return { root: el.shadowRoot!, store }
}

/** 插件 type 不在内置 ElementType 联合里，测试里按运行时注册态强转 */
function addPluginElement(store: DesignerStore, type = 'fakeChart', options: Record<string, unknown> = {}): RuntimeElement {
  return store.addElement(type as ElementType, { left: 20, top: 20, width: 60, height: 30, ...options })
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
  unregisterPlugin?.()
  unregisterPlugin = null
  clearElementUIs()
})

describe('plugin-kit 插件元素（素材台）', () => {
  it('内置 11 项后追加插件卡，首个同组卡前渲染分组标题，无 UI 的 kind 不出现', async () => {
    registerFakePlugin()
    const { root } = await mountDesigner()
    expect(root.querySelectorAll('.material-card')).toHaveLength(14)
    expect(root.querySelector('[data-test="material-fakeChart"] .material-label')?.textContent).toBe('假图表')
    expect(root.querySelector('[data-test="material-fakePlain"]')).toBeNull()
    expect(Array.from(root.querySelectorAll('.material-group-title')).map(n => n.textContent)).toEqual(['图表'])
    const title = root.querySelector('.material-group-title')!
    expect(title.nextElementSibling?.getAttribute('data-test')).toBe('material-fakeChart')
  })

  it('core 描述符没有 materialCard.group 时回落到 plugin-kit UI 的 group', async () => {
    unregisterPlugin = registerElementPlugin(defineElementPlugin({
      id: 'fake-ui-group',
      version: '1.0.0',
      kinds: [{ type: 'fakeUiGroup', label: 'UI 分组元素', icon: 'Box' }],
    }))
    registerElementUI({
      types: ['fakeUiGroup'],
      group: 'UI 分组',
      renderCanvas: () => '<div class="fake-ui-group-canvas"></div>',
    })
    const { root } = await mountDesigner()
    expect(Array.from(root.querySelectorAll('.material-group-title')).map(n => n.textContent)).toEqual(['UI 分组'])
    expect(root.querySelector('[data-test="material-fakeUiGroup"]')).not.toBeNull()
  })

  it('插件卡可拖拽，拖拽载荷为 elementType', async () => {
    registerFakePlugin()
    const { root } = await mountDesigner()
    const card = root.querySelector<HTMLElement>('[data-test="material-fakeChart"]')!
    expect(card.getAttribute('draggable')).toBe('true')
    const setData = vi.fn()
    const ev = new Event('dragstart') as DragEvent
    Object.defineProperty(ev, 'dataTransfer', { value: { setData, effectAllowed: '' } })
    card.dispatchEvent(ev)
    expect(setData).toHaveBeenCalledWith('elementType', 'fakeChart')
  })

  it('已挂载实例在插件注册后自动重绘', async () => {
    const { root } = await mountDesigner()
    expect(root.querySelector('[data-test="material-fakeChart"]')).toBeNull()
    registerFakePlugin()
    await frame()
    expect(root.querySelector('[data-test="material-fakeChart"]')).not.toBeNull()
  })
})

describe('plugin-kit 插件元素（画布）', () => {
  it('调用 renderCanvas 把 DOM 装进 .plugin-kit-canvas，styles 幂等注入 shadow root', async () => {
    registerFakePlugin()
    const { root, store } = await mountDesigner()
    const el = addPluginElement(store)
    await frame()
    const box = root.querySelector<HTMLElement>(`[data-el-id="${el.id}"] .plugin-kit-canvas`)!
    expect(box.querySelector('.fake-chart-canvas')?.textContent).toBe(`画布:${el.id}`)
    expect(box.style.width).toBe('100%')
    expect(box.style.height).toBe('100%')
    const styles = root.querySelectorAll('style[data-plugin-ui]')
    expect(styles).toHaveLength(1)
    expect(styles[0]!.getAttribute('data-plugin-ui')).toBe('fakeChart')
    expect(styles[0]!.textContent).toContain('.fake-chart-canvas')
    // 再次整树重绘：style 节点按 type 去重不重复追加，上一轮渲染实例被 dispose
    store.emit()
    await frame()
    expect(root.querySelectorAll('style[data-plugin-ui]')).toHaveLength(1)
    expect(disposeCanvas).toHaveBeenCalled()
  })

  it('renderCanvas 抛错时按类型名占位', async () => {
    registerFakePlugin()
    const { root, store } = await mountDesigner()
    const el = addPluginElement(store, 'fakeBroken')
    await frame()
    expect(root.querySelector<HTMLElement>(`[data-el-id="${el.id}"] .plugin-kit-canvas`)!.textContent).toBe('fakeBroken')
  })
})

describe('plugin-kit 插件元素（属性台）', () => {
  it('选中后默认激活「自定义属性」页签并渲染属性 UI', async () => {
    registerFakePlugin()
    const { root, store } = await mountDesigner()
    addPluginElement(store)
    await frame()
    expect(propTabs(root).map(tab => tab.textContent)).toEqual(['自定义属性', '元素属性', '页面属性'])
    expect(propTabs(root)[0]!.classList.contains('active')).toBe(true)
    expect(root.querySelector('.property-content .fake-chart-props')).not.toBeNull()
  })

  it('update 写回 store 并记一条历史（可撤销）', async () => {
    registerFakePlugin()
    const { root, store } = await mountDesigner()
    const el = addPluginElement(store)
    await frame()
    const titleOf = () => store.elements.find(item => item.id === el.id)!.options.title
    expect(titleOf()).toBeUndefined()
    root.querySelector<HTMLButtonElement>('.fake-chart-update')!.click()
    await frame()
    expect(titleOf()).toBe('已改标题')
    store.undo()
    expect(titleOf()).toBeUndefined()
  })

  it('hasProperties 返回 false 时不出现「自定义属性」页签', async () => {
    registerFakePlugin()
    const { root, store } = await mountDesigner()
    addPluginElement(store, 'fakeNoProps')
    await frame()
    expect(propTabs(root).map(tab => tab.textContent)).toEqual(['元素属性', '页面属性'])
    expect(root.querySelector('.property-content .fake-chart-props')).toBeNull()
  })

  it('属性搜索按 searchKeywords 命中时显示，未命中时隐藏自定义属性内容', async () => {
    registerFakePlugin()
    const { root, store } = await mountDesigner()
    addPluginElement(store)
    await frame()
    expect(root.querySelector('.fake-chart-props')).not.toBeNull()
    const state = (root.host as PrintDesignerElement as unknown as { state: { propSearch?: string } }).state
    state.propSearch = '图表'
    store.emit()
    await frame()
    expect(root.querySelector('.fake-chart-props')).not.toBeNull()
    state.propSearch = '不存在的关键字'
    store.emit()
    await frame()
    expect(root.querySelector('.fake-chart-props')).toBeNull()
  })
})
