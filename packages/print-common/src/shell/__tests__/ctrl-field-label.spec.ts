// @vitest-environment happy-dom
// 字段「名称 vs 取值」两条 Ctrl 口径（common 侧，与 canvas 同串）：
// 1) 表达式弹窗：Ctrl/⌘+双击字段插入字段中文名（参数内自动加引号），普通双击仍是 {字段}；
// 2) 画布落点：Ctrl/⌘ 拖放字段生成内容为字段中文名的静态文本元素。
import { describe, it, expect, beforeEach } from 'vitest'
import type { PrintBusinessField } from '@worm-vue3-print/core/designer'
import type { DesignerStore } from '../../core/store'
import { render } from '../../core/h'
import { renderExpressionEditor } from '../expression-editor'
import { PrintDesignerElement, definePrintDesigner } from '../../print-designer'

const fields: PrintBusinessField[] = [
  { id: '1', fieldKey: 'supplier', fieldLabel: '供应商信息', fieldType: 'string', sortOrder: 1 },
  { id: '2', fieldKey: 'supplier.name', fieldLabel: '供应商名称', fieldType: 'string', sortOrder: 2 },
]

// 表格行高测量与标尺绘制需要 2d context（happy-dom 返回的 context 方法不全），统一 stub 成 no-op
const ctxTarget: Record<string, unknown> = { measureText: (t: unknown) => ({ width: String(t).length * 8 }) }
const noopCtx: Record<string, unknown> = new Proxy(ctxTarget, {
  get: (target, prop) => (prop in target ? target[prop as string] : () => noopCtx),
  set: () => true,
})
;(HTMLCanvasElement.prototype as unknown as { getContext: (t: string) => unknown }).getContext =
  () => noopCtx

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

function frame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

function mountEditor() {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderExpressionEditor({
    fields,
    onClose: () => {},
    onApply: () => {},
  }, { elementId: 'el-1', targetPath: 'options.formatter', value: '' }), host)
  return host
}

/** 定位到「供应商名称」那一行（分组后的子字段行） */
function nameRow(host: HTMLElement): HTMLElement {
  const rows = Array.from(host.querySelectorAll<HTMLElement>('.ee-field-item'))
  const row = rows.find(r => r.textContent?.includes('供应商名称'))
  if (!row) throw new Error('找不到字段行「供应商名称」')
  return row
}

function fieldDoubleClick(host: HTMLElement, mods: { ctrlKey?: boolean; metaKey?: boolean }) {
  nameRow(host).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, ...mods }))
}

function textarea(host: HTMLElement): HTMLTextAreaElement {
  return host.querySelector<HTMLTextAreaElement>('.ee-textarea')!
}

function setExpression(host: HTMLElement, value: string, caret: number) {
  const ta = textarea(host)
  ta.value = value
  ta.dispatchEvent(new Event('input', { bubbles: true }))
  ta.selectionStart = ta.selectionEnd = caret
}

beforeEach(() => stubStorage())

describe('表达式弹窗：Ctrl+双击字段插入字段名称（common）', () => {
  it('Ctrl+双击插入字段中文名（不带大括号）', () => {
    const host = mountEditor()
    fieldDoubleClick(host, { ctrlKey: true })
    expect(textarea(host).value).toBe('供应商名称')
  })

  it('Meta（Mac Cmd）+双击同样插入字段中文名', () => {
    const host = mountEditor()
    fieldDoubleClick(host, { metaKey: true })
    expect(textarea(host).value).toBe('供应商名称')
  })

  it('函数参数内 Ctrl+双击自动加引号', () => {
    const host = mountEditor()
    setExpression(host, '{IF(', 4)
    fieldDoubleClick(host, { ctrlKey: true })
    expect(textarea(host).value).toBe('{IF("供应商名称"')
  })

  it('不按 Ctrl 仍是 {字段} 取值表达式（回归）', () => {
    const host = mountEditor()
    fieldDoubleClick(host, {})
    expect(textarea(host).value).toBe('{supplier.name}')
  })
})

