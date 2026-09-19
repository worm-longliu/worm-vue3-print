// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from 'vitest'
import { domExecutor, readMeasurements, readContentBottom, renderCodes } from '../dom-executor.js'
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

  it('缺少打印页或内容区时返回 0', () => {
    document.body.innerHTML = '<div></div>'
    expect(readContentBottom(document)).toBe(0)
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
  })
})
