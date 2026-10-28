// @vitest-environment happy-dom
// 元素级码类绘制：二维码图形必须与出纸同源，且铺满元素盒
import { describe, it, expect, beforeAll } from 'vitest'
import JsBarcode from 'jsbarcode'
import { browserCodeRenderer } from '@worm-vue3-print/core/browser'
import type { RuntimeElement, TableRow } from '@worm-vue3-print/core/designer'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { hydrateCodes, renderBarcode, renderQrcode } from '../code'
import { renderPropertyPanel } from '../property-panel'
import { tableCellGroup } from '../table-props'

beforeAll(() => {
  // happy-dom 不实现 canvas 2d 上下文；jsbarcode 文本测量需要 getContext('2d')
  const proto = HTMLCanvasElement.prototype as any
  proto.getContext = function () {
    return { font: '', measureText: (t: string) => ({ width: String(t).length * 8 }) }
  }
})

const SVG_SRC_PREFIX = 'data:image/svg+xml;charset=utf-8,'

function makeElement(options: Partial<RuntimeElement['options']> = {}): RuntimeElement {
  return {
    id: 'el-qrcode',
    options: { left: 0, top: 0, width: 60, height: 60, testData: 'qrcode', ...options },
    printElementType: { type: 'qrcode', title: '二维码' },
  }
}

/** 走真实渲染路径：renderQrcode 出壳 → hydrateCodes 补图（异步，等一轮定时器） */
async function paintQrcode(options: Partial<RuntimeElement['options']> = {}) {
  const el = makeElement(options)
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderQrcode(el), host)
  hydrateCodes(host as unknown as ShadowRoot, [el])
  await new Promise(r => setTimeout(r, 300))
  return host
}

function qrcodeImg(host: HTMLElement): HTMLImageElement {
  const img = host.querySelector('img')
  if (!img) throw new Error('二维码未出图')
  return img as HTMLImageElement
}

/** 只渲染单元格分组：其余 ctx 字段按面板要求补齐（二维码 / 条形码共用，静区字段两边都有） */
function paintCellProps(cellPatch: Record<string, any>, cellType: 'qrcode' | 'barcode' = 'qrcode') {
  const store = new DesignerStore()
  const rows: TableRow[] = [{
    id: 'r1', type: 'data', height: 8,
    cells: [{
      id: 'c1', formatter: cellType === 'qrcode' ? 'QR' : '12345678', cellType, ...cellPatch,
    } as never],
  }]
  store.addElement('table', {
    left: 10, top: 10, width: 100, height: 8, tableColWidths: [100], tableRows: rows,
  } as never)
  const el = store.elements[0]!
  store.selectOne(el.id)
  store.setTableSelection({ elementId: el.id, r1: 0, c1: 0, r2: 0, c2: 0 } as never)
  const ctx: ShellCtx = {
    store,
    format: new FormatToolbar(store),
    state: {
      leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
      openDd: null, collapsedGroups: new Set<string>(), renamingPage: null,
    } as unknown as ShellState,
    repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
  } as unknown as ShellCtx
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(tableCellGroup(ctx, el), host)
  const cell = () => (store.elements[0]!.options.tableRows as TableRow[])[0]!.cells[0]!
  return { host, cell }
}

/** 静区字段按标签定位（二维码与条形码各只有一个，同屏不冲突） */
function quietField(host: HTMLElement): HTMLElement | undefined {
  return Array.from(host.querySelectorAll<HTMLElement>('.pd-field'))
    .find(f => f.querySelector('.pd-label')?.textContent === '静区 (模块)')
}

const quietInput = (host: HTMLElement) =>
  quietField(host)?.querySelector('input[type="number"]') as HTMLInputElement | undefined

/** 元素属性台：条形码 / 二维码元素走真实的 renderPropertyPanel 路径（可注入条码选项） */
function paintElementPanel(type: 'barcode' | 'qrcode', options: Record<string, any> = {}) {
  const store = new DesignerStore()
  store.addElement(type, { left: 10, top: 10, width: 60, height: 20, ...options } as never)
  const element = store.elements[0]!
  store.selectOne(element.id)
  const ctx: ShellCtx = {
    store,
    format: new FormatToolbar(store),
    state: {
      leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
      openDd: null, collapsedGroups: new Set<string>(), renamingPage: null,
    } as unknown as ShellState,
    repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
  } as unknown as ShellCtx
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderPropertyPanel(ctx), host)
  return { host, element }
}

