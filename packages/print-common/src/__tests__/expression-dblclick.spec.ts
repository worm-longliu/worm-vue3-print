// @vitest-environment happy-dom
// 画布双击 → 表达式编辑器弹窗验收（对照 canvas PrintDesigner 的 onDblClickElement/onDblClickCell）：
// 白名单元素双击弹出并可确定写回；锁定与非白名单类型只选中不弹；表格单元格双击弹
// 且派发 dblclick-cell 宿主事件（detail 为 { elementId, r, c, cellId } 对象）。
import { describe, it, expect, beforeEach } from 'vitest'
import type { DesignerStore } from '../core/store'
import { PrintDesignerElement, definePrintDesigner } from '../print-designer'

// 表格行高测量与标尺绘制需要 2d context（happy-dom 返回的 context 方法不全），统一 stub 成 no-op
const ctxTarget: Record<string, unknown> = { measureText: (t: unknown) => ({ width: String(t).length * 8 }) }
const noopCtx: Record<string, unknown> = new Proxy(ctxTarget, {
  get: (target, prop) => (prop in target ? target[prop as string] : () => noopCtx),
  set: () => true,
})
;(HTMLCanvasElement.prototype as unknown as { getContext: (t: string) => unknown }).getContext =
  () => noopCtx

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
  const events: { type: string; detail: unknown }[] = []
  el.addEventListener('dblclick-element', e => events.push({ type: 'dblclick-element', detail: (e as CustomEvent).detail }))
  el.addEventListener('dblclick-cell', e => events.push({ type: 'dblclick-cell', detail: (e as CustomEvent).detail }))
  await frame()
  return { el, root: el.shadowRoot!, store, events }
}

const overlay = (root: ShadowRoot) => root.querySelector('.pd-dialog-overlay')
const textarea = (root: ShadowRoot) => root.querySelector<HTMLTextAreaElement>('.ee-textarea')

/**
 * 真实双击节奏：两次 mousedown/mouseup（本包双击判定在 mousedown 阶段，paint 全量重建后
 * 原生 dblclick 不会触发，画布链路不能再靠 dispatchEvent('dblclick') 模拟）。
 * 两击之间等一帧并重新取节点，复现「第一击选中→clear(shell) 重建→第二击落在新节点」的人工场景。
 */
async function dblClick(root: ShadowRoot, sel: string) {
  const opts = { bubbles: true, cancelable: true, button: 0, clientX: 10, clientY: 10 }
  for (let i = 0; i < 2; i++) {
    await frame()
    const node = root.querySelector<HTMLElement>(sel)
    if (!node) throw new Error(`节点不存在: ${sel}`)
    node.dispatchEvent(new MouseEvent('mousedown', opts))
    window.dispatchEvent(new MouseEvent('mouseup', opts))
  }
}

/** 与 canvas ExpressionEditor 相同的退出路径：footer 里「取消」「确定」两颗 pd-button */
async function clickFooter(root: ShadowRoot, text: '取消' | '确定') {
  const btn = Array.from(root.querySelectorAll<HTMLElement>('.pd-dialog-footer .pd-button'))
    .find(b => b.textContent === text)
  if (!btn) throw new Error(`弹窗按钮不存在: ${text}`)
  btn.click()
  await frame()
}

function setTextarea(root: ShadowRoot, value: string) {
  const ta = textarea(root)!
  ta.value = value
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => stubStorage())

