// @vitest-environment happy-dom
// common 侧元素级旋转归属门禁（与 canvas 成对实现，判据一律取 core 单点）：
// 契约四 —— table/flowList 与表格跟随区成员：渲染不转、属性台不出「旋转」行；
// 契约五 —— barcode/qrcode 无 ≥385dpi 承诺时自由角度置灰，只留 90° 步进。
import { describe, it, expect } from 'vitest'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { renderPropertyPanel } from '../property-panel'
import { renderDesignElement, elementStyle } from '../elements'
import { collectFollowMemberIds } from '@worm-vue3-print/core/designer'
import type { ElementType } from '@worm-vue3-print/core/designer'

/** 表格（设计底部 = top 10 + max(height 24, 行高和 16) = 34）+ 其下方的跟随成员 + 横向零交集元素 */
function buildStore(): DesignerStore {
  const store = new DesignerStore()
  store.addElement('table' as ElementType, {
    left: 10, top: 10, width: 100, height: 24,
    tableColWidths: [40, 60],
    tableRows: [
      { id: 'h1', type: 'header', height: 8, cells: [] },
      { id: 'd1', type: 'data', height: 8, cells: [] },
    ],
  })
  store.addElement('text' as ElementType, { left: 10, top: 40, width: 40, height: 8, rotate: 45 })
  store.addElement('text' as ElementType, { left: 120, top: 40, width: 30, height: 8, rotate: 45 })
  return store
}

function makeCtx(store: DesignerStore, propTab: 'element' | 'page' = 'element'): ShellCtx {
  const state: ShellState = {
    leftTab: 'elements', leftCollapsed: false, propTab, propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
  return {
    store, format: new FormatToolbar(store), state, repaint: () => {}, fire: () => {},
    showHelp: true, isEdit: false, host: { fonts: [] },
  }
}

function paintPanel(store: DesignerStore, index: number): HTMLElement {
  store.selectOne(store.elements[index]!.id)
  const host = document.createElement('div')
  render(renderPropertyPanel(makeCtx(store)), host)
  return host
}

const hasRotateRow = (host: HTMLElement) =>
  [...host.querySelectorAll('.pd-label')].some(n => (n.textContent ?? '').includes('旋转 (°)'))

function paintElement(store: DesignerStore, index: number): HTMLElement {
  const ctx = makeCtx(store)
  const followIds = collectFollowMemberIds(store.elements)
  const host = document.createElement('div')
  render(renderDesignElement(ctx, store.elements[index]!, followIds), host)
  return host
}

describe('common 属性台旋转行归属（契约四）', () => {
  it('表格元素不出「旋转」行', () => {
    expect(hasRotateRow(paintPanel(buildStore(), 0))).toBe(false)
  })

  it('表格跟随区成员不出「旋转」行（出纸忽略其 rotate）', () => {
    expect(hasRotateRow(paintPanel(buildStore(), 1))).toBe(false)
  })

  it('与表格横向零交集的元素照常出行', () => {
    expect(hasRotateRow(paintPanel(buildStore(), 2))).toBe(true)
  })
})

describe('common 码类斜角置灰（契约五）', () => {
  function paintCode(type: ElementType, options: Record<string, any> = {}) {
    const store = new DesignerStore()
    store.addElement(type, { left: 10, top: 10, width: 40, height: 16, testData: '12345678', ...options })
    return paintPanel(store, 0)
  }

  it('条码未声明打印头分辨率：角度输入框禁用并给 90° 步进提示', () => {
    const host = paintCode('barcode')
    const input = host.querySelector<HTMLInputElement>('.pd-rotate-row input')!
    expect(input.disabled).toBe(true)
    expect(host.querySelector('.pd-rotate-note')?.textContent).toContain('90° 步进')
  })

  it('二维码与条码同口径', () => {
    const host = paintCode('qrcode', { testData: 'ABC' })
    expect(host.querySelector<HTMLInputElement>('.pd-rotate-row input')!.disabled).toBe(true)
  })

  it('声明 385dpi 以上放开自由角度', () => {
    const host = paintCode('barcode', { printerDpi: 385 })
    expect(host.querySelector<HTMLInputElement>('.pd-rotate-row input')!.disabled).toBe(false)
    expect(host.querySelector('.pd-rotate-note')).toBeNull()
  })

  it('文本元素不受影响', () => {
    const store = new DesignerStore()
    store.addElement('text', { left: 10, top: 10, width: 40, height: 8 })
    const host = paintPanel(store, 0)
    expect(host.querySelector<HTMLInputElement>('.pd-rotate-row input')!.disabled).toBe(false)
  })
})

describe('common 画布旋转与出纸同口径', () => {
  it('跟随区成员不写 rotate（画布所见 = 出纸不转）', () => {
    const host = paintElement(buildStore(), 1)
    expect(host.querySelector('.print-element')?.getAttribute('style') ?? '').not.toContain('rotate')
  })

  it('非成员元素照常写 rotate', () => {
    const host = paintElement(buildStore(), 2)
    expect(host.querySelector('.print-element')?.getAttribute('style') ?? '').toContain('rotate: 45deg')
  })

  it('elementStyle 不传归属集合时保持旧行为（宿主未接也不会崩）', () => {
    const el = buildStore().elements[1]!
    expect(elementStyle(el).rotate).toBe('45deg')
  })
})