describe('common 元素级二维码', () => {
  it('img 显式给出 width/height:100%（只给 max-* 时停在内在像素尺寸，盒大于它就不铺满）', async () => {
    const img = qrcodeImg(await paintQrcode())
    expect(img.style.width).toBe('100%')
    expect(img.style.height).toBe('100%')
  })
  it('qrQuietZone 透传到图形：未设置即缺省 0（码面铺满），2 / 4 各自留白', async () => {
    // 码值 'qrcode' 在 M 级下为 21 模块，每模块 4 用户单位 → 码面 84
    const face = 21 * 4
    const viewBoxSize = async (options: Partial<RuntimeElement['options']>) => {
      const src = qrcodeImg(await paintQrcode(options)).getAttribute('src') ?? ''
      const m = /viewBox="0 0 (\d+) \1"/.exec(decodeURIComponent(src.slice(src.indexOf(',') + 1)))
      if (!m) throw new Error('SVG 未按预期输出')
      return Number(m[1])
    }
    expect(await viewBoxSize({})).toBe(face)
    expect(await viewBoxSize({ qrQuietZone: 2 })).toBe(face + 2 * 2 * 4)
    expect(await viewBoxSize({ qrQuietZone: 4 })).toBe(face + 2 * 4 * 4)
  })

  it('设计态图形与出纸同源：src 解码后逐字等于 browserCodeRenderer 的输出', async () => {
    const src = qrcodeImg(await paintQrcode({ testData: 'https://example.com/x', qrCodeLevel: 'Q' })).src
    const encoded = src.slice(src.indexOf(',') + 1)
    expect(src.startsWith(SVG_SRC_PREFIX), `实际 src 前缀：${src.slice(0, 40)}`).toBe(true)
    expect(decodeURIComponent(encoded)).toBe(
      browserCodeRenderer.render('https://example.com/x', 'qrcode', { qrCodeLevel: 'Q' }),
    )
  })
})

describe('common 单元格二维码静区（属性台）', () => {
  it('说明挂在标签后的帮助图标上（悬浮/点击显示），不常驻文字提示', () => {
    const field = quietField(paintCellProps({}).host)!
    expect(field, '应存在静区字段').toBeTruthy()
    const help = field.querySelector('.pd-help')
    expect(help, '静区标签后应有帮助图标').toBeTruthy()
    expect(help!.getAttribute('data-tip')).toContain('0 即不留白边')
    expect(field.querySelector('.pd-hint'), '说明不应常驻成一行文字').toBeNull()
  })

  it('从 4 改回 0 会真写进单元格（显式存 0，不被 orUndef 那类假值判断归并成未设置）', () => {
    const { host, cell } = paintCellProps({ qrQuietZone: 4 })
    const input = quietInput(host)
    expect(input, '单元格属性台应出「静区 (模块)」').toBeTruthy()
    expect(input!.value).toBe('4')
    input!.value = '0'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(cell().qrQuietZone).toBe(0)
  })

  it('未设置时留空靠占位提示（与画布同形态：canvas 绑的是原始值），已设置按存值显示', () => {
    const empty = quietInput(paintCellProps({}).host)!
    expect(empty.value).toBe('')
    expect(empty.placeholder).toBe('默认 0')
    expect(quietInput(paintCellProps({ qrQuietZone: 4 }).host)!.value).toBe('4')
  })
})

describe('common 二维码元素静区（元素属性台）', () => {
  it('元素面板的静区字段同样把说明挂到帮助图标上，且无常驻文字提示', () => {
    const store = new DesignerStore()
    store.addElement('qrcode', { left: 10, top: 10, width: 40, height: 40 } as never)
    store.selectOne(store.elements[0]!.id)
    const ctx: ShellCtx = {
      store,
      format: new FormatToolbar(store),
      state: {
        leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
        openDd: null, collapsedGroups: new Set<string>(), renamingPage: null,
      } as unknown as ShellState,
      repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
    } as unknown as ShellCtx
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(renderPropertyPanel(ctx), host)

    const field = Array.from(host.querySelectorAll<HTMLElement>('.pd-field'))
      .find(f => f.querySelector('.pd-label')?.textContent === '静区 (模块)')
    expect(field, '元素属性台应出「静区 (模块)」').toBeTruthy()
    const help = field!.querySelector('.pd-help')
    expect(help, '静区标签后应有帮助图标').toBeTruthy()
    expect(help!.getAttribute('data-tip')).toContain('数值越大白边越宽')
    expect(field!.querySelector('.pd-hint'), '说明不应常驻成一行文字').toBeNull()
  })
})