describe('画布双击元素 → 表达式编辑器', () => {
  it('双击白名单 text 元素：弹窗打开、文本域预填 formatter、派发 dblclick-element（detail 为 id 字符串）', async () => {
    const { root, store, events } = await mountDesigner()
    store.addElement('text', { left: 10, top: 10, width: 40, height: 10 })
    const id = store.elements[store.elements.length - 1]!.id
    await frame()
    await dblClick(root, `[data-el-id="${id}"]`)
    await frame()
    expect(overlay(root)).not.toBe(null)
    expect(textarea(root)!.value).toBe('文本')
    expect(events).toEqual([{ type: 'dblclick-element', detail: id }])
  })

  it('弹窗内改表达式并点「确定」：写回 options.formatter 且弹窗关闭', async () => {
    const { root, store } = await mountDesigner()
    const el = store.addElement('text', { left: 10, top: 10, width: 40, height: 10 })
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"]`)
    await frame()
    setTextarea(root, '{supplier.name}')
    await clickFooter(root, '确定')
    expect(overlay(root)).toBe(null)
    const saved = store.elements.find(e => e.id === el.id)!.options.formatter
    expect(saved).toBe('{supplier.name}')
  })

  it('点「取消」只关弹窗，不写回', async () => {
    const { root, store } = await mountDesigner()
    const el = store.addElement('text', { left: 10, top: 10, width: 40, height: 10 })
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"]`)
    await frame()
    setTextarea(root, '不该生效')
    await clickFooter(root, '取消')
    expect(overlay(root)).toBe(null)
    expect(store.elements.find(e => e.id === el.id)!.options.formatter).toBe('文本')
  })

  it('锁定元素双击：只选中不弹窗（canvas 同护栏）', async () => {
    const { root, store, events } = await mountDesigner()
    const el = store.addElement('text', { left: 10, top: 10, width: 40, height: 10 })
    el.options.locked = true
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"]`)
    await frame()
    expect(overlay(root)).toBe(null)
    expect(store.selectedIds.has(el.id)).toBe(true)
    expect(events.map(e => e.type)).toEqual(['dblclick-element'])
  })

  it('非白名单类型（rect）双击：不弹窗', async () => {
    const { root, store } = await mountDesigner()
    const el = store.addElement('rect', { left: 10, top: 10, width: 20, height: 20 })
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"]`)
    await frame()
    expect(overlay(root)).toBe(null)
  })
})

describe('画布双击表格单元格 → 表达式编辑器', () => {
  it('双击单元格：弹窗预填该格 formatter、派发 dblclick-cell（detail 对象）、确定后按下标写回', async () => {
    const { root, store, events } = await mountDesigner()
    const el = store.addElement('table', { left: 5, top: 5 })
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"] td`)
    await frame()
    const cell0 = (el.options.tableRows ?? [])[0]?.cells[0]
    expect(cell0).toBeTruthy()
    expect(overlay(root)).not.toBe(null)
    expect(textarea(root)!.value).toBe(cell0!.formatter ?? '')
    expect(events).toEqual([{
      type: 'dblclick-cell',
      detail: { elementId: el.id, r: 0, c: 0, cellId: cell0!.id },
    }])
    setTextarea(root, '{qty}')
    await clickFooter(root, '确定')
    expect(overlay(root)).toBe(null)
    const saved = (store.elements.find(e => e.id === el.id)!.options.tableRows ?? [])[0]?.cells[0]
    expect(saved?.formatter).toBe('{qty}')
  })

  it('锁定表格双击单元格：只选中不弹窗', async () => {
    const { root, store, events } = await mountDesigner()
    const el = store.addElement('table', { left: 5, top: 5 })
    el.options.locked = true
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"] td`)
    await frame()
    expect(overlay(root)).toBe(null)
    expect(store.selectedIds.has(el.id)).toBe(true)
    expect(events.map(e => e.type)).toEqual(['dblclick-cell'])
  })

  it('未选中表格直接双击单元格：第一击选中表格、第二击仍打开弹窗，且只派发 dblclick-cell', async () => {
    const { root, store, events } = await mountDesigner()
    const el = store.addElement('table', { left: 5, top: 5 })
    store.clearSelection()
    await frame()
    await dblClick(root, `[data-el-id="${el.id}"] td`)
    await frame()
    expect(overlay(root)).not.toBe(null)
    expect(events.map(e => e.type)).toEqual(['dblclick-cell'])
  })
})
