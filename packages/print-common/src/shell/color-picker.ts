// 颜色选择器：移植 print-canvas/src/components/PresetColorPicker.vue（无框架版）。
// 类名与 canvas 逐字一致（.preset-color-trigger / .preset-color-panel / .picker-* /
// .preset-color-grid / .preset-color-item[.active]，样式派生机制见 shell/controls.ts 顶部）；
// 预设色板继续走 core 的 PRESET_COLORS，不在本包复制颜色数组。
//
// ─── 面板为什么不 Teleport 到 document.body ───
// canvas 用 <Teleport to="body"> + position:fixed；本包 DOM 只允许存在于 shadow root 内
// （宿主页面样式/脚本不穿越 shadow，往 body 挂面板既会被宿主样式污染，也绕开本包派生样式表）。
// 外壳是整体重绘模型：paint() 会 clear(.designer-container)，所以面板作为 .designer-container
// 的「兄弟节点」挂到触发按钮所属的 ShadowRoot 上（点击时从按钮 getRootNode() 反查，同步可得，
// 且天然支持多设计器实例：普通文档环境则回落到 document.body）。面板在被 clear 的范围之外，
// 外壳重绘不会销毁它 —— hex 输入焦点与 SV 面积拖拽状态因此不丢，面板内部状态（HSV/色值）
// 保存在本模块的活跃实例里，与 shell/table.ts 的 menu 状态同一手法。
//
// ─── 与 canvas 的交互差异（有意为之，见 PARITY 汇报）───
// canvas 的 SV 拖拽/色相滑杆每次 pointermove/input 都 emit；本包调用方统一走
// store.updateElement(record=true)，逐帧 emit 会刷屏撤销历史。故拖拽与滑杆用 document 级
// 一次性监听做面板定点 DOM 更新（handle/预览/hex 文本实时跟随），pointerup/change 结束才
// 回调一次 onChange —— 与 shell/table.ts 列宽拖拽同口径。键盘方向键与滑杆键盘操作逐次提交
// （与 canvas 一致）。清除回传 undefined：canvas emit '' 后由消费方归一化为未设置，
// 本包在触发器层直接归一，调用方 patch 后即删除该颜色属性。
import { PRESET_COLORS } from '@worm-vue3-print/core/designer'
import { h, render } from '../core/h'
import type { El } from '../core/h'

export interface ColorPickerOptions {
  /** 当前色值；空串/undefined 均视为「未设置」 */
  value?: string
  /** 是否允许清除（canvas 边框等必填场景传 false），默认 true */
  clearable?: boolean
  /** 触发按钮 title（canvas 侧为色值或「自动」，本包保留调用方传入的字段名语义） */
  title?: string
  /** 追加在触发钮上的类名（canvas 给组件根挂的 class 会与其自身类名合并，如 `page-bg-picker`） */
  triggerClass?: string
  /** 选中回调；undefined 表示清除（canvas emit '' 的等价归一） */
  onChange: (value: string | undefined) => void
}

/** 面板活跃实例：同一时刻全页只开一个面板（canvas 外点关闭逻辑下同） */
interface PickerInstance {
  root: ShadowRoot | Document
  /** 打开面板的字段 title：重绘会替换触发钮节点，同名即视为同一字段（见 onClick 说明） */
  title: string
  trigger: HTMLElement
  panel: HTMLElement
  clearable: boolean
  onChange: (value: string | undefined) => void
  /** 当前色值（undefined = 未设置/已清除）；清除后 HSV 保持上一次状态，与 canvas 同口径 */
  model: string | undefined
  hue: number
  saturation: number
  value_: number
  hexText: string
  dragging: boolean
  current: HTMLElement
  hex: HTMLInputElement
  area: HTMLElement
  handle: HTMLElement
  hueRange: HTMLInputElement
  clearBtn: HTMLButtonElement | null
  items: { el: HTMLElement; color: string }[]
  teardowns: Array<() => void>
}

let active: PickerInstance | null = null

// ─── 颜色换算（与 canvas 组件内私有函数逐行一致；导出供单测）───

export function parseHex(color: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const hex = match[1]!
  const full = hex.length === 3
    ? hex.split('').map(char => char + char).join('')
    : hex
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  }
}

