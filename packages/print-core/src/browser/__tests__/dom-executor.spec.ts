// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import { domExecutor, readMeasurements, readContentBottom, readElementRects, renderCodes, applyTextFit } from '../dom-executor.js'
import { mmToPx } from '../../designer/utils/units.js'
import { codeSpecKey } from '../../print/codes.js'
import { EXECUTOR_TARGETS } from '../../print/driver.js'

beforeAll(() => {
  // happy-dom 不实现 canvas 2d 上下文；jsbarcode 需要它测量文字宽度
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = () => ({ font: '', measureText: (text: string) => ({ width: String(text).length * 8 }) })
})

/** stub 布局高度：执行器读 getBoundingClientRect().height，必须是亚像素精度 */
function stubHeight<T extends HTMLElement>(node: T, height: number): T {
  Object.defineProperty(node, 'getBoundingClientRect', {
    value: () => ({ height, top: 0, bottom: height, width: 0, left: 0, right: 0 }),
    configurable: true,
  })
  return node
}

describe('readMeasurements', () => {
  it('读取元素高度与表格行高（原始 px，不做换算）', () => {
    document.body.innerHTML = `
      <div data-measure-id="a"></div>
      <div data-measure-id="t">
        <table class="print-table"><tbody>
          <tr data-row-index="0"></tr><tr data-row-index="1"></tr>
        </tbody></table>
      </div>`
    stubHeight(document.querySelector('[data-measure-id="a"]') as HTMLElement, 38)
    stubHeight(document.querySelector('[data-measure-id="t"]') as HTMLElement, 760)
    const rows = document.querySelectorAll('tbody > tr[data-row-index]')
    stubHeight(rows[0] as HTMLElement, 38)
    stubHeight(rows[1] as HTMLElement, 190)

    expect(readMeasurements(document)).toEqual([
      { id: 'a', heightPx: 38 },
      { id: 't', heightPx: 760, rowHeightsPx: [38, 190] },
    ])
  })

  it('亚像素高度原样返回，不向上取整（38mm = 143.609px 不得读作 144px）', () => {
    document.body.innerHTML = '<div data-measure-id="f"></div>'
    stubHeight(document.querySelector('[data-measure-id="f"]') as HTMLElement, 143.609375)
    expect(readMeasurements(document)).toEqual([{ id: 'f', heightPx: 143.609375 }])
  })

  it('无表格时读取流式列表逐行高度（原始 px，按行序）', () => {
    document.body.innerHTML = `
      <div data-measure-id="f">
        <div class="print-flow-row" data-flow-row-index="0"></div>
        <div class="print-flow-row" data-flow-row-index="1"></div>
      </div>`
    stubHeight(document.querySelector('[data-measure-id="f"]') as HTMLElement, 114)
    const rows = document.querySelectorAll('.print-flow-row')
    stubHeight(rows[0] as HTMLElement, 38)
    stubHeight(rows[1] as HTMLElement, 76)

    expect(readMeasurements(document)).toEqual([{ id: 'f', heightPx: 114, rowHeightsPx: [38, 76] }])
  })

  it('缺 data-measure-id 的元素被跳过', () => {
    document.body.innerHTML = '<div data-measure-id=""><span></span></div>'
    expect(readMeasurements(document)).toEqual([])
  })
})

describe('readContentBottom', () => {
  it('取内容区后代相对页面顶部的最大底边（px）', () => {
    document.body.innerHTML = `
      <section class="print-page">
        <div class="content-area"><div id="inner"></div></div>
      </section>`
    const page = document.querySelector('.print-page') as HTMLElement
    const inner = document.querySelector('#inner') as HTMLElement
    Object.defineProperty(page, 'getBoundingClientRect', { value: () => ({ top: 100, bottom: 400 }) })
    Object.defineProperty(inner, 'getBoundingClientRect', {
      value: () => ({ top: 120, bottom: 250, height: 130 }),
    })
    expect(readContentBottom(document)).toBe(150)
  })

  it('连续纸底边只补元素根盒 marginBottom', () => {
    document.body.innerHTML = `<section class="print-page"><div class="content-area">
      <div id="root" class="print-element" style="margin-bottom:7px"><div id="child" style="margin-bottom:20px"></div></div>
    </div></section>`
    const page = document.querySelector('.print-page') as HTMLElement
    const area = document.querySelector('.content-area') as HTMLElement
    const root = document.querySelector('#root') as HTMLElement
    const child = document.querySelector('#child') as HTMLElement
    Object.defineProperty(page, 'getBoundingClientRect', { value: () => ({ top: 10, bottom: 200 }) })
    Object.defineProperty(area, 'getBoundingClientRect', { value: () => ({ top: 10, bottom: 100, height: 90 }) })
    Object.defineProperty(root, 'getBoundingClientRect', { value: () => ({ top: 100, bottom: 130, height: 30 }) })
    Object.defineProperty(child, 'getBoundingClientRect', { value: () => ({ top: 100, bottom: 120, height: 20 }) })
    expect(readContentBottom(document)).toBe(127)
  })

  it('缺少打印页或内容区时返回 0', () => {
    document.body.innerHTML = '<div></div>'
    expect(readContentBottom(document)).toBe(0)
  })
})

