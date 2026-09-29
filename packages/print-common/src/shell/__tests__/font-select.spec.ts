// @vitest-environment happy-dom
// 字体候选列表验收：对照 canvas 的 property/FontSelect.vue
// （类名 / aria / 行构成 / 键盘上下选择 + 回车确认 + Esc 关闭 / 展开态跨重绘保持）。
import { describe, it, expect } from 'vitest'
import { h, render } from '../../core/h'
import type { ShellState } from '../controls'
import { renderFontSelect } from '../font-select'

const FONTS = ['SimSun', 'SimHei', 'Microsoft YaHei', 'KaiTi']

function makeState(): ShellState {
  return {
    leftTab: 'elements', leftCollapsed: false, propTab: 'element', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
}

interface MountArgs {
  state: ShellState
  value?: string
  placeholder?: string
  disabled?: boolean
  fonts?: readonly (string | { family: string; label?: string })[]
}

/** 挂一次字体控件（等价于外壳的一帧重绘） */
function mount(args: MountArgs, id = 'prop-font') {
  const picked: (string | undefined)[] = []
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const node = render(h('div', { class: 'pd-field' }, [renderFontSelect({
    id,
    state: args.state,
    fonts: args.fonts ?? FONTS,
    value: args.value,
    placeholder: args.placeholder,
    disabled: args.disabled,
    onChange: v => picked.push(v),
  })]), host) as HTMLElement
  const input = node.querySelector<HTMLInputElement>('.font-select-input')!
  // canvas 的 `<ul v-if="open">`：收起态列表节点整体不存在，断言按「有无节点」而非 hidden
  const list = () => node.querySelector<HTMLElement>('.font-select-list')
  const rows = () => Array.from(list()?.querySelectorAll<HTMLElement>('.font-select-option') ?? [])
  return {
    host, input, list, rows, picked, state: args.state,
    labels: () => rows().map(li => li.textContent ?? ''),
    key: (k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })),
    focus: () => input.dispatchEvent(new FocusEvent('focus')),
    blur: () => input.dispatchEvent(new FocusEvent('blur')),
    type: (v: string) => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })) },
    clickRow: (i: number) => rows()[i]!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
  }
}

describe('font-select 结构与 aria（对照 FontSelect.vue）', () => {
  it('.font-select > input.pd-input.font-select-input + ul.font-select-list[role=listbox]', () => {
    const m = mount({ state: makeState() })
    expect(m.host.querySelector('.font-select')).toBeTruthy()
    expect(m.input.className).toBe('pd-input font-select-input')
    expect(m.input.getAttribute('role')).toBe('combobox')
    expect(m.input.getAttribute('aria-autocomplete')).toBe('list')
    expect(m.input.autocomplete).toBe('off')
    // 未展开：列表不出图（canvas 的 v-if="open"）
    expect(m.list()).toBe(null)
    expect(m.rows().length).toBe(0)
    expect(m.input.getAttribute('aria-expanded')).toBe('false')

    m.focus()
    expect(m.list()!.getAttribute('role')).toBe('listbox')
    expect(m.list()!.id).toBe('font-select-list-prop-font')
    expect(m.input.getAttribute('aria-controls')).toBe(m.list()!.id)
  })

  it('空值行文案 = placeholder；条目与宿主注入清单逐一对应', () => {
    const m = mount({ state: makeState(), placeholder: '继承默认' })
    m.focus()
    expect(m.labels()).toEqual(['继承默认', ...FONTS])
    expect(m.list()).toBeTruthy()
    expect(m.input.getAttribute('aria-expanded')).toBe('true')
    expect(m.rows().every(li => li.getAttribute('role') === 'option')).toBe(true)
  })

  it('当前值不在清单内时补一行「xxx（未知）」且置灰（canvas 的 unknown 行）', () => {
    const m = mount({ state: makeState(), value: 'Zapfino' })
    m.focus()
    expect(m.labels()).toEqual(['默认', 'Zapfino（未知）', ...FONTS])
    expect(m.rows()[1]!.classList.contains('is-muted')).toBe(true)
    expect(m.input.value).toBe('Zapfino')
  })

  it('宿主声明了展示名（label）：候选显示「名称（族名）」，提交值仍是族名', () => {
    const m = mount({
      state: makeState(),
      fonts: [{ family: 'Microsoft YaHei', label: '微软雅黑' }, { family: 'SimHei' }],
    })
    m.focus()
    expect(m.labels()).toEqual(['默认', '微软雅黑（Microsoft YaHei）', 'SimHei'])
    m.clickRow(1)
    expect(m.picked).toEqual(['Microsoft YaHei'])
    expect(m.input.value).toBe('微软雅黑')
  })
})

