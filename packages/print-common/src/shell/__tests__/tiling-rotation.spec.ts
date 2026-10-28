// @vitest-environment happy-dom
// common 侧拼版 + 内容旋转：摘要报每格尺寸；拼版启用时页面属性仍提供内容旋转角度（每格口径）。
import { describe, it, expect } from 'vitest'
import { TILE_DEFAULTS } from '@worm-vue3-print/core'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { tilingSection } from '../page-extras'
import { renderPropertyPanel } from '../property-panel'

function makeCtx(store: DesignerStore): ShellCtx {
  const state: ShellState = {
    leftTab: 'elements', leftCollapsed: false, propTab: 'page', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
  return { store, format: new FormatToolbar(store), state, repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: {} }
}

function storeWith(over: Record<string, any>): DesignerStore {
  const store = new DesignerStore()
  store.updateTemplateData(over as never)
  return store
}

/** 70×40mm 标签模板：拼版几何默认按它算（默认 A4 会把列数判成非法） */
function labelStore(over: Record<string, any>): DesignerStore {
  return storeWith({
    paperSize: 'CUSTOM', customWidth: 70, customHeight: 40, orientation: 'portrait',
    ...over,
  })
}

function paint(node: unknown): HTMLElement {
  const host = document.createElement('div')
  render(node as never, host)
  return host
}

describe('common 拼版摘要含每格尺寸', () => {
  it('0° 摘要报每格 70×40mm', () => {
    const host = paint(tilingSection(makeCtx(labelStore({
      tiling: { ...TILE_DEFAULTS, columns: 2 },
    }))))
    expect(host.querySelector('.tiling-summary')?.textContent).toContain('每格 70×40mm')
  })

  it('90° 摘要按互换后的 40×70mm 报，行列同步重算', () => {
    const host = paint(tilingSection(makeCtx(labelStore({
      outputRotation: 90,
      tiling: { ...TILE_DEFAULTS, columns: 4 },
    }))))
    const text = host.querySelector('.tiling-summary')?.textContent ?? ''
    expect(text).toContain('4 列 × 3 行 = 每张 12 格')
    expect(text).toContain('每格 40×70mm')
  })
})

describe('common 拼版启用时仍显示内容旋转角度', () => {
  const labelsOf = (host: HTMLElement) =>
    [...host.querySelectorAll('.pd-label')].map(n => n.textContent ?? '')

  it('拼版开启：页面属性可见内容旋转角度，提示走每格口径', () => {
    const host = paint(renderPropertyPanel(makeCtx(storeWith({
      tiling: { ...TILE_DEFAULTS, enabled: true },
      outputRotation: 90,
    }))))
    expect(labelsOf(host)).toContain('内容旋转角度')
    expect(host.textContent).toContain('每个标签')
  })

  it('拼版关闭：沿用整页口径提示', () => {
    const host = paint(renderPropertyPanel(makeCtx(storeWith({}))))
    expect(host.textContent).toContain('整页内容旋转')
  })
})

describe('common 旋转档位切换时拼版列数自动铺满新上限', () => {
  const clickRot = (host: HTMLElement, value: string) => {
    const input = [...host.querySelectorAll('input[type="radio"]')]
      .find(i => (i as HTMLInputElement).value === value) as HTMLInputElement
    input.checked = true
    input.dispatchEvent(new Event('change'))
  }

  it('0°→90°：列数从 2 铺满到 4', () => {
    const store = labelStore({ tiling: { ...TILE_DEFAULTS, columns: 2 } })
    const host = paint(renderPropertyPanel(makeCtx(store)))
    clickRot(host, '90')
    const t = store.templateData as Record<string, any>
    expect(t.outputRotation).toBe(90)
    expect(t.tiling.columns).toBe(4)
  })

  it('90°→0°：切回原档位列数按原上限回排（4→2）', () => {
    const store = labelStore({ outputRotation: 90, tiling: { ...TILE_DEFAULTS, columns: 4 } })
    const host = paint(renderPropertyPanel(makeCtx(store)))
    clickRot(host, '0')
    const t = store.templateData as Record<string, any>
    expect(t.outputRotation).toBe(0)
    expect(t.tiling.columns).toBe(2)
  })

  it('0°→180°：每格占位不变，列数不被重排', () => {
    // 40×70 标签 0° 档最多可放 4 列，作者只设 3 列——180° 不得把它铺满成 4
    const store = labelStore({
      customWidth: 40, customHeight: 70,
      tiling: { ...TILE_DEFAULTS, columns: 3 },
    })
    const host = paint(renderPropertyPanel(makeCtx(store)))
    clickRot(host, '180')
    const t = store.templateData as Record<string, any>
    expect(t.outputRotation).toBe(180)
    expect(t.tiling.columns).toBe(3)
  })
})
