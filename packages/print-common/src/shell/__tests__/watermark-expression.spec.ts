// @vitest-environment happy-dom
// common 水印区段的两条硬约束（canvas 的 WatermarkConfig.vue 已由 Vue 组件测试覆盖）：
// 1) 改数值项（旋转/颜色/透明度/密度）不得冲掉已配好的表达式或静态文本——
//    updateTemplateData 是浅合并，watermark 整体被替换，commit 必须带上其余键；
// 2) 设计稿里水印要真能看见——瓦片内的 <text> 必须以 SVG 命名空间创建，
//    document.createElement('text') 是 HTMLUnknownElement，不会绘制。
import { describe, it, expect } from 'vitest'
import { WATERMARK_DEFAULTS } from '@worm-vue3-print/core'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { watermarkSection } from '../watermark'
import { renderCanvasArea } from '../canvas'
import type { CanvasUI } from '../canvas'

function makeCtx(watermark?: Record<string, any>) {
  const store = new DesignerStore()
  if (watermark) store.updateTemplateData({ watermark } as never)
  const state: ShellState = {
    leftTab: 'elements', leftCollapsed: false, propTab: 'page', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
  const ctx: ShellCtx = {
    store, format: new FormatToolbar(store), state,
    repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: {},
  }
  return { store, ctx }
}

function paintPanel(watermark?: Record<string, any>) {
  const { store, ctx } = makeCtx(watermark)
  const host = document.createElement('div')
  render(watermarkSection(ctx), host)
  return { store, host }
}

const wmOf = (store: DesignerStore) => (store.templateData as any).watermark

const EMPTY_CANVAS_UI: CanvasUI = {
  geom: {} as never,
  marquee: { visible: false, x: 0, y: 0, w: 0, h: 0 },
  contextMenu: { visible: false, x: 0, y: 0, flipX: 0, flipY: 0, targetId: null },
  guidePreview: null,
  zoneResizing: null,
  scrollX: 0,
  scrollY: 0,
}

function rangeOf(host: HTMLElement, index: number) {
  return host.querySelectorAll<HTMLInputElement>('input[type="range"]')[index]!
}

describe('common 水印：改数值项不清空表达式', () => {
  it('改旋转角度/透明度/密度后 binding 与 mode 保留', () => {
    const { store, host } = paintPanel({ mode: 'binding', binding: '{order.no}', content: '' })
    const rotate = rangeOf(host, 0)
    rotate.value = '30'
    rotate.dispatchEvent(new Event('change'))
    expect(wmOf(store).binding).toBe('{order.no}')
    expect(wmOf(store).mode).toBe('binding')
    expect(wmOf(store).rotate).toBe(30)

    const opacity = rangeOf(host, 1)
    opacity.value = '0.2'
    opacity.dispatchEvent(new Event('change'))
    expect(wmOf(store).binding).toBe('{order.no}')
    expect(wmOf(store).opacity).toBe(0.2)

    const select = host.querySelector<HTMLSelectElement>('select.pd-select')!
    select.value = 'loose'
    select.dispatchEvent(new Event('change'))
    expect(wmOf(store).binding).toBe('{order.no}')
    expect(wmOf(store).tileWidth).toBe(340)
  })

  it('改旋转角度后静态文本 content 保留', () => {
    const { store, host } = paintPanel({ mode: 'fixed', content: '内部资料', binding: '' })
    const rotate = rangeOf(host, 0)
    rotate.value = '-60'
    rotate.dispatchEvent(new Event('change'))
    expect(wmOf(store).content).toBe('内部资料')
    expect(wmOf(store).mode).toBe('fixed')
    expect(wmOf(store).rotate).toBe(-60)
    expect(wmOf(store).color).toBe(WATERMARK_DEFAULTS.color)
  })

  it('「恢复默认值」清旋转角度时同样不碰表达式', () => {
    const { store, host } = paintPanel({ mode: 'binding', binding: '{printDate}', rotate: 0 })
    const btn = [...host.querySelectorAll<HTMLElement>('.pd-field')]
      .find(f => (f.querySelector('.pd-label')?.textContent ?? '').includes('旋转角度'))!
      .querySelector<HTMLButtonElement>('.pd-reset-btn')!
    btn.click()
    expect(wmOf(store).rotate).toBe(WATERMARK_DEFAULTS.rotate)
    expect(wmOf(store).binding).toBe('{printDate}')
    expect(wmOf(store).mode).toBe('binding')
  })
})

describe('common 水印：设计稿可见', () => {
  it('水印层渲染出 SVG 命名空间的文本瓦片', () => {
    const { ctx } = makeCtx({ mode: 'fixed', content: '内部资料' })
    const host = document.createElement('div')
    render(renderCanvasArea(ctx, EMPTY_CANVAS_UI), host)

    const layer = host.querySelector<HTMLElement>('.watermark-layer')
    expect(layer).toBeTruthy()
    const tiles = host.querySelectorAll('.watermark-tile')
    expect(tiles.length).toBeGreaterThan(0)

    const text = tiles[0]!.querySelector('text')!
    expect(text).toBeTruthy()
    // HTML 命名空间的 <text> 不会绘制，水印在设计稿里等于不可见
    expect(text.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(text.textContent).toBe('内部资料')
  })

  it('表达式水印在无业务数据的设计态回退为 [表达式] 占位可见', () => {
    const { ctx } = makeCtx({ mode: 'binding', binding: '{order.no}', testData: '' })
    const host = document.createElement('div')
    render(renderCanvasArea(ctx, EMPTY_CANVAS_UI), host)
    const text = host.querySelector('.watermark-tile text')
    expect(text?.textContent).toBe('[{order.no}]')
  })
})