export function normalizeHex(color: string): string {
  const rgb = parseHex(color)
  return rgb ? rgbToHex(rgb) : '#000000'
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map(part => Math.round(clamp01(part / 255) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  let h_ = 0
  if (delta !== 0) {
    if (max === red) h_ = ((green - blue) / delta) % 6
    else if (max === green) h_ = (blue - red) / delta + 2
    else h_ = (red - green) / delta + 4
    h_ *= 60
    if (h_ < 0) h_ += 360
  }
  return { h: h_, s: max === 0 ? 0 : delta / max, v: max }
}

export function hsvToRgb(h_: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const hh = (((h_ % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  const [r1, g1, b1] = hh < 1 ? [c, x, 0]
    : hh < 2 ? [x, c, 0]
    : hh < 3 ? [0, c, x]
    : hh < 4 ? [0, x, c]
    : hh < 5 ? [x, 0, c]
    : [c, 0, x]
  const m = v - c
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 }
}

function clampDegree(degree: number): number {
  return (((Number.isFinite(degree) ? degree : 0) % 360) + 360) % 360
}

function clamp01(number: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(number) ? number : 0))
}

// ─── 触发按钮 ───

/** 触发按钮（对应 canvas 的 button.preset-color-trigger）；点击在挂载根上开/关面板 */
export function colorPicker(opts: ColorPickerOptions): El {
  const title = opts.title ?? '颜色选择'
  return h('button', {
    type: 'button',
    class: `preset-color-trigger${opts.triggerClass ? ` ${opts.triggerClass}` : ''}`,
    'aria-expanded': 'false',
    'aria-haspopup': 'dialog',
    title,
    onClick: (ev: Event) => {
      const btn = (ev.currentTarget ?? ev.target) as HTMLElement
      const root = btn.getRootNode() as ShadowRoot | Document
      const sameField = !!active && active.root === root && active.title === title
      if (sameField && active!.trigger === btn) {
        // 同一钮再次点击 = 收起（canvas 的 toggle）
        closeColorPicker()
        return
      }
      // 外壳重绘会替换触发钮节点：同「挂载根 + title」的钮视为同一字段，保持打开、把面板迁到新钮；
      // 其余情形先关旧面板再开新面板（canvas 里 pointerdown 外点关闭已保证互斥，口径一致）
      closeColorPicker()
      openPanel(btn, opts)
    },
  }, [
    h('span', {
      class: 'preset-color-swatch',
      style: opts.value ? { background: opts.value } : { background: 'transparent' },
    }),
  ])
}

/** 关闭当前打开的面板并解除全部监听（宿主 disconnectedCallback 亦可用） */
export function closeColorPicker(): void {
  const inst = active
  if (!inst) return
  active = null
  inst.teardowns.forEach(off => off())
  inst.trigger.setAttribute('aria-expanded', 'false')
  inst.panel.remove()
}

// ─── 面板挂载 ───

function openPanel(trigger: HTMLElement, opts: ColorPickerOptions): void {
  const root = trigger.getRootNode() as ShadowRoot | Document
  const mount: Element | ShadowRoot = root instanceof ShadowRoot ? root : document.body
  const inst: PickerInstance = {
    root, title: opts.title ?? '颜色选择', trigger, panel: null as unknown as HTMLElement,
    clearable: opts.clearable !== false, onChange: opts.onChange,
    model: opts.value || undefined, hue: 0, saturation: 0, value_: 0, hexText: '',
    dragging: false,
    current: null as unknown as HTMLElement, hex: null as unknown as HTMLInputElement,
    area: null as unknown as HTMLElement, handle: null as unknown as HTMLElement,
    hueRange: null as unknown as HTMLInputElement, clearBtn: null, items: [],
    teardowns: [],
  }
  // 打开时从当前色值同步 HSV；非法/空值保持默认（canvas 的 watch immediate 同口径）
  if (opts.value && syncFromColor(inst, opts.value)) inst.hexText = normalizeHex(opts.value).toUpperCase()
  else inst.hexText = opts.value ? String(opts.value) : ''

  inst.panel = render(buildPanel(inst), mount) as HTMLElement
  inst.current = inst.panel.querySelector('.picker-current') as HTMLElement
  inst.hex = inst.panel.querySelector('.picker-hex') as HTMLInputElement
  inst.area = inst.panel.querySelector('.picker-area') as HTMLElement
  inst.handle = inst.panel.querySelector('.picker-handle') as HTMLElement
  inst.hueRange = inst.panel.querySelector('.picker-hue') as HTMLInputElement
  inst.clearBtn = inst.panel.querySelector('.picker-clear') as HTMLButtonElement | null
  inst.items = Array.from(inst.panel.querySelectorAll<HTMLElement>('.preset-color-item'))
    .map((el, i) => ({ el, color: PRESET_COLORS[i]! }))
  refresh(inst)
  positionPanel(inst)
  bindCloseEvents(inst)
  active = inst
  trigger.setAttribute('aria-expanded', 'true')
}

/** 面板定位：与 canvas open() 同一组常量（宽 190、高回退 216、边距 8、间距 6），视口夹取上下翻转 */
function positionPanel(inst: PickerInstance): void {
  const rect = inst.trigger.getBoundingClientRect()
  const panelWidth = 190
  const panelHeight = inst.panel.offsetHeight || 216
  const margin = 8
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelWidth - margin))
  const below = rect.bottom + 6
  const top = below + panelHeight > window.innerHeight - margin
    ? Math.max(margin, rect.top - panelHeight - 6)
    : below
  inst.panel.style.left = `${left}px`
  inst.panel.style.top = `${top}px`
}