describe('font-select 键盘与选择口径', () => {
  it('展开时高亮落在当前值所在行（避免误按 Enter 改掉字体）', () => {
    const m = mount({ state: makeState(), value: 'SimHei' })
    m.focus()
    expect(m.rows()[2]!.classList.contains('is-active')).toBe(true)
    expect(m.input.getAttribute('aria-activedescendant')).toBe('font-select-list-prop-font-2')
  })

  it('向下键 + 回车：提交高亮行的族名', () => {
    const m = mount({ state: makeState() })
    m.focus()            // 高亮 = 空值行(0)
    m.key('ArrowDown')   // → SimSun(1)
    m.key('ArrowDown')   // → SimHei(2)
    m.key('Enter')
    expect(m.picked).toEqual(['SimHei'])
    expect(m.list()).toBe(null)
    expect(m.input.value).toBe('SimHei')
  })

  it('点空值行 = 清空字体（提交 undefined）', () => {
    const m = mount({ state: makeState(), value: 'SimSun' })
    m.focus()
    expect(m.rows()[0]!.textContent).toBe('默认')
    m.clickRow(0)
    expect(m.picked).toEqual([undefined])
    expect(m.input.value).toBe('')
  })

  it('输入过滤：命中项按模糊档位排序；一条都没命中时给「使用「xxx」」', () => {
    const m = mount({ state: makeState() })
    m.type('hei')
    expect(m.labels()).toEqual(['SimHei', 'Microsoft YaHei'])
    m.type('Zap')
    expect(m.labels()).toEqual(['使用「Zap」'])
    expect(m.rows()[0]!.classList.contains('is-muted')).toBe(true)
    m.key('Enter')
    expect(m.picked).toEqual(['Zap'])
  })

  it('Esc 关闭且不提交，输入框回到当前生效值（canvas 的 onCancel）', () => {
    const m = mount({ state: makeState(), value: 'KaiTi' })
    m.focus()
    m.type('Sim')
    m.key('Escape')
    expect(m.list()).toBe(null)
    expect(m.picked).toEqual([])
    expect(m.input.value).toBe('KaiTi')
    expect(m.state.fontOpen).toBe(null)
  })

  it('失焦同样取消；点击候选项由 mousedown 抢先提交，不被 blur 吃掉', () => {
    const m = mount({ state: makeState() })
    m.focus()
    m.clickRow(1)
    expect(m.picked).toEqual(['SimSun'])
    m.blur()
    expect(m.picked).toEqual(['SimSun'])
  })

  it('禁用态不展开（格式栏无可用目标时置灰）', () => {
    const m = mount({ state: makeState(), disabled: true })
    m.focus()
    expect(m.list()).toBe(null)
    expect(m.input.disabled).toBe(true)
  })
})

describe('font-select 展开态跨重绘（外壳整体重绘模型）', () => {
  it('重绘后仍保持展开、过滤词与高亮行（不因 repaint 闪断）', () => {
    const state = makeState()
    const first = mount({ state })
    first.type('sim')          // 命中 SimSun / SimHei
    first.key('ArrowDown')     // 高亮 0 → 1
    expect(state.fontOpen).toEqual({ id: 'prop-font', query: 'sim', highlighted: 1 })

    const second = mount({ state })
    expect(second.list()).toBeTruthy()
    expect(second.input.value).toBe('sim')
    expect(second.rows()[1]!.classList.contains('is-active')).toBe(true)
    expect(second.labels()).toEqual(['SimSun', 'SimHei'])
  })

  it('展开态互斥：一个实例开着，另一个实例重绘时保持收起', () => {
    const state = makeState()
    const a = mount({ state }, 'prop-font')
    a.focus()
    expect(state.fontOpen?.id).toBe('prop-font')
    expect(mount({ state }, 'cell-font').list()).toBe(null)
    // 用户改点单元格字体：先 blur 掉前者（canvas 同口径），再展开后者
    a.blur()
    expect(state.fontOpen).toBe(null)
    const b = mount({ state }, 'cell-font')
    b.focus()
    expect(state.fontOpen?.id).toBe('cell-font')
    expect(mount({ state }, 'cell-font').list()).toBeTruthy()
    expect(mount({ state }, 'prop-font').list()).toBe(null)
  })
})
