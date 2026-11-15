// @vitest-environment happy-dom
// 页签 pane 滚动跨重绘回归：整树重建（paint 的 clear(shell)）会换掉属性台/素材台的
// 滚动容器 .pd-tab-pane（overflow:auto），scrollTop 归零 → 改字号、开关等任何属性台
// 操作都表现为「属性台跳顶」。修复后 pane 带 data-pane 记账键，滚动经 shadow root
// 捕获阶段记账 + 重建前从活节点刷新，重建后按键回写（canvas 的 v-show 节点常驻无此问题）。
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
      clear: () => { map.clear() },
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
  return { el, root: el.shadowRoot!, store, id }
}

const paneOf = (root: ShadowRoot, key: string) =>
  root.querySelector<HTMLElement>(`[data-pane="${key}"]`)!

beforeEach(() => { stubStorage() })

describe('页签 pane 滚动跨重绘', () => {
  it('属性台改字号（用户点 + 的同一条提交链）重绘后元素页签不跳顶', async () => {
    const { root, store, id } = await mountDesigner()
    const pane = paneOf(root, 'prop:element')
    pane.scrollTop = 140
    pane.dispatchEvent(new Event('scroll'))
    store.updateElement(id, { fontSize: 14 })
    await frame()
    const after = paneOf(root, 'prop:element')
    // 整树重建换掉了滚动容器节点本身，scrollTop 只能靠记账回写
    expect(after).not.toBe(pane)
    expect(after.scrollTop).toBe(140)
  })

  it('滚动事件未达（捕获监听兜底失效）时，重建前活节点刷新仍能保住 scrollTop', async () => {
    const { root, store } = await mountDesigner()
    const pane = paneOf(root, 'prop:element')
    pane.scrollTop = 90
    // 不派发 scroll 事件：只靠 paint 重建前的活节点刷新路径
    store.emit(false)
    await frame()
    expect(paneOf(root, 'prop:element').scrollTop).toBe(90)
  })

  it('素材台页签（.pd-tab-pane 同构）重绘后同样保持', async () => {
    const { root, store } = await mountDesigner()
    const pane = paneOf(root, 'left:fields')
    pane.scrollTop = 60
    pane.dispatchEvent(new Event('scroll'))
    store.emit(false)
    await frame()
    expect(paneOf(root, 'left:fields').scrollTop).toBe(60)
  })

  it('隐藏页签的记账不被清零：元素页签滚过 → 切页面页签 → 重绘 → 切回仍在', async () => {
    const { root, store } = await mountDesigner()
    const pane = paneOf(root, 'prop:element')
    pane.scrollTop = 120
    pane.dispatchEvent(new Event('scroll'))
    // 切到页面属性页签（元素 pane 隐藏），再触发一次重绘
    const pageTab = [...root.querySelectorAll<HTMLButtonElement>('.prop-tabs .pd-tab')]
      .find(b => b.textContent === '页面属性')!
    pageTab.click()
    await frame()
    store.emit(false)
    await frame()
    // 切回元素页签：重绘回写恢复 120（本次重绘里隐藏 pane 写不进，切回的这一帧补上）
    const back = [...root.querySelectorAll<HTMLButtonElement>('.prop-tabs .pd-tab')]
      .find(b => b.textContent === '元素属性')!
    back.click()
    await frame()
    expect(paneOf(root, 'prop:element').scrollTop).toBe(120)
  })
})
