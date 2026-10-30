// 外壳共用控件构造：与 print-canvas 的同名控件保持 DOM 结构一致
// （下拉壳 .tb-dd、步进输入 .pd-stepper、颜色触发钮 .preset-color-trigger、字体下拉 .font-select）。
// 派生样式只认类名，结构一致才有样式，这是「样式完全一致」的机械约束。
import { h } from '../core/h'
import { iconSvg } from '../core/icons'
import { colorPicker } from './color-picker'
import type { PrintFontDeclaration } from '@worm-vue3-print/core'
import type { DesignerStore } from '../core/store'

/** 外壳局部 UI 状态（不落模板数据，仅影响渲染） */
export interface ShellState {
  leftTab: 'elements' | 'fields' | 'layers'
  leftCollapsed: boolean
  propTab: 'element' | 'page'
  propCollapsed: boolean
  /** 打开的下拉面板 id（同一时刻只允许一个） */
  openDd: string | null
  /**
   * 「更多」收纳面板的开关。与 openDd 分持：面板内还嵌着对齐/边框等下拉，
   * 共用一个开关键会让内层下拉一打开就把外层「更多」顶掉（canvas 是每个实例独立 open）。
   */
  openMore?: boolean
  /** 字段搜索关键字（仅影响左栏字段树） */
  fieldSearch?: string
  /** 折叠的字段分组 key */
  collapsedGroups: Set<string>
  /** 最近一次复制成功的字段 key：素材台行内「已复制」提示，1.2s 后清空重绘（对齐 canvas） */
  copiedFieldKey?: string
  /** 正在行内重命名的页面下标 */
  renamingPage: number | null
  renameText?: string
  /** 属性台搜索关键字（门控分组与字段，对应 canvas PropertyPanel 的 searchText） */
  propSearch?: string
  /** 展开中的字体下拉：整体重绘模型下必须外置，否则 repaint() 会让候选列表闪断 */
  fontOpen?: { id: string; query: string; highlighted: number } | null
}

/** 外壳渲染上下文：工具栏动作以 fire(name, arg) 上报，由自定义元素分发 */
export interface ShellCtx {
  store: DesignerStore
  /** 格式栏语义内核（shell/format-bar.ts 需要；由自定义元素注入） */
  format: import('../core/format').FormatToolbar
  state: ShellState
  repaint: () => void
  fire: (action: string, arg?: unknown) => void
  /** 宿主能力开关 */
  showHelp: boolean
  isEdit: boolean
  /** 宿主注入能力（图片上传、设计背景上传、字体清单），未注入时相关入口置灰 */
  host: {
    uploadImage?: (file: File) => Promise<string>
    uploadDesignBackground?: (file: File) => Promise<string>
    /** 模板级字体声明，与 canvas 的 PrintDesigner `fonts` prop 同类型（裸字符串族名不参与候选，与画布一致） */
    fonts?: readonly PrintFontDeclaration[]
  }
}

/** 带图标的工具栏按钮（对应 canvas 的 .tb-btn.tb-icon） */
export function tbIconBtn(ctx: ShellCtx, iconName: string, action: string, opts: {
  tip: string; disabled?: boolean; on?: boolean; danger?: boolean; arg?: unknown; test?: string
}) {
  return h('button', {
    class: `tb-btn tb-icon${opts.on ? ' on' : ''}${opts.danger ? ' danger' : ''}`,
    type: 'button',
    disabled: !!opts.disabled,
    dataset: { tip: opts.tip, ...(opts.test ? { test: opts.test } : {}) },
    onClick: () => ctx.fire(action, opts.arg),
    html: iconSvg(iconName),
  })
}

/** 下拉壳：触发钮 + 面板，面板内容由调用方给出（对应 canvas 的 ToolbarDropdown） */
export function dropdown(ctx: ShellCtx, id: string, opts: {
  tip: string; icon?: string; text?: string; textClass?: string; disabled?: boolean; testId?: string; panelClass?: string
}, panel: unknown[]) {
  const open = ctx.state.openDd === id
  const toggle = () => {
    ctx.state.openDd = open ? null : id
    ctx.repaint()
  }
  return h('div', { class: 'tb-dd' }, [
    h('button', {
      type: 'button',
      class: `tb-dd-trigger${open ? ' on' : ''}`,
      disabled: !!opts.disabled,
      dataset: { test: opts.testId ?? id, tip: opts.tip },
      onClick: toggle,
      // canvas 的 ToolbarDropdown：插槽内容 + 带 .tb-dd-arrow 的箭头（展开时 .up 翻转）
      html: `${opts.icon ? iconSvg(opts.icon) : ''}${opts.text ? `<span class="${opts.textClass ?? 'tb-btn-text'}">${opts.text}</span>` : ''}${iconSvg('ChevronDown', 12, `tb-dd-arrow${open ? ' up' : ''}`)}`,
    }),
    open ? h('div', { class: `tb-dd-panel${opts.panelClass ? ` ${opts.panelClass}` : '' }` }, panel) : '',
  ].filter(Boolean) as never)
}

