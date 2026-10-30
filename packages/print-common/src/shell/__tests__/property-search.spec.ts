// @vitest-environment happy-dom
// 属性台搜索验收：对照 canvas 的 PropertySearch.vue + PropertyPanel.vue
// （filteredGroups / matchedKeys / searching 三件套门控）。
import { describe, it, expect } from 'vitest'
import type { ElementType } from '@worm-vue3-print/core/designer'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { renderPropertyPanel } from '../property-panel'
import { propertySearch, searchGroupOf } from '../property-search'

function makeState(): ShellState {
  return {
    leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
}

/** 渲染属性台并返回宿主节点（每次调用都是一次「整体重绘」的等价物） */
function paint(type: ElementType = 'text', propSearch = '', options: Record<string, any> = {}): { host: HTMLElement; ctx: ShellCtx } {
  const store = new DesignerStore()
  store.addElement(type, { left: 10, top: 10, width: 40, height: 10, ...options })
  store.selectOne(store.elements[0]!.id)
  const ctx: ShellCtx = {
    store, format: new FormatToolbar(store), state: { ...makeState(), propSearch },
    repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false,
    host: { fonts: [] },
  }
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderPropertyPanel(ctx), host)
  return { host, ctx }
}

const visible = (el: HTMLElement) => el.style.display !== 'none'

const visibleGroups = (host: ParentNode) => Array.from(host.querySelectorAll<HTMLElement>('.property-group'))
  .filter(visible).map(g => g.querySelector('.group-title')?.textContent ?? '')

const visibleItemKeys = (host: ParentNode) => Array.from(host.querySelectorAll<HTMLElement>('[data-prop-key]'))
  .filter(visible).map(el => el.dataset.propKey ?? '')

describe('property-search 纯逻辑（core searchProperties 的门控口径）', () => {
  it('空关键字 = 未搜索：分组与字段恒显示', () => {
    const res = propertySearch('')
    expect(res.searching).toBe(false)
    expect(res.groups.length).toBeGreaterThan(0)
  })

  it('关键字命中集合与 canvas 注册表同源', () => {
    const res = propertySearch('字体')
    expect(res.searching).toBe(true)
    expect(res.groups).toEqual(['appearance'])
    expect([...res.keys].sort()).toEqual(['ap-font-family', 'ap-font-size', 'ap-font-weight'])
  })

  it('Common 分组 key → 注册表分组 key 的映射：表格设置挂在 content 下', () => {
    expect(searchGroupOf('table-settings')).toBe('content')
    expect(searchGroupOf('appearance')).toBe('appearance')
    // 行属性 / 单元格不在注册表内（canvas 也不门控这两个分组）
    expect(searchGroupOf('table-row')).toBe('')
    expect(searchGroupOf('table-cell')).toBe('')
  })
})

describe('property-search 搜索框（对照 PropertySearch.vue）', () => {
  it('类名、type、占位与 aria 标签逐字一致', () => {
    const { host } = paint()
    const input = host.querySelector<HTMLInputElement>('.property-search input.pd-input')!
    expect(input).toBeTruthy()
    expect(input.type).toBe('search')
    expect(input.placeholder).toBe('搜索属性...')
    expect(input.getAttribute('aria-label')).toBe('搜索属性')
  })

  it('搜索框在「元素属性」页签内、.property-content 之前', () => {
    const { host } = paint()
    const pane = host.querySelector('.pd-tab-pane')!
    expect(pane.firstElementChild?.className).toBe('property-search')
    expect(pane.querySelector('.property-content')).toBeTruthy()
  })

  it('未选中元素时不出现搜索框（canvas 的 v-if="element"；本包无选中即回「页面属性」页签）', () => {
    const store = new DesignerStore()
    const ctx: ShellCtx = {
      store, format: new FormatToolbar(store), state: makeState(),
      repaint: () => {}, fire: () => {}, showHelp: true, isEdit: false, host: {},
    }
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(renderPropertyPanel(ctx), host)
    expect(host.querySelector('.property-search')).toBe(null)
    expect(host.querySelector('.property-content')).toBe(null)
    expect(host.querySelector('form.pd-form .pd-divider')?.textContent).toBe('纸张设置')
  })
})

