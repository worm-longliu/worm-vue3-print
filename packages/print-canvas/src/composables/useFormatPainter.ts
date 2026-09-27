// 格式刷：捕获单个源元素的格式快照，选中集变化即把快照刷到目标元素
// 交互仿 Word：单击工具栏按钮刷一次后退出，双击锁定连续刷，Esc 或清空选中退出
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { RuntimeElement, ElementOptions } from '@worm-vue3-print/core/designer'
import { acceptsElementBorder, ELEMENT_BORDER_SIDES } from '@worm-vue3-print/core/designer'
import { TEXT_TYPES } from './useFormatToolbar'

/** 随文本组一起复制的字段（与格式工具栏可写集一致；textFit/行距等属性面板字段不纳入） */
const TEXT_KEYS = [
  'fontFamily', 'fontSize', 'fontWeight', 'color', 'textAlign', 'verticalAlign', 'textDecoration',
] as const

type TextSnapshot = { [K in typeof TEXT_KEYS[number]]: ElementOptions[K] }
interface BorderSnapshot {
  borderWidth?: number
  borderStyle?: string
  borderColor?: string
  borders?: ElementOptions['borders']
}

interface FormatSnapshot {
  /** 源为文本类时才有：应用前还需按目标类型过滤 */
  text: TextSnapshot | null
  backgroundColor?: string
  /** 源类型可携带元素级边框时才有（rect/oval/线/表格排除，与出纸口径一致） */
  border: BorderSnapshot | null
}

export interface FormatPainterDeps {
  elements: Ref<RuntimeElement[]>
  selectedIds: Ref<Set<string>>
  recordHistory: () => void
}

export function useFormatPainter(deps: FormatPainterDeps) {
  const { elements, selectedIds, recordHistory } = deps

  const active = ref(false)
  const locked = ref(false)
  const sourceId = ref<string | null>(null)
  let snapshot: FormatSnapshot | null = null

  const selectedElements = computed(() =>
    elements.value.filter(e => selectedIds.value.has(e.id) && !e.options.locked))

  /** 仅选中单个未锁定元素时可作为格式源 */
  const capturable = computed(() => selectedElements.value.length === 1)

  function cloneBorders(borders: ElementOptions['borders']): BorderSnapshot['borders'] {
    if (!borders) return undefined
    const out: NonNullable<BorderSnapshot['borders']> = {}
    for (const side of ELEMENT_BORDER_SIDES) {
      const edge = borders[side]
      if (edge) out[side] = { ...edge }
    }
    return out
  }

  /** 从当前唯一选中元素捕获格式并进入刷取模式；locked=true 为双击连续刷 */
  function capture(nextLocked = false): boolean {
    const src = selectedElements.value[0]
    if (!src) return false
    const o = src.options
    const type = src.printElementType.type
    snapshot = {
      text: TEXT_TYPES.has(type)
        ? Object.fromEntries(TEXT_KEYS.map(k => [k, o[k]])) as TextSnapshot
        : null,
      backgroundColor: o.backgroundColor,
      border: acceptsElementBorder(type)
        ? { borderWidth: o.borderWidth, borderStyle: o.borderStyle, borderColor: o.borderColor, borders: cloneBorders(o.borders) }
        : null,
    }
    sourceId.value = src.id
    active.value = true
    locked.value = nextLocked
    return true
  }

  function cancel() {
    active.value = false
    locked.value = false
    sourceId.value = null
    snapshot = null
  }

  /** 按目标类型过滤写入；backgroundColor 全类型通用，与格式工具栏口径一致 */
  function applyTo(el: RuntimeElement): boolean {
    const s = snapshot
    if (!s || el.options.locked || el.id === sourceId.value) return false
    const o = el.options
    const type = el.printElementType.type
    if (s.text && TEXT_TYPES.has(type)) Object.assign(o, s.text)
    o.backgroundColor = s.backgroundColor
    if (s.border && acceptsElementBorder(type)) {
      o.borderWidth = s.border.borderWidth
      o.borderStyle = s.border.borderStyle
      o.borderColor = s.border.borderColor
      o.borders = cloneBorders(s.border.borders)
    }
    return true
  }

  // 选中集变化即视为刷目标：点击/框选/图层面板选中共用这一条路径
  watch(selectedIds, () => {
    if (!active.value || !snapshot) return
    const targets = selectedElements.value
    if (!targets.length) { cancel(); return }
    let applied = false
    targets.forEach(el => { applied = applyTo(el) || applied })
    if (!applied) return
    recordHistory()
    if (!locked.value) cancel()
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !active.value) return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    cancel()
  }
  document.addEventListener('keydown', onKeydown)
  onScopeDispose(() => document.removeEventListener('keydown', onKeydown))

  return { active, locked, sourceId, capturable, capture, cancel }
}

export type FormatPainter = ReturnType<typeof useFormatPainter>
