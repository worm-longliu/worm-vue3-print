// @vitest-environment happy-dom
// 素材台元素页签两列栅格（对照 canvas 的 LeftPanelTwoColumn.spec.ts）：
// 元素页签挂 material-grid、文本较长的素材带 material-card--wide 独占整行；字段/图层页签保持单列。
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
  await frame() // paint() 走 rAF，等首帧画出来才能取到节点
  return { root: el.shadowRoot!, store }
}

beforeEach(() => stubStorage())

describe('print-designer 素材台两列栅格（对照 canvas）', () => {
  it('只有元素页签挂两列栅格，字段与图层页签保持单列', async () => {
    const { root } = await mountDesigner()
    const panes = Array.from(root.querySelectorAll<HTMLElement>('.pd-tab-pane'))
      .filter(pane => pane.closest('.left-tabs'))
    expect(panes).toHaveLength(3)
    expect(panes[0]!.classList.contains('material-grid')).toBe(true)
    expect(panes[1]!.classList.contains('material-grid')).toBe(false)
    expect(panes[2]!.classList.contains('material-grid')).toBe(false)
  })

  it('内置素材里只有「流式列表」文本较长，独占整行', async () => {
    const { root } = await mountDesigner()
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.material-card'))
    expect(cards).toHaveLength(11)
    const wide = cards
      .filter(card => card.classList.contains('material-card--wide'))
      .map(card => card.querySelector('.material-label')?.textContent)
    expect(wide).toEqual(['流式列表'])
    expect(root.querySelector('[data-test="material-flowList"]')!.classList.contains('material-card--wide')).toBe(true)
  })

  it('素材顺序为表格后紧跟长文，且不再提供 HTML 素材入口', async () => {
    const { root } = await mountDesigner()
    const labels = Array.from(root.querySelectorAll<HTMLElement>('.material-label')).map(node => node.textContent)
    expect(labels.slice(labels.indexOf('表格'), labels.indexOf('表格') + 3)).toEqual(['表格', '长文', '流式列表'])
    expect(labels).not.toContain('HTML')
    expect(root.querySelector('[data-test="material-html"]')).toBeNull()
  })
})