/** 外点/Esc/滚动/缩放关闭：与 canvas 的常驻监听同集合，改为「打开时绑定、关闭时解除」的一次性绑定 */
function bindCloseEvents(inst: PickerInstance): void {
  const onPointerDown = (ev: Event) => {
    const path = pathOf(ev)
    if (path.includes(inst.trigger) || path.includes(inst.panel)) return
    closeColorPicker()
  }
  const onKeydown = (ev: Event) => {
    if ((ev as KeyboardEvent).key === 'Escape') closeColorPicker()
  }
  const onViewportChange = () => closeColorPicker()
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
  // scroll 事件不跨 shadow 边界冒泡：画布区滚动只在挂载根内可见，需单独捕获
  inst.root.addEventListener('scroll', onViewportChange, true)
  inst.teardowns.push(
    () => document.removeEventListener('pointerdown', onPointerDown, true),
    () => document.removeEventListener('keydown', onKeydown),
    () => window.removeEventListener('scroll', onViewportChange, true),
    () => window.removeEventListener('resize', onViewportChange),
    () => inst.root.removeEventListener('scroll', onViewportChange, true),
  )
}

/** shadow 内事件在 document 监听器里 target 会被重定向为宿主，必须用 composedPath 判归属 */
function pathOf(ev: Event): EventTarget[] {
  const composed = typeof (ev as { composedPath?: () => EventTarget[] }).composedPath === 'function'
    ? (ev as { composedPath: () => EventTarget[] }).composedPath()
    : []
  return composed.length ? composed : [ev.target as EventTarget]
}

// ─── 面板 DOM 描述（结构与 canvas 模板逐项对齐）───

function buildPanel(inst: PickerInstance): El {
  return h('div', {
    class: 'preset-color-panel',
    role: 'dialog',
    'aria-label': '颜色选择',
    style: { position: 'fixed' },
    onPointerdown: (ev: Event) => ev.stopPropagation(),
  }, [
    h('div', { class: 'picker-preview' }, [
      h('span', { class: 'picker-current' }),
      h('input', {
        class: 'picker-hex', type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': '颜色值',
        onInput: (ev: Event) => onHexInput(inst, (ev.target as HTMLInputElement).value),
      }),
    ]),
    h('div', {
      class: 'picker-area', 'aria-label': '自定义颜色', tabindex: 0,
      onPointerdown: (ev: Event) => startAreaDrag(inst, ev as PointerEvent),
      onKeydown: (ev: Event) => onAreaKeydown(inst, ev as KeyboardEvent),
    }, [h('span', { class: 'picker-handle' })]),
    h('input', {
      class: 'picker-hue', type: 'range', min: 0, max: 360, step: 1, 'aria-label': '色相',
      onInput: (ev: Event) => onHueInput(inst, Number((ev.target as HTMLInputElement).value)),
      onChange: () => commitHsv(inst),
    }),
    h('div', { class: 'picker-heading' }, [
      h('span', { text: '常用颜色' }),
      inst.clearable ? h('button', {
        type: 'button', class: 'picker-clear', title: '清除选中的颜色',
        onClick: () => commitModel(inst, undefined),
      }, [
        h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true' }, [
          h('path', {
            d: 'M3 3l10 10M13 3L3 13', stroke: 'currentColor', 'stroke-width': '1.5',
            'stroke-linecap': 'round', fill: 'none',
          }),
        ]),
        '清除',
      ]) : '',
    ].filter(Boolean) as never),
    h('div', { class: 'preset-color-grid' }, PRESET_COLORS.map(color => h('button', {
      type: 'button', class: 'preset-color-item', style: { background: color },
      title: color, 'aria-label': color,
      onClick: () => selectColor(inst, color),
    }))),
  ])
}

// ─── 状态与定点 DOM 刷新（面板节点常驻、只改受影响属性，外壳重绘不触碰）───

