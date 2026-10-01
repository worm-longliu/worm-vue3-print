// @vitest-environment happy-dom
// 吸附开关下的拖拽位移口径（对照 canvas useDrag.computePos）：
// 吸附结果是「目标位绝对坐标」，位移 = 吸附后坐标 - 起始坐标，而非只剩吸附修正量。
import { describe, it, expect, beforeEach } from 'vitest'
import { mmToPx } from '@worm-vue3-print/core/designer'
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

async function mountDesigner(options?: { left: number; top: number; width: number; height: number }[]) {
  definePrintDesigner()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = document.createElement('print-designer') as PrintDesignerElement
  host.appendChild(el)
  const store = (el as unknown as { store: DesignerStore }).store
  for (const o of options ?? [{ left: 10, top: 10, width: 40, height: 10 }]) {
    store.addElement('text', o)
  }
  await frame()
  return { host, el, root: el.shadowRoot!, store }
}

/** 模拟一次完整拖拽：mousedown 在元素上，move/up 挂在 window（bindPointer 的监听位置） */
async function dragById(root: ShadowRoot, id: string, dxMm: number, dyMm = 0) {
  const node = root.querySelector<HTMLElement>(`.print-element[data-el-id="${id}"]`)
  if (!node) throw new Error(`节点不存在: ${id}`)
  const pxPerMm = mmToPx(1)
  const startX = 100, startY = 100
  node.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, button: 0, clientX: startX, clientY: startY,
  }))
  window.dispatchEvent(new MouseEvent('mousemove', {
    clientX: startX + dxMm * pxPerMm, clientY: startY + dyMm * pxPerMm,
  }))
  window.dispatchEvent(new MouseEvent('mouseup', {}))
  await frame()
}

beforeEach(() => stubStorage())

describe('吸附开启后的拖拽（对照 canvas）', () => {
  it('阈值外不吸附时，元素仍随鼠标位移（回归：不被钉死在原位）', async () => {
    const { root, store } = await mountDesigner()
    const id = store.elements[0]!.id
    store.snapToGrid = true
    await dragById(root, id, 20)
    expect(store.elements[0]!.options.left).toBeCloseTo(30, 2)
    expect(store.elements[0]!.options.top).toBeCloseTo(10, 2)
  })

  it('阈值内拖拽吸附到相邻元素左缘，落点为吸附后坐标', async () => {
    const { root, store } = await mountDesigner([
      { left: 10, top: 10, width: 40, height: 10 },
      { left: 120, top: 100, width: 40, height: 10 },
    ])
    const id = store.elements[0]!.id
    store.snapToGrid = true
    // 目标位 120.6mm，与 B 左缘距离 0.6 ≤ 默认阈值 1mm，应吸附到 120
    await dragById(root, id, 110.6)
    expect(store.elements[0]!.options.left).toBeCloseTo(120, 2)
    expect(store.elements[1]!.options.left).toBeCloseTo(120, 2)
  })

  it('吸附关闭时拖拽位移不受影响', async () => {
    const { root, store } = await mountDesigner()
    const id = store.elements[0]!.id
    store.snapToGrid = false
    await dragById(root, id, 15)
    expect(store.elements[0]!.options.left).toBeCloseTo(25, 2)
  })
})