describe('readElementRects 区域坐标', () => {
  /** stub 视口矩形：执行器读 getBoundingClientRect() 的 left/top/width/height */
  function stubRect(el: HTMLElement, r: { left: number; top: number; width: number; height: number }): void {
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }),
      configurable: true,
    })
  }

  it('页眉/页脚/内容区元素分别以各自容器左上角为原点', () => {
    document.body.innerHTML = `
      <section class="print-page">
        <div class="page-header"><div data-element-id="h"></div></div>
        <div class="content-area"><div data-element-id="c"></div></div>
        <div class="page-footer"><div data-element-id="f"></div></div>
      </section>`
    const page = document.querySelector('.print-page') as HTMLElement
    const header = document.querySelector('.page-header') as HTMLElement
    const area = document.querySelector('.content-area') as HTMLElement
    const footer = document.querySelector('.page-footer') as HTMLElement
    stubRect(page, { left: 0, top: 0, width: 800, height: 1100 })
    stubRect(header, { left: 38, top: 38, width: 724, height: 76 })
    stubRect(area, { left: 38, top: 114, width: 724, height: 900 })
    stubRect(footer, { left: 38, top: 1052, width: 724, height: 48 })
    stubRect(document.querySelector('[data-element-id="h"]') as HTMLElement, { left: 76, top: 46, width: 100, height: 20 })
    stubRect(document.querySelector('[data-element-id="c"]') as HTMLElement, { left: 76, top: 171, width: 100, height: 20 })
    stubRect(document.querySelector('[data-element-id="f"]') as HTMLElement, { left: 76, top: 1060, width: 100, height: 20 })
    expect(readElementRects(document)).toEqual([
      { id: 'h', left: 38, top: 8, width: 100, height: 20, zone: 'header' },
      { id: 'c', left: 38, top: 57, width: 100, height: 20, zone: 'content' },
      { id: 'f', left: 38, top: 8, width: 100, height: 20, zone: 'footer' },
    ])
  })

  it('有页眉时内容元素以内容区为原点，不再叠加页眉高', () => {
    document.body.innerHTML = `
      <section class="print-page">
        <div class="page-header"><span>页眉</span></div>
        <div class="content-area"><div data-element-id="c"></div></div>
      </section>`
    const page = document.querySelector('.print-page') as HTMLElement
    const area = document.querySelector('.content-area') as HTMLElement
    stubRect(page, { left: 0, top: 0, width: 800, height: 1100 })
    stubRect(area, { left: 38, top: 114, width: 724, height: 900 }) // 内容区顶起算于页眉之后
    stubRect(document.querySelector('[data-element-id="c"]') as HTMLElement, { left: 38, top: 171, width: 100, height: 20 })
    expect(readElementRects(document)).toEqual([
      { id: 'c', left: 0, top: 57, width: 100, height: 20, zone: 'content' },
    ])
  })

  it('缺 .content-area 时回退到 .print-page 内容框（减 padding），zone 仍为 content', () => {
    document.body.innerHTML = `
      <section class="print-page" style="padding: 38px"><div data-element-id="c"></div></section>`
    const page = document.querySelector('.print-page') as HTMLElement
    stubRect(page, { left: 0, top: 0, width: 800, height: 1100 })
    stubRect(document.querySelector('[data-element-id="c"]') as HTMLElement, { left: 80, top: 120, width: 100, height: 20 })
    expect(readElementRects(document)).toEqual([
      { id: 'c', left: 42, top: 82, width: 100, height: 20, zone: 'content' },
    ])
  })

  it('回退路径：padding 只扣一次（非对称内边距 + 页面自身有偏移）', () => {
    document.body.innerHTML = `
      <section class="print-page" style="padding: 20px 40px"><div data-element-id="c"></div></section>`
    const page = document.querySelector('.print-page') as HTMLElement
    stubRect(page, { left: 100, top: 200, width: 800, height: 1100 })
    stubRect(document.querySelector('[data-element-id="c"]') as HTMLElement, { left: 160, top: 220, width: 100, height: 20 })
    // 原点 = 页面边框左上 + padding（140, 220）；若把 padding 扣两样会得到 (-20, -20)
    expect(readElementRects(document)).toEqual([
      { id: 'c', left: 20, top: 0, width: 100, height: 20, zone: 'content' },
    ])
  })

  it('.content-area 存在时以容器为原点，不再叠加页面 padding', () => {
    document.body.innerHTML = `
      <section class="print-page" style="padding: 38px">
        <div class="content-area"><div data-element-id="c"></div></div>
      </section>`
    const page = document.querySelector('.print-page') as HTMLElement
    const area = document.querySelector('.content-area') as HTMLElement
    stubRect(page, { left: 0, top: 0, width: 800, height: 1100 })
    stubRect(area, { left: 38, top: 38, width: 724, height: 1024 }) // 已在 padding 内侧
    stubRect(document.querySelector('[data-element-id="c"]') as HTMLElement, { left: 76, top: 57, width: 100, height: 20 })
    // 若再减一次 padding 会变成 (0, 19)
    expect(readElementRects(document)).toEqual([
      { id: 'c', left: 38, top: 19, width: 100, height: 20, zone: 'content' },
    ])
  })

  it('没有第 pageIndex 页时返回空数组', () => {
    document.body.innerHTML = '<div></div>'
    expect(readElementRects(document, 3)).toEqual([])
  })
})