describe('画布字段落点：Ctrl 拖放生成静态文本元素（common）', () => {
  async function mountDesigner() {
    definePrintDesigner()
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const el = document.createElement('print-designer') as PrintDesignerElement
    host.appendChild(el)
    const store = (el as unknown as { store: DesignerStore }).store
    store.fields = fields
    await frame()
    return { root: el.shadowRoot!, store }
  }

  function dropField(root: ShadowRoot, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) {
    const canvas = root.querySelector<HTMLElement>('[data-test="canvas-area"]')
    if (!canvas) throw new Error('找不到画布容器')
    const ev = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperties(ev, {
      dataTransfer: { value: { getData: (type: string) => (type === 'fieldKey' ? 'supplier.name' : '') } },
      ctrlKey: { value: !!mods.ctrlKey },
      metaKey: { value: !!mods.metaKey },
      clientX: { value: 10 },
      clientY: { value: 10 },
    })
    canvas.dispatchEvent(ev)
  }

  const lastElement = (store: DesignerStore) => store.elements[store.elements.length - 1]!

  it('普通放下：仍是取值绑定元素', async () => {
    const { root, store } = await mountDesigner()
    dropField(root)
    expect(lastElement(store).options.formatter).toBe('{supplier.name}')
  })

  it('按住 Ctrl 放下：内容是字段中文名的静态文本元素', async () => {
    const { root, store } = await mountDesigner()
    dropField(root, { ctrlKey: true })
    const el = lastElement(store)
    expect(el.printElementType.type).toBe('text')
    expect(el.options.formatter).toBe('供应商名称')
    expect(el.options.title).toBe('供应商名称')
  })

  it('按住 Meta（Mac Cmd）放下同样生成静态文本元素', async () => {
    const { root, store } = await mountDesigner()
    dropField(root, { metaKey: true })
    expect(lastElement(store).options.formatter).toBe('供应商名称')
  })

  it('dragover 显式写 dropEffect=copy（防 Windows 按住 Ctrl 时被原生重算吞掉复制徽标）', async () => {
    const { root } = await mountDesigner()
    const canvas = root.querySelector<HTMLElement>('[data-test="canvas-area"]')!
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    const dt: { dropEffect: string } = { dropEffect: 'none' }
    Object.defineProperty(ev, 'dataTransfer', { value: dt })
    canvas.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    expect(dt.dropEffect).toBe('copy')
  })

  /** dragover 桩：只暴露 types/dropEffect（真实浏览器拖动中读不了数据、能读类型） */
  function dragOver(root: ShadowRoot, opts: { types?: string[]; ctrlKey?: boolean; metaKey?: boolean } = {}) {
    const canvas = root.querySelector<HTMLElement>('[data-test="canvas-area"]')!
    const ev = new Event('dragover', { bubbles: true, cancelable: true })
    const dt: { types: string[]; dropEffect: string } = { types: opts.types ?? [], dropEffect: 'none' }
    Object.defineProperties(ev, {
      dataTransfer: { value: dt },
      ctrlKey: { value: !!opts.ctrlKey },
      metaKey: { value: !!opts.metaKey },
      clientX: { value: 10 },
      clientY: { value: 10 },
    })
    canvas.dispatchEvent(ev)
    return dt
  }
  const hintText = (root: ShadowRoot) => root.querySelector('.drop-hint')?.textContent ?? null

  it('落点自绘徽标与 canvas 同文案，放下即消失', async () => {
    const { root, store } = await mountDesigner()
    // 未按键在前：按过修饰键后徽标按锁存值保持（锁存语义见下一条用例）
    dragOver(root, { types: ['fieldkey'] })
    expect(hintText(root)).toBe('＋ 取值字段')
    dragOver(root, { types: ['fieldkey'], metaKey: true })
    expect(hintText(root)).toBe('＋ 静态文本')
    dragOver(root, { types: ['elementtype'], ctrlKey: true })
    expect(hintText(root)).toBe('＋ 元素')
    dragOver(root, { types: ['files'] })
    expect(hintText(root)).toBe(null)

    // 元素放下：徽标先摘除、再落库，画布出现新元素
    dragOver(root, { types: ['elementtype'] })
    expect(hintText(root)).toBe('＋ 元素')
    const canvas = root.querySelector<HTMLElement>('[data-test="canvas-area"]')!
    const d = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperties(d, {
      dataTransfer: { value: { getData: (t: string) => (t === 'elementType' ? 'text' : '') } },
      clientX: { value: 10 },
      clientY: { value: 10 },
    })
    canvas.dispatchEvent(d)
    expect(hintText(root)).toBe(null)
    expect(store.elements.some(el => el.printElementType.type === 'text')).toBe(true)
  })

  it('拖拽中按过 ⌘ 即锁存：松键后的 drop 仍落静态文本，徽标同步锁存值', async () => {
    const { root, store } = await mountDesigner()
    dragOver(root, { types: ['fieldkey'], metaKey: true })
    expect(hintText(root)).toBe('＋ 静态文本')
    // 途中松开 ⌘（macOS 用户被迫的先松键再松鼠标序列）：徽标与落点都按锁存值
    dragOver(root, { types: ['fieldkey'] })
    expect(hintText(root)).toBe('＋ 静态文本')
    dropField(root)
    expect(lastElement(store).options.formatter).toBe('供应商名称')
    // 锁存随会话复位：下一次普通拖放仍是取值绑定
    dropField(root)
    expect(lastElement(store).options.formatter).toBe('{supplier.name}')
  })
})