describe('common 条形码元素静区（元素属性台）', () => {
  function paintBarcodeProps(options: Partial<RuntimeElement['options']> = {}) {
    const store = new DesignerStore()
    store.addElement('barcode', { left: 10, top: 10, width: 60, height: 20, testData: '12345678', ...options } as never)
    store.selectOne(store.elements[0]!.id)
    const ctx: ShellCtx = {
      store, format: new FormatToolbar(store),
      state: {
        leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
        openDd: null, collapsedGroups: new Set<string>(), renamingPage: null,
      } as unknown as ShellState,
      repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
    } as unknown as ShellCtx
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(renderPropertyPanel(ctx), host)
    const row = Array.from(host.querySelectorAll<HTMLElement>('.pd-field'))
      .find(f => f.querySelector('.pd-label')?.textContent?.includes('静区'))!
    return { row, input: row.querySelector('input.pd-step-input') as HTMLInputElement, el: store.elements[0]! }
  }

  it('未设置时留空靠占位提示；把缺省的 10 原样敲进去会写键（canvas CodeGroup 绑的是原始值，同一条 change 判据）', () => {
    const { row, input, el } = paintBarcodeProps()
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('默认 10')
    expect(row.querySelector('.pd-help'), '说明应挂帮助图标').toBeTruthy()
    input.value = '10'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(el.options.barQuietZone).toBe(10)
  })

  it('已设置按存值显示，改回 0 是合法档不被归并成未设置', () => {
    const { input, el } = paintBarcodeProps({ barQuietZone: 6 })
    expect(input.value).toBe('6')
    input.value = '0'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(el.options.barQuietZone).toBe(0)
  })
})

function makeBarcode(options: Partial<RuntimeElement['options']> = {}): RuntimeElement {
  return {
    id: 'el-barcode',
    options: { left: 0, top: 0, width: 60, height: 20, testData: '12345678', ...options },
    printElementType: { type: 'barcode', title: '条形码' },
  }
}

/** 走真实渲染路径：renderBarcode 出壳 → hydrateCodes 用 jsbarcode 补图 */
async function paintBarcode(options: Partial<RuntimeElement['options']> = {}) {
  const el = makeBarcode(options)
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderBarcode(el), host)
  hydrateCodes(host as unknown as ShadowRoot, [el])
  await new Promise(r => setTimeout(r, 300))
  const svg = host.querySelector('svg')
  if (!svg) throw new Error('条形码未出图')
  const viewBox = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/)
  const mm = (value: string) => Number(value.replace(/mm$/, '') || 'NaN')
  return {
    /** viewBox 宽度（用户单位）= 模块数 × (barWidth/2) */
    userUnits: Number(viewBox[2]),
    /** viewBox 高度（用户单位）=（条区 + 文本区 + 下间距）模块 × (barWidth/2) */
    heightUnits: Number(viewBox[3]),
    widthMm: mm(String(svg.style.width)),
    heightMm: mm(String(svg.style.height)),
  }
}