describe('renderCodes', () => {
  it('返回 键→SVG 映射，键与 codeSpecKey 一致', () => {
    const key = codeSpecKey('12345678', 'barcode', { barcodeType: 'CODE128' })
    const map = renderCodes([
      { key, value: '12345678', cellType: 'barcode', opts: { barcodeType: 'CODE128' } },
    ])
    expect(Object.keys(map)).toEqual([key])
    expect(map[key]).toContain('<svg')
  })

  it('二维码同样产出 SVG', () => {
    const key = codeSpecKey('https://example.com', 'qrcode', { qrCodeLevel: 'M' })
    const map = renderCodes([
      { key, value: 'https://example.com', cellType: 'qrcode', opts: { qrCodeLevel: 'M' } },
    ])
    expect(map[key]).toContain('shape-rendering="crispEdges"')
  })

  it('码值渲染失败时跳过该键，交由 core 降级为文本占位', () => {
    const key = codeSpecKey('', 'barcode', {})
    expect(renderCodes([{ key, value: '', cellType: 'barcode', opts: {} }])).toEqual({})
  })
})

describe('宿主目标约定', () => {
  it('约定表覆盖全部执行器方法，renderCodes 不接收宿主目标', () => {
    const methods = Object.keys(domExecutor).filter(key => key !== 'version').sort()
    expect(Object.keys(EXECUTOR_TARGETS).sort()).toEqual(methods)
    expect(EXECUTOR_TARGETS.renderCodes).toBe('none')
    expect(EXECUTOR_TARGETS.applyTextFit).toBe('document')
  })
})

// ─── 自动缩小 ───
// happy-dom 无排版引擎：以「内容高度 = 行数 × 字号 px（取整，同真实 scrollHeight）」模拟换行文本
const PT_TO_PX = 96 / 72
const TOLERANCE_PX = 0.5

/** 与 stubFitBox 同口径的内容高度（px） */
function contentPx(pt: number, lines: number): number {
  return Math.round(pt * PT_TO_PX * lines)
}

/** 模拟节点：scrollHeight = lines × 字号(px)，clientHeight = 容器裁剪高度 */
function stubFitBox(node: HTMLElement, lines: number, clientHeightPx?: number): HTMLElement {
  Object.defineProperty(node, 'scrollHeight', {
    get(this: HTMLElement) {
      return contentPx(Number.parseFloat(this.style.fontSize || '12'), lines)
    },
    configurable: true,
  })
  if (clientHeightPx !== undefined) {
    Object.defineProperty(node, 'clientHeight', { get: () => clientHeightPx, configurable: true })
  }
  return node
}