function activeColor(inst: PickerInstance): string {
  return rgbToHex(hsvToRgb(inst.hue, inst.saturation, inst.value_))
}

function refresh(inst: PickerInstance): void {
  const color = activeColor(inst)
  if (inst.hex.value !== inst.hexText) inst.hex.value = inst.hexText
  inst.current.className = inst.model ? 'picker-current' : 'picker-current is-empty'
  if (inst.model) inst.current.style.background = color
  else inst.current.style.removeProperty('background')
  inst.area.style.setProperty('--picker-hue', `${Math.round(inst.hue)}deg`)
  inst.handle.style.left = `${inst.saturation * 100}%`
  inst.handle.style.top = `${(1 - inst.value_) * 100}%`
  inst.handle.style.background = color
  const hueText = String(Math.round(inst.hue))
  if (inst.hueRange.value !== hueText) inst.hueRange.value = hueText
  if (inst.clearBtn) inst.clearBtn.disabled = !inst.model
  for (const item of inst.items) {
    item.el.className = inst.model && item.color.toLowerCase() === inst.model.toLowerCase()
      ? 'preset-color-item active'
      : 'preset-color-item'
  }
}

function syncFromColor(inst: PickerInstance, color: string): boolean {
  const rgb = parseHex(color)
  if (!rgb) return false
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  inst.hue = hsv.h
  inst.saturation = hsv.s
  inst.value_ = hsv.v
  inst.hexText = normalizeHex(color).toUpperCase()
  return true
}

/** 改 HSV 但不回写调用方：面板实时反馈用（canvas 的 setHsv 会逐次 emit，本包改为结束时提交） */
function setHsvState(inst: PickerInstance, h_: number, s: number, v: number): void {
  inst.hue = clampDegree(h_)
  inst.saturation = clamp01(s)
  inst.value_ = clamp01(v)
  inst.hexText = activeColor(inst).toUpperCase()
  refresh(inst)
}

function commitHsv(inst: PickerInstance): void {
  const color = activeColor(inst)
  inst.model = color
  refresh(inst)
  inst.onChange(color)
}

function commitModel(inst: PickerInstance, color: string | undefined): void {
  inst.model = color
  if (!color) inst.hexText = ''
  refresh(inst)
  inst.onChange(color)
}

function selectColor(inst: PickerInstance, color: string): void {
  syncFromColor(inst, color)
  commitModel(inst, color)
}

function onHexInput(inst: PickerInstance, raw: string): void {
  const color = raw.trim()
  // 输入框清空时同步清除颜色（仅在允许清除时）
  if (!color) {
    if (inst.clearable) commitModel(inst, undefined)
    return
  }
  if (!parseHex(color)) return
  syncFromColor(inst, color)
  commitModel(inst, normalizeHex(color))
}

// ─── SV 面积选择器（document 级一次性监听，pointerup 才回调 onChange）───

function startAreaDrag(inst: PickerInstance, ev: PointerEvent): void {
  inst.dragging = true
  setAreaFromEvent(inst, ev)
  const onMove = (m: Event) => { if (inst.dragging) setAreaFromEvent(inst, m as PointerEvent) }
  const onUp = () => {
    if (!inst.dragging) return
    inst.dragging = false
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    commitHsv(inst)
  }
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

function setAreaFromEvent(inst: PickerInstance, ev: PointerEvent): void {
  const rect = inst.area.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const s = clamp01((ev.clientX - rect.left) / rect.width)
  const v = clamp01(1 - (ev.clientY - rect.top) / rect.height)
  setHsvState(inst, inst.hue, s, v)
}

function onAreaKeydown(inst: PickerInstance, ev: KeyboardEvent): void {
  const step = ev.shiftKey ? 0.1 : 0.02
  let handled = true
  if (ev.key === 'ArrowLeft') setHsvState(inst, inst.hue, inst.saturation - step, inst.value_)
  else if (ev.key === 'ArrowRight') setHsvState(inst, inst.hue, inst.saturation + step, inst.value_)
  else if (ev.key === 'ArrowUp') setHsvState(inst, inst.hue, inst.saturation, inst.value_ + step)
  else if (ev.key === 'ArrowDown') setHsvState(inst, inst.hue, inst.saturation, inst.value_ - step)
  else handled = false
  if (handled) {
    ev.preventDefault()
    commitHsv(inst) // 键盘步进逐次提交（canvas 对每次 keydown 都 emit，保持一致）
  }
}

// ─── 色相滑杆（input 实时反馈面板，change 提交一次）───

function onHueInput(inst: PickerInstance, degree: number): void {
  setHsvState(inst, degree, inst.saturation, inst.value_)
}