/** 步进数字输入（对应 canvas 的 property/StepperInput） */
export function stepper(opts: {
  value?: number; min?: number; max?: number; step?: number; placeholder?: string; disabled?: boolean
  onCommit: (v: number) => void
}) {
  // canvas 的精度口径：小数位数由 step 推导（0.5→1 位、0.25→2 位、1→0 位）。
  // 显示与提交都要按该精度取整，否则存量模板里的 0.35 会显示成 0.35（canvas 显示 0.3），
  // 步进也会累积浮点噪声（0.30000000000000004）。
  const step = opts.step ?? 1
  const stepStr = String(step)
  const dot = stepStr.indexOf('.')
  const precision = dot === -1 ? 0 : stepStr.length - dot - 1
  const roundTo = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(precision)) : 0)
  const clamp = (v: number) => {
    let next = roundTo(v)
    if (opts.min !== undefined && next < opts.min) next = opts.min
    if (opts.max !== undefined && next > opts.max) next = opts.max
    return next
  }
  // canvas 的 StepperInput：undefined 表示「未设置（继承默认）」→ 输入框留空显示占位，步进从 min 起步
  const current = opts.value === undefined || opts.value === null || !Number.isFinite(opts.value)
    ? undefined
    : roundTo(opts.value)
  const base = current ?? opts.min ?? 0
  const commit = (next: number) => { if (next !== current) opts.onCommit(next) }
  const input = h('input', {
    class: 'pd-input pd-step-input',
    type: 'number',
    value: current === undefined ? '' : String(current),
    min: opts.min, max: opts.max, step,
    placeholder: opts.placeholder,
    disabled: !!opts.disabled,
    onChange: (ev: Event) => {
      const el = ev.target as HTMLInputElement
      const raw = (el.value ?? '').trim()
      // canvas commit()：空值/非法值都把输入框规范化回当前值，超界值回写夹取结果，
      // 否则「夹取后值没变」时不重绘，框里会留着用户刚打的越界数字
      if (raw === '') {
        if (current !== undefined) el.value = String(current)
        return
      }
      const num = Number(raw)
      if (!Number.isFinite(num)) {
        el.value = current === undefined ? '' : String(current)
        return
      }
      const next = clamp(num)
      el.value = String(next)
      commit(next)
    },
  })
  return h('div', { class: 'pd-stepper' }, [
    h('button', {
      type: 'button', class: 'pd-step-btn pd-step-minus',
      disabled: !!opts.disabled || base <= (opts.min ?? -Infinity),
      title: '减小', 'aria-label': '减小',
      text: '−',
      onClick: () => commit(clamp(base - step)),
    }),
    input,
    h('button', {
      type: 'button', class: 'pd-step-btn pd-step-plus',
      disabled: !!opts.disabled || base >= (opts.max ?? Infinity),
      title: '增大', 'aria-label': '增大',
      text: '+',
      onClick: () => commit(clamp(base + step)),
    }),
  ])
}

/** 属性行：pd-field > pd-label(.pd-label-t + 恢复默认值) + 控件 */
export function field(label: string, control: unknown, hint?: string, reset?: unknown) {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t', text: label }), reset ?? '']),
    control,
    hint ? h('p', { class: 'pd-hint', text: hint }) : '',
  ].filter(Boolean) as never)
}

/** 字段说明图标：说明不常驻行内，悬浮或点击聚焦时才浮出（对应 canvas 的 button.pd-help） */
export const labelHelp = (tip: string) => h('button', {
  class: 'pd-help', type: 'button', 'data-tip': tip, 'aria-label': '字段说明',
})

/** 带说明图标的属性行：与 field() 同结构，差别只在说明挂图标而非常驻 .pd-hint 段落 */
export function fieldHelp(label: string, control: unknown, tip: string, reset?: unknown) {
  return h('div', { class: 'pd-field' }, [
    h('span', { class: 'pd-label' }, [h('span', { class: 'pd-label-t' }, [label, labelHelp(tip)]), reset ?? '']),
    control,
  ])
}

