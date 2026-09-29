// 字体下拉：移植 print-canvas/src/components/property/FontSelect.vue（无框架版）。
// 类名与 canvas 逐字一致（.font-select / .font-select-input / .font-select-list /
// .font-select-option.is-active / .is-muted），combobox 的 aria 关联同口径。
//
// 与 canvas 的实现差异（行为等价）：
// · canvas 用组件内 ref + 父级响应式；本包外壳是整体重绘模型，展开态（哪个实例开着、
//   过滤词、高亮行）持久化在 ShellState.fontOpen 上，repaint() 后仍能原样恢复，不闪断。
// · 输入与过滤只重写本控件的 <ul> 子树，不触发外壳重绘（canvas 同理：状态在组件内部），
//   因此连续输入与中文输入法组合不会被整体重绘打断。
// · 候选数据源为 core 侧未导出的字体目录算法，等价实现见 ../core/font-catalog.ts。
import {
  buildFontCatalog, filterFontOptions, findFontOption, fontOptionLabel, normalizeFontQuery,
} from '../core/font-catalog'
import type { FontOption } from '../core/font-catalog'
import type { ShellState } from './controls'

type FontRowKind = 'clear' | 'unknown' | 'font' | 'free'

interface FontRow {
  key: string
  kind: FontRowKind
  label: string
  /** 提交值；clear 行为 undefined */
  value?: string
  selected: boolean
}

export interface FontSelectOptions {
  /** 实例标识：同一时刻只允许一个字体下拉处于展开态 */
  id: string
  /** 外壳状态：展开态落在这里，跨重绘保持 */
  state: ShellState
  /** 宿主注入的字体清单（字符串或字体声明均可） */
  fonts?: readonly (string | FontOption)[]
  /** 当前族名；undefined 表示未设置，走全局兜底字体栈 */
  value?: string
  /** 空值行文案（同时用作输入框 placeholder） */
  placeholder?: string
  /** 禁用（如格式工具栏无可用目标时置灰） */
  disabled?: boolean
  onChange: (value: string | undefined) => void
}