/** 条形码：静区（barQuietZone）与条宽上限 8 必须与出图端、canvas 同源 */
describe('common 条形码静区（元素绘制 + 两端属性台）', () => {

  it('缺省左右各 10 模块（79 模块码值 → 99），barQuietZone 0 即不留白边', async () => {
    expect((await paintBarcode()).userUnits).toBe(99)
    expect((await paintBarcode({ barQuietZone: 10 })).userUnits).toBe(99)
    expect((await paintBarcode({ barQuietZone: 4 })).userUnits).toBe(87)
    expect((await paintBarcode({ barQuietZone: 0 })).userUnits).toBe(79)
  })

  it('条宽倍率上限抬到 8：每模块 4 用户单位，静区照旧 → 396 用户单位、99mm', async () => {
    const thick = await paintBarcode({ barWidth: 8, width: 200, height: 60 })
    expect(thick.userUnits).toBe(396)
    expect(thick.widthMm).toBeCloseTo(99, 6)
  })

  it('单元格属性台出「静区 (模块)」：占位「默认 10」、上限 20、说明取条码那一条', () => {
    const host = paintCellProps({}, 'barcode').host
    const input = quietInput(host)
    expect(input, '条形码单元格应出静区字段').toBeTruthy()
    expect(input!.placeholder).toBe('默认 10')
    expect(input!.getAttribute('max')).toBe('20')
    expect(quietField(host)!.querySelector('.pd-help')!.getAttribute('data-tip')).toContain('一维码码制要求的下限')
  })

  it('单元格从 10 改到 0 会真写进单元格（0 是合法档，不能被 orUndef 那类假值判断归并成未设置）', () => {
    const { host, cell } = paintCellProps({ barQuietZone: 10 }, 'barcode')
    const input = quietInput(host)!
    expect(input.value).toBe('10')
    input.value = '0'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(cell().barQuietZone).toBe(0)
    expect(cell().qrQuietZone, '条形码不该写二维码那一份').toBeUndefined()
  })

  it('元素属性台出条形码自己的静区字段（挂帮助图标，不常驻文字提示）', () => {
    const store = new DesignerStore()
    store.addElement('barcode', { left: 10, top: 10, width: 60, height: 20 } as never)
    store.selectOne(store.elements[0]!.id)
    const ctx: ShellCtx = {
      store,
      format: new FormatToolbar(store),
      state: {
        leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
        openDd: null, collapsedGroups: new Set<string>(), renamingPage: null,
      } as unknown as ShellState,
      repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
    } as unknown as ShellCtx
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(renderPropertyPanel(ctx), host)

    const input = quietInput(host)
    expect(input, '元素属性台应出「静区 (模块)」').toBeTruthy()
    expect(input!.placeholder).toBe('默认 10')
    expect(quietField(host)!.querySelector('.pd-help')).toBeTruthy()
    input!.value = '0'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(store.elements[0]!.options.barQuietZone).toBe(0)
  })
})

/** 条高（barHeight，mm）：条宽优先、框高不足时由条高让位，与 core/canvas 同一份结算 */
describe('common 条形码条高（元素绘制 + 两端属性台）', () => {
  const heightField = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('.pd-field'))
      .find(f => f.querySelector('.pd-label')?.textContent?.startsWith('条高'))
  const heightInput = (host: HTMLElement) =>
    heightField(host)?.querySelector('input[type="number"]') as HTMLInputElement | undefined

  it('框高足够时按期望兑现：条区折算成 80 模块重出图，条宽一分不损', async () => {
    const thin = await paintBarcode({})
    const tall = await paintBarcode({ barHeight: 20, height: 60 })
    // 80 条区 + 12 文本区 + 2 下间距 = 94 模块（barWidth 缺省 2 → 每模块 1 用户单位）
    expect(tall.heightUnits).toBe(94)
    expect(tall.userUnits, '条宽侧不该被条高挤窄').toBe(thin.userUnits)
    expect(tall.widthMm).toBeCloseTo(thin.widthMm, 6)
    expect(tall.heightMm).toBeCloseTo(94 * 0.25, 6)
  })

  it('元素框高 20mm 装不下期望 20mm 条高：条高让位，整图收到 80 模块 = 20mm，条宽照旧', async () => {
    const thin = await paintBarcode({})
    const squeezed = await paintBarcode({ barHeight: 20 })
    // 框高 20mm、文字区 14 模块 × 0.25mm = 3.5mm → 条区上限 floor((20 − 3.5) ÷ 0.25) = 66
    expect(squeezed.heightUnits).toBe(80)
    expect(squeezed.heightMm).toBeCloseTo(20, 6)
    expect(squeezed.userUnits, '让位的该是条高而不是条宽').toBe(thin.userUnits)
    expect(squeezed.widthMm).toBeCloseTo(thin.widthMm, 6)
  })

  it('未填 / 填 0 / 填非法值都逐毫米回退缺省档', async () => {
    const base = await paintBarcode({})
    for (const barHeight of [undefined, 0, -5, Number.NaN]) {
      expect(await paintBarcode({ barHeight }), `barHeight=${barHeight} 应等于缺省档`).toEqual(base)
    }
  })

  it('元素属性台出「条高 (mm)」：占位指向缺省档、说明取注册表那一条，填 20 真写进元素', () => {
    const { host, element } = paintElementPanel('barcode')
    const input = heightInput(host)
    expect(input, '条形码元素应出条高字段').toBeTruthy()
    expect(input!.placeholder).toContain('默认')
    expect(heightField(host)!.querySelector('.pd-help')!.getAttribute('data-tip')).toContain('条宽')
    input!.value = '20'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(element.options.barHeight).toBe(20)
  })

  it('二维码元素不出条高字段（条区只有一维码才有）', () => {
    expect(heightInput(paintElementPanel('qrcode').host)).toBeUndefined()
  })

  it('单元格属性台出「条高 (mm)」，填 20 真写进单元格', () => {
    const { host, cell } = paintCellProps({}, 'barcode')
    const input = heightInput(host)
    expect(input, '条形码单元格应出条高字段').toBeTruthy()
    input!.value = '20'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    input!.dispatchEvent(new Event('change', { bubbles: true }))
    expect(cell().barHeight).toBe(20)
  })
})

