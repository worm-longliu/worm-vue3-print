// @vitest-environment happy-dom
// 拖拽视觉态与属性台控件细节：对照 canvas 的 BaseElement（useDrag isDragging）、
// StepperInput（step 推精度 + 夹取 + 未变不提交）与「字体粗细」的 v-model 空白语义。
import { describe, it, expect, vi } from 'vitest'
import { DesignerStore } from '../core/store'
import { FormatToolbar } from '../core/format'
import { render } from '../core/h'
import { renderDesignElement } from '../shell/elements'
import { stepper } from '../shell/controls'
import type { ShellCtx } from '../shell/controls'
import { selectField } from '../shell/property-panel'

function ctxWith() {
  const store = new DesignerStore()
  store.addElement('text', { left: 10, top: 10, width: 40, height: 10 })
  const el = store.elements[0]!
  const ctx = {
    store, format: new FormatToolbar(store),
    state: { leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false, openDd: null, propSearch: '' },
    repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: {},
  } as unknown as ShellCtx
  return { ctx, el }
}

const paint = (ctx: ShellCtx, el: unknown) => {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderDesignElement(ctx, el as never), host)
  return host.querySelector<HTMLElement>('.print-element')!
}

describe('拖拽视觉态（canvas BaseElement 的 drag-ghost / drag-preview）', () => {
  it('store.draggingIds 命中的元素挂 .drag-ghost 并叠一个 .drag-preview', () => {
    const { ctx, el } = ctxWith()
    ctx.store.draggingIds = new Set([el.id])
    const node = paint(ctx, el)
    expect(node.classList.contains('drag-ghost')).toBe(true)
    expect(node.querySelectorAll(':scope > .drag-preview').length).toBe(1)
  })

  it('未拖拽时既无 .drag-ghost 也无 .drag-preview', () => {
    const { ctx, el } = ctxWith()
    const node = paint(ctx, el)
    expect(node.classList.contains('drag-ghost')).toBe(false)
    expect(node.querySelector('.drag-preview')).toBe(null)
  })
})

describe('stepper 精度与提交（canvas StepperInput 同口径）', () => {
  const mount = (opts: Parameters<typeof stepper>[0]) => {
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(stepper(opts), host)
    return host.querySelector<HTMLInputElement>('.pd-step-input')!
  }

  it('小数位由 step 推导：0.35 在 step 0.5 下显示 0.3', () => {
    expect(mount({ value: 0.35, min: 2, max: 4, step: 0.5, onCommit: () => {} }).value).toBe('0.3')
  })

  it('step 1 取整显示：20.5 → 21', () => {
    expect(mount({ value: 20.5, min: 0, onCommit: () => {} }).value).toBe('21')
  })

  it('未设置留空显示占位，步进从 min 起步', () => {
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    const onCommit = vi.fn()
    render(stepper({ value: undefined, min: 5, max: 24, placeholder: '默认 10', onCommit }), host)
    const input = host.querySelector<HTMLInputElement>('.pd-step-input')!
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('默认 10')
    host.querySelector<HTMLElement>('.pd-step-plus')!.click()
    expect(onCommit).toHaveBeenCalledWith(6)
  })

  it('提交值与当前值相同则不回调（避免重复入历史）', () => {
    const onCommit = vi.fn()
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(stepper({ value: 2, min: 2, max: 4, step: 0.5, onCommit }), host)
    host.querySelector<HTMLButtonElement>('.pd-step-minus')!.click()
    expect(onCommit).not.toHaveBeenCalled()
    expect(host.querySelector<HTMLButtonElement>('.pd-step-minus')!.disabled).toBe(true)
  })

  it('越界输入按 max/min 夹取并回写输入框（夹取后值没变也要归位）', () => {
    const onCommit = vi.fn()
    const input = mount({ value: 1, min: 1, max: 1, onCommit })
    input.value = '6'
    input.dispatchEvent(new Event('change'))
    expect(input.value).toBe('1')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('清空/非法输入回落当前值，不留空框', () => {
    const onCommit = vi.fn()
    const input = mount({ value: 8, min: 0, max: 100, onCommit })
    input.value = ''
    input.dispatchEvent(new Event('change'))
    expect(input.value).toBe('8')
    input.value = 'abc'
    input.dispatchEvent(new Event('change'))
    expect(input.value).toBe('8')
    expect(onCommit).not.toHaveBeenCalled()
  })
})

describe('下拉属性行（canvas 字体粗细的 v-model 语义）', () => {
  // 「值匹配不到选项 → 显示空白」这条依赖 selectedIndex=-1 的真实浏览器语义，
  // happy-dom 会把 -1 夹回 0（option.selected 恒为第一项 true），单测无法覆盖；
  // 已由成对截图断言兜底：demo-common/scripts/element-parity.mjs 的 text-*-panel.png 两侧同为空白。
  it('值命中选项时正常选中', () => {
    const { ctx } = ctxWith()
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(selectField(ctx, '字体粗细', 'bold', [
      { value: 'normal', label: '正常' }, { value: 'bold', label: '粗体' },
    ], () => {}), host)
    expect(host.querySelector<HTMLSelectElement>('.pd-select')!.value).toBe('bold')
  })
})
