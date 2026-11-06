// @vitest-environment happy-dom
// 滚动状态跨重绘保持回归：整树重建换掉滚动容器 .canvas-area 后——
// ① 滚动位置按 scrollPos 恢复（不跳顶）且浮层平移一致；
// ② scroll 事件不重绘也定点补浮层平移；
// ③ 刻度原点不再叠加 scrollPos（实测矩形已含滚动，同 canvas CanvasArea.vue 口径）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DesignerStore } from '../core/store'
import { PrintDesignerElement, definePrintDesigner } from '../print-designer'

const drawRulerMock = vi.hoisted(() => vi.fn())
// drawRuler 只捕获入参：happy-dom 无 2D 上下文本就画不出，几何断言走 mock 最稳
vi.mock('../shell/ruler', () => ({ drawRuler: drawRulerMock }))

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

const setScrollPos = (el: PrintDesignerElement, x: number, y: number) => {
  ;(el as unknown as { scrollPos: { x: number; y: number } }).scrollPos = { x, y }
}

beforeEach(() => { stubStorage(); drawRulerMock.mockClear() })

describe('设计器滚动状态跨重绘', () => {
  it('重绘后滚动位置按 scrollPos 恢复，浮层平移与之一致', async () => {
    const { el, root, store } = await mountDesigner()
    setScrollPos(el, 30, 120)
    store.emit(false)
    await frame()
    const area = root.querySelector<HTMLElement>('.canvas-area')!
    expect(area.scrollLeft).toBe(30)
    expect(area.scrollTop).toBe(120)
    expect(root.querySelector<HTMLElement>('.ruler-overlay')!.style.transform)
      .toBe('translate(30px, 120px)')
  })

  it('scroll 事件不重绘也同步浮层平移与 scrollPos', async () => {
    const { root } = await mountDesigner()
    const area = root.querySelector<HTMLElement>('.canvas-area')!
    area.scrollTop = 88
    area.dispatchEvent(new Event('scroll'))
    expect(root.querySelector<HTMLElement>('.ruler-overlay')!.style.transform)
      .toBe('translate(0px, 88px)')
  })

  it('刻度原点不再叠加 scrollPos', async () => {
    const { el, root, store } = await mountDesigner()
    setScrollPos(el, 40, 120)
    store.emit(false)
    await frame()
    // happy-dom 布局矩形全 0：origin = 0 - 0 - RULER_THICK(本包常量 20)；
    // 旧实现会得到 20/100（叠加 scrollPos），据此区分新旧
    const geom = drawRulerMock.mock.calls.at(-1)![1].geom
    expect(geom.originX).toBe(-20)
    expect(geom.originY).toBe(-20)
  })
})