describe('applyTextFit', () => {
  it('按容器裁剪盒（元素级）二分字号，返回需回写的清单', () => {
    // 容器高 8px：12pt=16px 放不下，缩到 8px 恰好放得下
    document.body.innerHTML = `
      <div data-fit="shrink" data-fit-key="t1" data-fit-base="12" data-fit-min="3">内容内容</div>`
    const el = stubFitBox(document.querySelector('[data-fit="shrink"]') as HTMLElement, 1, 8)

    const [fit] = applyTextFit(document)
    expect(fit!.key).toBe('t1')
    // 放得下，且再大 0.2pt 就放不下（等价于取到最大可放字号）
    expect(contentPx(fit!.fontSizePt, 1)).toBeLessThanOrEqual(8 + TOLERANCE_PX)
    expect(contentPx(fit!.fontSizePt + 0.2, 1)).toBeGreaterThan(8 + TOLERANCE_PX)
    expect(el.style.fontSize).toBe(`${fit!.fontSizePt}pt`)
    expect(el.getAttribute('data-fit-size')).toBe(String(fit!.fontSizePt))
  })

  it('单元格按 data-fit-mm 换算可用高度（mm → CSS px）', () => {
    // 可用高度 10mm ≈ 37.8px，内容 3 行
    document.body.innerHTML = `
      <div data-fit="shrink" data-fit-key="tb1#b#0:0" data-fit-base="12" data-fit-min="1" data-fit-mm="10">内容</div>`
    const el = stubFitBox(document.querySelector('[data-fit="shrink"]') as HTMLElement, 3)
    const capPx = mmToPx(10)

    const [fit] = applyTextFit(document)
    expect(fit!.key).toBe('tb1#b#0:0')
    expect(contentPx(fit!.fontSizePt, 3)).toBeLessThanOrEqual(capPx + TOLERANCE_PX)
    expect(contentPx(fit!.fontSizePt + 0.2, 3)).toBeGreaterThan(capPx + TOLERANCE_PX)
    expect(el.style.fontSize).toBe(`${fit!.fontSizePt}pt`)
  })

  it('放得下时不缩放，原样返回基准字号', () => {
    document.body.innerHTML = `
      <div data-fit="shrink" data-fit-key="t2" data-fit-base="12" data-fit-min="6">短</div>`
    const el = stubFitBox(document.querySelector('[data-fit="shrink"]') as HTMLElement, 1, 40)
    expect(applyTextFit(document)).toEqual([{ key: 't2', fontSizePt: 12 }])
    expect(el.style.fontSize).toBe('12pt')
  })

  it('缩到下限仍放不下时停在下限字号，交由容器裁剪（等价截断）', () => {
    document.body.innerHTML = `
      <div data-fit="shrink" data-fit-key="t3" data-fit-base="12" data-fit-min="10">超长内容</div>`
    stubFitBox(document.querySelector('[data-fit="shrink"]') as HTMLElement, 1, 4)
    expect(applyTextFit(document)).toEqual([{ key: 't3', fontSizePt: 10 }])
  })

  it('不换行时按横向溢出缩小（高度放得下但整行被裁）', () => {
    // 单行 10 个字宽；容器高 40px 竖向永远放得下，只有横向会溢出
    document.body.innerHTML = `
      <div data-fit="shrink" data-fit-key="t4" data-fit-base="12" data-fit-min="3" style="white-space:nowrap">超长单行内容</div>`
    const el = document.querySelector('[data-fit="shrink"]') as HTMLElement
    Object.defineProperty(el, 'scrollHeight', { get: () => 16, configurable: true })
    Object.defineProperty(el, 'clientHeight', { get: () => 40, configurable: true })
    Object.defineProperty(el, 'scrollWidth', {
      get(this: HTMLElement) {
        return contentPx(Number.parseFloat(this.style.fontSize || '12'), 10)
      },
      configurable: true,
    })
    Object.defineProperty(el, 'clientWidth', { get: () => 40, configurable: true })

    const [fit] = applyTextFit(document)
    expect(el.style.fontSize).toBe(`${fit!.fontSizePt}pt`)
    // 缩到内容宽刚好放得下的最大字号，且明显小于基准
    expect(contentPx(fit!.fontSizePt, 10)).toBeLessThanOrEqual(40 + TOLERANCE_PX)
    expect(contentPx(fit!.fontSizePt + 0.2, 10)).toBeGreaterThan(40 + TOLERANCE_PX)
    expect(fit!.fontSizePt).toBeLessThan(12)
  })

  it('非 shrink 节点与缺 key 的节点不参与，也不写字号', () => {
    document.body.innerHTML = `
      <div data-fit="clip" data-fit-key="a">截断</div>
      <div data-fit="shrink">无 key</div>
      <div data-fit="shrink" data-fit-key="ok" data-fit-base="12" data-fit-min="6">内容</div>`
    stubFitBox(document.querySelectorAll('[data-fit="shrink"]')[0] as HTMLElement, 5, 4)
    stubFitBox(document.querySelectorAll('[data-fit="shrink"]')[1] as HTMLElement, 1, 40)
    const fits = applyTextFit(document)
    expect(fits).toEqual([{ key: 'ok', fontSizePt: 12 }])
  })
})