/**
 * 「恢复默认值」按钮，与 canvas 的 property/ResetButton.vue 逐字同构。
 * 落点派生自 base[propKey]：判据一律 === 比出厂值，base 里取到 undefined 即「未设」，
 * 写回它天然等于删键。0 与 undefined 是两个状态，不得用 ?? / || 归并。
 * 外壳是全量重绘模型，灰/亮在构造时求值即可，不需要响应式。
 * 按钮不带任何文本子节点——属性搜索按 .pd-label 的 textContent 匹配，写字会污染命中。
 */
export function resetButton(o: {
  target: Record<string, any>
  base: Record<string, any>
  propKey: string
  /** 提示语数值：仅用于文案，不参与判定 */
  tipValue?: number | string
  tipUnit?: string
  /** 覆盖整条提示（单元格级固定用「跟随表格默认」，回落目标是该表自己的默认） */
  tipOverride?: string
  /** 覆盖写回通道：单元格组必须整选区恢复，不能让按钮只改当前展示的那一个 cell 对象 */
  write?: (value: any) => void
  /** 写回后的收尾（重绘 / 记历史）；不提供时只改对象 */
  onReset?: () => void
  /** 多选批量档：不显示"已改"脏点（判据取自单格会误导），但按钮恒可点，写回整选区 */
  force?: boolean
}) {
  const factory = o.base?.[o.propKey]
  const changed = o.target?.[o.propKey] !== factory
  const actionable = o.force === true || changed
  const baseTip = o.tipOverride ?? (o.tipValue === undefined
    ? '恢复默认值'
    : `恢复默认值（${o.tipValue}${o.tipUnit ? ' ' + o.tipUnit : ''}）`)
  const tip = o.force ? `${baseTip}（应用到全部选中格）` : baseTip
  return h('button', {
    type: 'button',
    class: `pd-reset-btn${changed && !o.force ? ' is-dirty' : ''}`,
    'data-tip': tip,
    'aria-label': tip,
    html: iconSvg('RotateCcw', 13),
    onClick: () => {
      if (!actionable) return
      if (o.write) o.write(factory)
      else o.target[o.propKey] = factory
      o.onReset?.()
    },
  })
}

/** 分节标题（对应 canvas 的 h3.pd-divider） */
export const divider = (text: string) => h('h3', { class: 'pd-divider', text })

/** 颜色触发钮：预设色板面板（移植 canvas 的 PresetColorPicker.vue，面板实现见 shell/color-picker.ts）。
 * onPick 收到的 undefined 表示「清除颜色」：canvas 侧 emit '' 后由消费方归一化为未设置，
 * 本包在触发器层直接归一后透传，调用方 patch 即删除该颜色属性（签名保持 (v: string) 不变）。 */
export function colorTrigger(value: string | undefined, onPick: (v: string) => void, title = '颜色选择', triggerClass?: string) {
  return colorPicker({ value, title, triggerClass, onChange: v => onPick(v as string) })
}

/** 单选组（对应 canvas 的 .pd-radio-group） */
export function radioGroup(name: string, options: { value: string; label: string }[], current: string, onChange: (v: string) => void, twoCol = false) {
  return h('div', {
    class: `pd-radio-group${twoCol ? ' pd-radio-group--2col' : ''}`,
    role: 'radiogroup',
  }, options.map(o => h('label', { class: 'pd-radio' }, [
    h('input', {
      type: 'radio', name, value: o.value, checked: current === o.value,
      onChange: () => onChange(o.value),
    }),
    h('span', { text: o.label }),
  ])))
}

/**
 * 裸下拉（无 label 包裹，用于 .border-style-row 这类横向控件行）。
 * 不能只靠 <option selected> 属性：happy-dom/部分内核在"首项未选中、第三项选中"时会回落到第二项，
 * 必须建真节点后显式 select.value = 当前值（与 selectField 同一套可靠赋值）。
 */
export function plainSelect(
  value: string, options: { value: string; label: string; disabled?: boolean }[],
  onChange: (v: string) => void, attrs: { className?: string; width?: string } = {},
) {
  const sel = document.createElement('select')
  sel.className = attrs.className ?? 'pd-select'
  if (attrs.width) sel.style.width = attrs.width
  for (const o of options) {
    const opt = document.createElement('option')
    opt.value = o.value
    opt.textContent = o.label
    if (o.disabled) opt.disabled = true
    sel.appendChild(opt)
  }
  sel.value = value
  if (!options.some(o => o.value === value)) sel.selectedIndex = -1
  sel.addEventListener('change', () => onChange(sel.value))
  return sel
}
