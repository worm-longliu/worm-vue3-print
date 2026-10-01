// @vitest-environment happy-dom
// 右键菜单验收（对照 canvas 的 CanvasAreaContextMenu.spec.ts）：元素菜单 8 项、空白菜单 3 项，
// 每一项点击后必须先收起菜单再派发动作；菜单内按下不关闭、菜单外按下关闭。
import { describe, it, expect, beforeEach } from 'vitest'
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

async function mountDesigner() {
  definePrintDesigner()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = document.createElement('print-designer') as PrintDesignerElement
  host.appendChild(el)
  const store = (el as unknown as { store: DesignerStore }).store
  store.addElement('text', { left: 10, top: 10, width: 40, height: 10 })
  const id = store.elements[0]!.id
  store.selectOne(id)
  await frame() // paint() 走 rAF，等首帧画出来才能取到节点
  return { host, el, root: el.shadowRoot!, store, id }
}

const menu = (root: ShadowRoot) => root.querySelector<HTMLElement>('.context-menu')
const items = (root: ShadowRoot) => Array.from(root.querySelectorAll<HTMLElement>('.context-menu-item'))

function rightClick(root: ShadowRoot, sel: string) {
  const node = root.querySelector<HTMLElement>(sel)
  if (!node) throw new Error(`节点不存在: ${sel}`)
  node.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true, cancelable: true, clientX: 100, clientY: 100,
  }))
}

async function clickItem(root: ShadowRoot, text: string) {
  const item = items(root).find(i => i.textContent === text)
  if (!item) throw new Error(`菜单项不存在: ${text}`)
  item.click()
  await frame()
}

beforeEach(() => stubStorage())

describe('print-designer 元素右键菜单（对照 canvas）', () => {
  it('右键元素：菜单包含全部 8 项动作', async () => {
    const { root } = await mountDesigner()
    rightClick(root, '.print-element')
    await frame()
    expect(items(root).map(i => i.textContent)).toEqual([
      '复制', '剪切', '粘贴', '删除', '置顶', '上移', '下移', '置底',
    ])
  })

  it.each(['复制', '剪切', '删除'] as const)('菜单项「%s」点击后菜单收起并生效', async (text) => {
    const { root, store } = await mountDesigner()
    rightClick(root, '.print-element')
    await frame()
    await clickItem(root, text)
    expect(menu(root)).toBe(null)
    if (text === '删除') expect(store.elements.length).toBe(0)
    else expect(store.hasClipboard).toBe(true)
  })

  it('菜单项「置顶」点击后菜单收起且层级生效', async () => {
    const { root, store } = await mountDesigner()
    store.addElement('text', { left: 10, top: 30, width: 40, height: 10 })
    const first = store.elements[0]!
    store.selectOne(first.id)
    rightClick(root, `[data-el-id="${first.id}"]`)
    await frame()
    await clickItem(root, '置顶')
    expect(menu(root)).toBe(null)
    expect(store.elements[store.elements.length - 1]!.id).toBe(first.id)
  })

  it('粘贴项：剪贴板为空时置灰，点击收起菜单但不派发（canvas handlePaste 同守卫）', async () => {
    const { root, store } = await mountDesigner()
    rightClick(root, '.print-element')
    await frame()
    const paste = items(root).find(i => i.textContent === '粘贴')!
    expect(paste.classList.contains('disabled')).toBe(true)
    await clickItem(root, '粘贴')
    expect(menu(root)).toBe(null)
    expect(store.elements.length).toBe(1)
  })

  it('粘贴项：剪贴板有数据时点击收起菜单并粘贴', async () => {
    const { root, store } = await mountDesigner()
    store.copy()
    rightClick(root, '.print-element')
    await frame()
    await clickItem(root, '粘贴')
    expect(menu(root)).toBe(null)
    expect(store.elements.length).toBe(2)
  })

  it('菜单内按下不关闭（子项 click 才能派发），菜单外按下关闭', async () => {
    const { root } = await mountDesigner()
    rightClick(root, '.print-element')
    await frame()
    items(root)[0]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
    expect(menu(root)).not.toBe(null)
    await clickItem(root, '复制')
    expect(menu(root)).toBe(null)
    // 再次打开后在菜单外按下：关闭（关闭监听挂在宿主元素上，取画布区作为「菜单外」目标）
    rightClick(root, '.print-element')
    await frame()
    root.querySelector<HTMLElement>('.canvas-area')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
    await frame()
    expect(menu(root)).toBe(null)
  })
})

describe('print-designer 空白右键菜单', () => {
  it('空白右键菜单包含 粘贴/全选/取消选择', async () => {
    const { root } = await mountDesigner()
    rightClick(root, '.canvas-area')
    await frame()
    expect(items(root).map(i => i.textContent)).toEqual(['粘贴', '全选', '取消选择'])
  })

  it('全选/取消选择点击后菜单收起并反映到选区', async () => {
    const { root, store } = await mountDesigner()
    rightClick(root, '.canvas-area')
    await frame()
    await clickItem(root, '全选')
    expect(menu(root)).toBe(null)
    expect(store.selectedIds.size).toBe(1)

    rightClick(root, '.canvas-area')
    await frame()
    await clickItem(root, '取消选择')
    expect(menu(root)).toBe(null)
    expect(store.selectedIds.size).toBe(0)
  })
})