export function renderFontSelect(opts: FontSelectOptions): HTMLElement {
  const catalog = buildFontCatalog(opts.fonts)
  const placeholder = opts.placeholder ?? '默认'
  const listId = `font-select-list-${opts.id}`

  /** 展示名：宿主声明了 label 的字体在输入框里显示 label，写入模板的始终是族名 */
  const toDisplayName = (family?: string): string => {
    const key = family?.trim()
    if (!key) return ''
    return findFontOption(catalog, key)?.label ?? key
  }
  /** 输入的是展示名时，写进模板的必须是真实族名，否则字体静默失效 */
  const resolveTypedFamily = (typed: string): string => {
    const key = normalizeFontQuery(typed)
    const hit = catalog.find(font => font.label && normalizeFontQuery(font.label) === key)
    return hit?.family ?? typed
  }
  /** 当前值不在声明字体内时（如导入旧模板）保留一行，避免误以为被清掉 */
  const unknownFamily = (): string => {
    const current = opts.value?.trim()
    if (!current) return ''
    return findFontOption(catalog, current) ? '' : current
  }

  const rows = (query: string): FontRow[] => {
    const current = (opts.value ?? '').trim()
    const make = (kind: FontRowKind, key: string, label: string, value?: string): FontRow => ({
      kind, key, label, value, selected: (value ?? '') === current,
    })
    const typed = query.trim()
    // 过滤时不展示空值行与未知行：此时 Enter 应当落在命中项或用户输入的字体名上
    if (!typed) {
      const out: FontRow[] = [make('clear', '__clear__', placeholder)]
      const unknown = unknownFamily()
      if (unknown) out.push(make('unknown', '__unknown__', `${unknown}（未知）`, unknown))
      for (const font of catalog) out.push(make('font', font.family, fontOptionLabel(font), font.family))
      return out
    }
    const matched = filterFontOptions(catalog, typed)
      .map(font => make('font', font.family, fontOptionLabel(font), font.family))
    // 清单外字体名可直接录入：一条都没命中时才补「使用「xxx」」，有命中项时补只会成为噪音
    if (!matched.length) {
      const family = resolveTypedFamily(typed)
      matched.push(make('free', '__free__', `使用「${family}」`, family))
    }
    return matched
  }

  const wrap = document.createElement('div')
  wrap.className = 'font-select'
  const input = document.createElement('input')
  input.className = 'pd-input font-select-input'
  input.type = 'text'
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', listId)
  input.autocomplete = 'off'
  input.placeholder = placeholder
  input.disabled = !!opts.disabled
  input.value = toDisplayName(opts.value)

  const list = document.createElement('ul')
  list.id = listId
  list.className = 'font-select-list'
  list.setAttribute('role', 'listbox')

  // 展开态：优先从 ShellState 恢复（外壳整体重绘后不闪断）
  const saved = opts.state.fontOpen?.id === opts.id ? opts.state.fontOpen : null
  const st = {
    open: !!saved && !opts.disabled,
    query: saved?.query ?? '',
    highlighted: saved?.highlighted ?? -1,
  }
  if (st.open) input.value = st.query

  const persist = () => {
    opts.state.fontOpen = st.open ? { id: opts.id, query: st.query, highlighted: st.highlighted } : null
  }
  persist()

  const currentRowIndex = (): number => {
    const current = (opts.value ?? '').trim()
    return rows(st.query).findIndex(row => (row.value ?? '') === current)
  }

  const paintList = () => {
    // canvas 的 `v-if="open"`：收起时列表节点整体不存在（不只是 hidden），DOM 签名才对得上
    if (!st.open) {
      if (list.isConnected) list.remove()
      input.setAttribute('aria-expanded', 'false')
      input.setAttribute('aria-activedescendant', '')
      return
    }
    if (!list.isConnected) wrap.appendChild(list)
    const items = rows(st.query)
    list.replaceChildren(...items.map((row, index) => {
      const li = document.createElement('li')
      li.id = `${listId}-${index}`
      li.className = 'font-select-option'
        + (index === st.highlighted ? ' is-active' : '')
        + (row.kind === 'unknown' || row.kind === 'free' ? ' is-muted' : '')
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', String(row.selected))
      li.textContent = row.label
      // mousedown + preventDefault：先于 blur 触发，避免收起动作吃掉点击
      li.addEventListener('mousedown', (ev) => {
        ev.preventDefault()
        pick(row)
      })
      return li
    }))
    input.setAttribute('aria-expanded', 'true')
    input.setAttribute('aria-activedescendant',
      st.highlighted >= 0 ? `${listId}-${st.highlighted}` : '')
  }

  const onOpen = () => {
    // 禁用态（格式栏无可用目标）不展开：canvas 由 :disabled 天然挡住 focus，这里显式兜住
    if (st.open || opts.disabled) return
    st.open = true
    st.query = ''
    st.highlighted = currentRowIndex()
    persist()
    paintList()
  }
  /** 点击输入框只负责重新展开（Esc 收起后再次点开），不改动已输入内容 */
  const onClick = () => {
    if (st.open) return
    onOpen()
  }
  const onInput = () => {
    st.open = true
    st.query = input.value
    st.highlighted = rows(st.query).length ? 0 : -1
    persist()
    paintList()
  }
  const move = (delta: number) => {
    if (!st.open) {
      onOpen()
      return
    }
    const last = rows(st.query).length - 1
    if (last < 0) return
    st.highlighted = Math.min(Math.max(st.highlighted + delta, 0), last)
    persist()
    paintList()
    const el = list.children[st.highlighted] as HTMLElement | undefined
    el?.scrollIntoView?.({ block: 'nearest' })
  }
  const onEnter = () => {
    if (!st.open) return
    const row = rows(st.query)[st.highlighted]
    if (row) {
      pick(row)
      return
    }
    const typed = st.query.trim()
    if (typed) {
      const family = resolveTypedFamily(typed)
      pick({ kind: 'free', key: '__free__', label: family, value: family, selected: false })
    }
  }
  const pick = (row: FontRow) => {
    st.open = false
    st.query = ''
    st.highlighted = -1
    persist()
    input.value = toDisplayName(row.value)
    paintList()
    opts.onChange(row.value)
  }
  const onCancel = () => {
    if (!st.open) return
    st.open = false
    st.query = ''
    st.highlighted = -1
    persist()
    input.value = toDisplayName(opts.value)
    paintList()
  }

  input.addEventListener('focus', onOpen)
  input.addEventListener('click', onClick)
  input.addEventListener('input', onInput)
  input.addEventListener('blur', onCancel)
  input.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Enter') { e.preventDefault(); onEnter() }
    else if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  })

  wrap.append(input)
  paintList()
  // 重绘后处于展开态：把焦点与光标交还给输入框（输入内容即过滤词）
  if (st.open) {
    input.focus()
    input.setSelectionRange(st.query.length, st.query.length)
  }
  return wrap
}
