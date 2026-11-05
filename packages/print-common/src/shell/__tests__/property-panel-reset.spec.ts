// @vitest-environment happy-dom
// common 元素台外观组「恢复默认值」验收：证明图标真的渲染出来、落点随元素类型派生、
// 且提示语按注册表常量带数字。
import { describe, it, expect } from 'vitest'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { renderPropertyPanel } from '../property-panel'
import type { ElementType } from '@worm-vue3-print/core/designer'

function paint(type: ElementType, options: Record<string, any> = {}) {
  const store = new DesignerStore()
  store.addElement(type, options)
  const el = store.elements[0]!
  store.selectOne(el.id)
  const state: ShellState = {
    leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
  const ctx: ShellCtx = {
    store, format: new FormatToolbar(store), state,
    repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
  }
  const host = document.createElement('div')
  render(renderPropertyPanel(ctx), host)
  return { store, el, host }
}

function rowOf(host: HTMLElement, text: string) {
  const row = [...host.querySelectorAll<HTMLElement>('.pd-field')]
    .find(f => (f.querySelector('.pd-label')?.textContent ?? '').includes(text))
  if (!row) throw new Error(`未找到属性行：${text}`)
  return row
}

const btnOf = (host: HTMLElement, text: string) => rowOf(host, text).querySelector<HTMLButtonElement>('.pd-reset-btn')!

describe('common 外边距输入与恢复默认值', () => {
  it('上外边距恢复缺省，左外边距允许负数', () => {
    const { el, host } = paint('text', { marginTop: 4, marginLeft: 1 })
    expect(btnOf(host, '上').dataset.tip).toBe('恢复默认值（0 mm）')
    btnOf(host, '上').click()
    expect(el.options.marginTop).toBeUndefined()
    const input = rowOf(host, '左').querySelector<HTMLInputElement>('input')!
    expect(input.min).toBe('')
    input.value = '-3'
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(el.options.marginLeft).toBe(-3)
  })
})

describe('common 外观组「恢复默认值」', () => {
  it('外观组各行都渲染出图标，且图标不带文字', () => {
    const { host } = paint('text', { fontSize: 18 })
    for (const t of ['字体', '字体大小', '字体粗细', '对齐', '垂直对齐', '颜色', '背景色', '行高', '字间距', '文字溢出', '自动换行']) {
      const b = btnOf(host, t)
      expect(b, `缺图标：${t}`).toBeTruthy()
      expect(b.textContent).toBe('')
    }
  })

  it('字体大小出厂即被写上 12 ⇒ 新建元素为灰态；改成 18 才亮', () => {
    expect(btnOf(paint('text').host, '字体大小').classList.contains('is-dirty')).toBe(false)
    expect(btnOf(paint('text', { fontSize: 18 }).host, '字体大小').classList.contains('is-dirty')).toBe(true)
  })

  it('点击写回出厂字面值 12，而不是删键', () => {
    const { el, host } = paint('text', { fontSize: 18 })
    btnOf(host, '字体大小').click()
    expect(el.options.fontSize).toBe(12)
  })

  /** 同一键在不同元素类型上落点不同——这是派生规则相对"逐键标注模式"的核心优势 */
  it('行高：text 出厂未设 ⇒ 点击删键；longText 出厂 18 ⇒ 点击写回 18', () => {
    const t = paint('text', { lineHeight: 2 })
    btnOf(t.host, '行高').click()
    expect(t.el.options.lineHeight).toBeUndefined()

    const l = paint('longText', { lineHeight: 30 })
    expect(btnOf(l.host, '行高').classList.contains('is-dirty')).toBe(true)
    btnOf(l.host, '行高').click()
    expect(l.el.options.lineHeight).toBe(18)
  })

  it('最小字号提示取自注册表常量「恢复默认值（6 pt）」，字体大小无具名常量则不带数字', () => {
    const { host } = paint('text', { textFit: 'shrink', shrinkMinFontSize: 9 })
    expect(btnOf(host, '最小字号').dataset.tip).toBe('恢复默认值（6 pt）')
    expect(btnOf(host, '字体大小').dataset.tip).toBe('恢复默认值')
  })

  it('全部标签 textContent 不含"默认"二字（图标不得写字，否则属性搜索失配）', () => {
    const { host } = paint('text', { fontSize: 18 })
    for (const l of host.querySelectorAll<HTMLElement>('.pd-label')) {
      expect(l.textContent).not.toContain('默认')
    }
  })
})

describe('common 条码组「恢复默认值」', () => {
  it('静区提示取自注册表常量；设值后亮态，点击写回未设', () => {
    const { el, host } = paint('barcode', { barQuietZone: 4 })
    const b = btnOf(host, '静区')
    expect(b.dataset.tip).toBe('恢复默认值（10 模块）')
    expect(b.classList.contains('is-dirty')).toBe(true)
    b.click()
    expect(el.options.barQuietZone).toBeUndefined()
  })

  /** 显示陷阱：控件绑 o.barWidth ?? 2，出厂其实是未设——设成 2 也必须判为已偏离 */
  it('条宽设成 2（等于渲染端回落值）仍判已偏离，点击删键', () => {
    const { el, host } = paint('barcode', { barWidth: 2 })
    const b = btnOf(host, '条宽')
    expect(b.classList.contains('is-dirty')).toBe(true)
    expect(b.dataset.tip).toBe('恢复默认值')
    b.click()
    expect(el.options.barWidth).toBeUndefined()
  })

  it('码制不挂图标（决定「这是什么码」，不是样式默认值）', () => {
    const { host } = paint('barcode', { barcodeType: 'EAN13' })
    expect(rowOf(host, '码制').querySelector('.pd-reset-btn')).toBeNull()
  })

  it('缩放模式仅二维码出行且挂图标；条码元素不出这一行', () => {
    const q = paint('qrcode', { fit: 'cover' })
    expect(btnOf(q.host, '缩放模式').classList.contains('is-dirty')).toBe(true)
    const b = paint('barcode')
    const has = [...b.host.querySelectorAll<HTMLElement>('.pd-field')]
      .some(f => (f.querySelector('.pd-label')?.textContent ?? '').includes('缩放模式'))
    expect(has).toBe(false)
  })
})

describe('边框与背景三行「恢复默认值」', () => {
  /** rect 的外观组是空态，三行标签不与其他组重名，可整组断言 */
  it('矩形：三行都挂图标（出厂 1pt/#333 ⇒ 删回字面值），背景色出厂未设 ⇒ 删键', () => {
    const { el, host } = paint('rect', { borderWidth: 3, borderColor: '#000000', backgroundColor: '#00ff00' })
    for (const t of ['边框宽度', '边框颜色', '背景色']) {
      const b = btnOf(host, t)
      expect(b.classList.contains('is-dirty'), `应为偏离态：${t}`).toBe(true)
      expect(b.getAttribute('data-tip'), `提示不对：${t}`).toBe('恢复默认值')
      b.click()
    }
    expect(el.options.borderWidth).toBe(1)
    expect(el.options.borderColor).toBe('#333')
    expect(el.options.backgroundColor).toBeUndefined()
  })

  it('文本元素：边框两行的出厂值未预置 ⇒ 点击删键', () => {
    const { el, host } = paint('text', { borderWidth: 2, borderColor: '#ff0000' })
    btnOf(host, '边框宽度').click()
    btnOf(host, '边框颜色').click()
    expect(el.options.borderWidth).toBeUndefined()
    expect(el.options.borderColor).toBeUndefined()
  })
})

describe('高级组「恢复默认值」', () => {
  it('锁定 / 每页重复 / 每页固定 / 层级 都挂图标；出厂未设 ⇒ 偏离态 + 点击删键', () => {
    const { el, host } = paint('text', { locked: true, repeatOnEveryPage: true, fixed: true, zIndex: 5 })
    for (const t of ['锁定', '每页重复', '每页固定', '层级']) {
      const b = btnOf(host, t)
      expect(b.classList.contains('is-dirty'), `应为偏离态：${t}`).toBe(true)
      expect(b.getAttribute('data-tip'), `提示不对：${t}`).toBe('恢复默认值')
      b.click()
    }
    expect(el.options.locked).toBeUndefined()
    expect(el.options.repeatOnEveryPage).toBeUndefined()
    expect(el.options.fixed).toBeUndefined()
    expect(el.options.zIndex).toBeUndefined()
  })

  it('等于出厂（未设）时全部灰态', () => {
    const { host } = paint('text')
    for (const t of ['锁定', '每页重复', '每页固定', '层级']) {
      expect(btnOf(host, t).classList.contains('is-dirty'), `不该点亮：${t}`).toBe(false)
    }
  })
})

describe('页面背景色一行（T1：文字按钮换成图标）', () => {
  function paintPage(pageBackground?: string) {
    const store = new DesignerStore()
    if (pageBackground) store.updateTemplateData({ pageBackground } as never)
    const state: ShellState = {
      leftTab: 'elements', leftCollapsed: false, propTab: 'page', propCollapsed: false,
      openDd: null, collapsedGroups: new Set(), renamingPage: null,
    }
    const ctx: ShellCtx = {
      store, format: new FormatToolbar(store), state,
      repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: { fonts: [] },
    }
    const host = document.createElement('div')
    render(renderPropertyPanel(ctx), host)
    return { store, host }
  }

  it('设过即点亮，点击把 pageBackground 删回 undefined；页面上不再有文字「默认」按钮', () => {
    const { store, host } = paintPage('#ffeedd')
    const b = btnOf(host, '页面背景色')
    expect(b.classList.contains('is-dirty')).toBe(true)
    expect(b.getAttribute('data-tip')).toBe('恢复默认值')
    b.click()
    expect((store.templateData as any).pageBackground).toBeUndefined()
    expect([...host.querySelectorAll('button')].some(x => x.textContent?.trim() === '默认')).toBe(false)
  })

  it('未设时是灰态', () => {
    const { host } = paintPage()
    expect(btnOf(host, '页面背景色').classList.contains('is-dirty')).toBe(false)
  })
})