/** 条宽推荐：选了打印机分辨率后在条宽下方给推荐档，只提示、不替用户写值 */
describe('common 条宽推荐提示（两端属性台）', () => {
  it('元素台：203dpi 时出推荐倍率 3 并点明当前档低于下限，barWidth 不被写值', () => {
    const { host, element } = paintElementPanel('barcode', { printerDpi: 203 })
    expect(host.textContent).toContain('推荐条宽倍率 3')
    expect(host.textContent).toContain('低于下限')
    expect(host.textContent).toContain('不会替你改值')
    expect(element.options.barWidth).toBeUndefined()
  })

  it('单元格台：同样给推荐且不写值；未选分辨率时不给推荐', () => {
    const { host, cell } = paintCellProps({ printerDpi: 203 }, 'barcode')
    expect(host.textContent).toContain('推荐条宽倍率 3')
    expect(host.textContent).toContain('不会替你改值')
    expect(cell().barWidth).toBeUndefined()
    expect(paintCellProps({}, 'barcode').host.textContent).not.toContain('推荐条宽倍率')
  })
})

// 元素工厂给码类元素预置了 testData 占位码值，而属性台「内容」写的是 formatter：
// 设计态取值一旦把 testData 摆在前面，作者内容就被永久遮住（改内容画布不动）
describe('common 设计态码值实时刷新（元素级）', () => {
  /** 解码 img 里的同源 SVG，用于逐字比对码值 */
  function svgOf(host: HTMLElement): string {
    const src = qrcodeImg(host).getAttribute('src') ?? ''
    return decodeURIComponent(src.slice(src.indexOf(',') + 1))
  }

  it('testData 与 formatter 并存时按 formatter 出图', async () => {
    expect(svgOf(await paintQrcode({ formatter: 'HELLO' })))
      .toBe(browserCodeRenderer.render('HELLO', 'qrcode', {}))
  })

  it('{字段} 表达式按 demo 数据求值出图', async () => {
    expect(svgOf(await paintQrcode({ formatter: '{order.no}' })))
      .toBe(browserCodeRenderer.render('PO20260801001', 'qrcode', {}))
  })

  it('表达式取不到值才回退 testData（示例码值语义保留）', async () => {
    expect(svgOf(await paintQrcode({ formatter: '{不存在字段}' })))
      .toBe(browserCodeRenderer.render('qrcode', 'qrcode', {}))
  })

  /** 独立测一趟 CODE128 的模块数（不带静区），避免把期望写成脑算值 */
  function modulesOf(value: string): number {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, value, { format: 'CODE128', width: 1, height: 10, margin: 0, displayValue: false })
    return Number(String(svg.getAttribute('viewBox')).split(/[\s,]+/)[2])
  }

  it('条形码同口径：formatter 覆盖 testData 占位码值', async () => {
    // 参照系自证：占位码值 '12345678' + 左右各 10 模块静区 = 既有基线 99
    expect(modulesOf('12345678') + 20).toBe(99)
    expect((await paintBarcode({ formatter: 'HELLO' })).userUnits).toBe(modulesOf('HELLO') + 20)
    expect((await paintBarcode({ formatter: '{不存在字段}' })).userUnits, '取不到值应回退 testData')
      .toBe(99)
  })
})