describe('property-search 门控（对照 filteredGroups / matchedKeys / searching）', () => {
  it('未搜索：所有分组可见（标题与 canvas 的 PropertyGroup title 逐字一致）', () => {
    const { host } = paint()
    expect(visibleGroups(host)).toEqual(
      ['内容', '位置与尺寸', '外观', '边框与背景', '分页配置', '高级设置'],
    )
  })

  it('「字体」：只留外观分组，且只剩命中的三个字段', () => {
    const { host } = paint('text', '字体')
    expect(visibleGroups(host)).toEqual(['外观'])
    expect(visibleItemKeys(host)).toEqual(['ap-font-family', 'ap-font-size', 'ap-font-weight'])
    // canvas 的 v-show 语义：节点仍在 DOM 里，只是隐藏
    expect(host.querySelectorAll('[data-prop-key]').length).toBeGreaterThan(visibleItemKeys(host).length)
  })

  it('「边框」：命中边框与背景分组及其四个字段（线型同组，注册表口径两侧一致）', () => {
    const { host } = paint('text', '边框')
    expect(visibleGroups(host)).toEqual(['边框与背景'])
    expect(visibleItemKeys(host)).toEqual(['bb-border-style', 'bb-border-width', 'bb-border-color', 'bb-bg-color'])
  })

  it('「位置」：命中位置与尺寸分组的四个字段', () => {
    const { host } = paint('text', '位置')
    expect(visibleGroups(host)).toEqual(['位置与尺寸'])
    expect(visibleItemKeys(host)).toEqual(['ps-left', 'ps-top', 'ps-width', 'ps-height'])
  })

  it('外观分组的字段全部纳入注册表门控（无游离字段）', () => {
    const { host } = paint('text', '字体')
    const labels = Array.from(host.querySelectorAll<HTMLElement>('.pd-field'))
      .filter(el => visible(el) && !el.hasAttribute('data-prop-key'))
      .map(el => el.querySelector('.pd-label')?.textContent ?? '')
    expect(labels).not.toContain('字体')
    expect(labels).not.toContain('字体大小')
    expect(labels).not.toContain('字体粗细')
  })

  it('输入时不整体重绘：input 事件就地切换显隐并写回状态', () => {
    const { host, ctx } = paint()
    const input = host.querySelector<HTMLInputElement>('.property-search input')!
    input.value = '字体'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(ctx.state.propSearch).toBe('字体')
    expect(visibleGroups(host)).toEqual(['外观'])
    expect(visibleItemKeys(host)).toEqual(['ap-font-family', 'ap-font-size', 'ap-font-weight'])
    // 输入框的值不被重绘覆盖（光标与输入法组合得以保留）
    expect(input.value).toBe('字体')
  })

  it('重绘后与就地更新的结论一致', () => {
    const live = paint()
    const input = live.host.querySelector<HTMLInputElement>('.property-search input')!
    input.value = '分页'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const rebuilt = paint('text', '分页')
    expect(visibleGroups(rebuilt.host)).toEqual(visibleGroups(live.host))
    expect(visibleItemKeys(rebuilt.host)).toEqual(visibleItemKeys(live.host))
  })

  it('h 描述的节点在 DOM 上带 data-prop-group 标记，供定点更新使用', () => {
    const { host } = paint()
    const groups = Array.from(host.querySelectorAll<HTMLElement>('.property-group')).map(g => g.dataset.propGroup)
    expect(groups).toEqual(['binding', 'position-size', 'appearance', 'border-bg', 'pagination', 'advanced'])
  })
})

describe('issue #4 新增字段：首行缩进与图片缩放/锚点', () => {
  it('长文本出「首行缩进 (字符)」，普通文本不出（该字段仅 longText 消费）', () => {
    expect(visibleItemKeys(paint('longText').host)).toContain('ap-long-text-indent')
    expect(visibleItemKeys(paint('text').host)).not.toContain('ap-long-text-indent')
  })

  it('缩放模式常出且 cover 叫剪裁；锚点行只在剪裁档出——嵌套数组曾让 paint 抛 TypeError，必须能平铺渲染', () => {
    const plain = visibleItemKeys(paint('image').host)
    expect(plain).toContain('ap-img-fit')
    expect(plain).not.toContain('ap-img-object-position')

    const filled = visibleItemKeys(paint('image', '', { fit: 'fill' }).host)
    expect(filled).not.toContain('ap-img-object-position')

    const { host } = paint('image', '', { fit: 'cover' })
    const keys = visibleItemKeys(host)
    expect(keys).toContain('ap-img-object-position')
    const labels = [...host.querySelectorAll<HTMLElement>('.pd-field')].filter(visible)
      .map(el => el.querySelector('.pd-label')?.textContent ?? '')
    expect(labels.some(l => l.includes('缩放模式'))).toBe(true)
    expect(labels.some(l => l.includes('裁剪锚点'))).toBe(true)
    expect(host.textContent).toContain('剪裁（等比铺满后裁边）')
    expect(host.textContent).not.toContain('覆盖（保持比例）')
    const tips = [...host.querySelectorAll<HTMLElement>('.pd-help[data-tip]')].map(el => el.dataset.tip ?? '')
    expect(tips.some(t => t.includes('缩放方式'))).toBe(true)
    // 说明只讲操作口径，不把 CSS 属性名推给用户
    expect(tips.every(t => !t.includes('object-position'))).toBe(true)
  })

  it('搜「裁剪锚点」只点亮外观组；搜「位置」仍只命中位置与尺寸组（关键字不得越组撞车）', () => {
    expect(visibleGroups(paint('image', '裁剪锚点').host)).toEqual(['外观'])
    const pos = paint('text', '位置')
    expect(visibleGroups(pos.host)).toEqual(['位置与尺寸'])
    expect(visibleItemKeys(pos.host)).toEqual(['ps-left', 'ps-top', 'ps-width', 'ps-height'])
  })
})
