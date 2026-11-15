/**
 * 顶部条自适应收纳：与 canvas 的 composables/useToolbarOverflow.ts 逐字同源的移植副本。
 * 唯一判据 resolveToolbarOverflow 在 core/designer，本文件只做 Vue 指令与度量桥接。
 * 改这里必须同步 canvas 那份（两份都只进各自的框架适配层，不进主入口）。
 */
import { computed, inject, nextTick, onUnmounted, provide, reactive, ref, shallowRef } from 'vue'
import type { DirectiveBinding, InjectionKey, ObjectDirective, Ref } from 'vue'
import { resolveToolbarOverflow } from '@worm-vue3-print/core/designer'
import type { OverflowUnitInput } from '@worm-vue3-print/core/designer'

/** 收纳单元声明：id 同时用于「更多」面板的落位容器配对 */
export interface OverflowUnitDef {
  id: string
  /** 数值小者先被收进「更多」 */
  order: number
  /** 面板内分组标题 */
  label: string
}

export interface ToolbarOverflowContext {
  /** 挂载工具栏容器（度量基准） */
  attachRoot: (el: HTMLElement | null) => void
  registerUnit: (def: OverflowUnitDef, el: HTMLElement) => void
  unregisterUnit: (id: string) => void
  /** 重算收纳结果；内容宽度变化或测试注入度量后手动调用 */
  refresh: () => void
  movedIds: Ref<Set<string>>
  overflowRemains: Ref<boolean>
  hasMoved: Ref<boolean>
  /** 按收纳优先级链排序的单元声明，面板据此渲染落位槽 */
  chain: Ref<OverflowUnitDef[]>
  /** 该单元当前是否应被收起（在渲染期读取以建立依赖） */
  moved: (id: string) => boolean
  /** 该单元的落位槽元素；未收纳或槽缺失时返回占位节点（disabled 态下不会被解析） */
  slotEl: (id: string) => HTMLElement
}

/** 「更多」面板内某单元落位容器的 id：面板与单元查询据此对齐 */
export function moreSlotId(id: string) {
  return `tb-more-slot-${id}`
}

export const TOOLBAR_OVERFLOW: InjectionKey<ToolbarOverflowContext> = Symbol('worm-print-toolbar-overflow')

/** flex gap，与 .designer-toolbar 的 gap 同源 */
const GAP = 2
/**
 * 「更多」触发钮占位宽。触发钮在收纳态下才可见，无法从 DOM 量得稳定值，
 * 故按固定宽预算（CSS 侧以 .tb-more-trigger 的 padding 与文字宽度对齐此值）。
 */
const MORE_TRIGGER_WIDTH = 74

export function createToolbarOverflow(): ToolbarOverflowContext {
  const root = shallowRef<HTMLElement | null>(null)
  const unitEls = new Map<string, HTMLElement>()
  const unitDefs = reactive(new Map<string, OverflowUnitDef>())
  /** 内联态下测得的自然宽度缓存；单元被搬进面板后 offsetWidth 归零，靠缓存参与计算 */
  const widths = new Map<string, number>()
  let naturalTotal = 0

  const movedIds = ref<Set<string>>(new Set())
  const overflowRemains = ref(false)

  const chain = computed(() => [...unitDefs.values()].sort((a, b) => a.order - b.order))
  const hasMoved = computed(() => movedIds.value.size > 0)

  function measureInlineUnits() {
    for (const [id, el] of unitEls) {
      const w = el.offsetWidth
      if (w > 0) widths.set(id, w)
    }
  }

  /**
   * 自然宽与可用宽的直接累加口径。
   * 不能取容器 scrollWidth：只要还有一个子项可压缩（品牌区），容器就永不溢出，
   * scrollWidth 恒等于 clientWidth，会把「放不下」误读成「放得下」。
   * 每个子项取 max(offsetWidth, scrollWidth)：可压缩项溢出时由 scrollWidth 给出真实内容宽。
   */
  function measureToolbar(el: HTMLElement) {
    const cs = getComputedStyle(el)
    const gap = Number.parseFloat(cs.gap) || GAP
    const padL = Number.parseFloat(cs.paddingLeft) || 0
    const padR = Number.parseFloat(cs.paddingRight) || 0
    let total = 0
    for (const child of Array.from(el.children) as HTMLElement[]) {
      // 收纳面板与弹性占位不计入自然宽：前者只在发生收纳时才出现，后者吸收余量
      if (child.hasAttribute('data-overflow-more') || child.hasAttribute('data-overflow-spacer')) continue
      const w = Math.max(child.offsetWidth, child.scrollWidth)
      if (w <= 0) continue
      total += w + gap
    }
    return { available: el.clientWidth - padL - padR, natural: total }
  }

  function refresh() {
    const el = root.value
    if (!el) return
    const { available, natural } = measureToolbar(el)

    const wasMoved = movedIds.value.size > 0
    if (!wasMoved) {
      naturalTotal = natural
      measureInlineUnits()
    }

    const inputs: OverflowUnitInput[] = chain.value.map((def) => ({
      id: def.id,
      order: def.order,
      width: widths.get(def.id) ?? 0,
    }))
    const pinned = inputs.reduce((sum, u) => sum - u.width - GAP, naturalTotal)
    const result = resolveToolbarOverflow({
      available,
      pinned,
      moreTriggerWidth: MORE_TRIGGER_WIDTH,
      gap: GAP,
      units: inputs,
    })

    // 结果未变时不替换 Set：换引用会让所有单元重渲染，进而触发注册→重算→重渲染的自激环
    const unchanged = result.movedIds.length === movedIds.value.size
      && result.movedIds.every((id) => movedIds.value.has(id))
    if (!unchanged) movedIds.value = new Set(result.movedIds)
    overflowRemains.value = result.overflowRemains

    // 由收纳态回到全展开后，DOM 已换回内联位置，需再量一次真实宽度
    if (wasMoved && movedIds.value.size === 0) nextTick(refresh)
  }

  let resizeObserver: ResizeObserver | null = null

  function attachRoot(next: HTMLElement | null) {
    if (next === root.value) return
    resizeObserver?.disconnect()
    root.value = next
    if (next && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => refresh())
      resizeObserver.observe(next)
    }
    nextTick(refresh)
  }

  function registerUnit(def: OverflowUnitDef, el: HTMLElement) {
    unitDefs.set(def.id, def)
    unitEls.set(def.id, el)
    nextTick(refresh)
  }

  function unregisterUnit(id: string) {
    unitEls.delete(id)
    unitDefs.delete(id)
    widths.delete(id)
    nextTick(refresh)
  }

  /** Teleport 目标必须传元素：disabled 翻转时 Vue 不会重新解析 selector 字符串 */
  const orphanSlot = document.createElement('div')

  function moved(id: string) {
    return movedIds.value.has(id)
  }

  function slotEl(id: string) {
    void movedIds.value
    // 用 data-overflow-slot 属性而不是类名做契约：宿主可以完全自定义面板样式，
    // 只要落位容器带上这个属性就能被找到（同页多设计器时用本实例根节点收窄范围）。
    return root.value?.querySelector<HTMLElement>(`[data-overflow-slot="${id}"]`) ?? orphanSlot
  }

  onUnmounted(() => resizeObserver?.disconnect())

  return {
    attachRoot,
    registerUnit,
    unregisterUnit,
    refresh,
    movedIds,
    overflowRemains,
    hasMoved,
    chain,
    moved,
    slotEl,
  }
}

/** 由工具栏一侧创建并 provide；缺上下文时收纳单元退化为纯内联 */
export function provideToolbarOverflow(): ToolbarOverflowContext {
  const ctx = createToolbarOverflow()
  provide(TOOLBAR_OVERFLOW, ctx)
  return ctx
}

export function useToolbarOverflow(): ToolbarOverflowContext | null {
  return inject(TOOLBAR_OVERFLOW, null)
}

/**
 * 空上下文：格式栏被单独挂载（组件级单测）或宿主没有工具栏时使用。
 * 单元一律内联，Teleport 恒 disabled，因此不会有 DOM 搬运副作用。
 */
export function emptyToolbarOverflow(): ToolbarOverflowContext {
  const movedIds = ref<Set<string>>(new Set())
  const orphan = document.createElement('div')
  return {
    attachRoot: () => {},
    registerUnit: () => {},
    unregisterUnit: () => {},
    refresh: () => {},
    movedIds,
    overflowRemains: ref(false),
    hasMoved: computed(() => false),
    chain: computed(() => []),
    moved: () => false,
    slotEl: () => orphan,
  }
}

/**
 * v-overflow-unit：把元素注册为收纳单元。
 * 必须是指令而不是包装组件——Vue 只把宿主 scoped 属性（data-v-*）挂到「子组件的根元素」上，
 * 而收纳单元的根是 Teleport（非元素节点），一旦用组件包一层，元素就拿不到宿主作用域，
 * .tb-group / .ft-group 等 scoped 规则全部落空，退化成 display:block 把子项竖排。
 */
export function createOverflowUnitDirective(
  ctx: ToolbarOverflowContext,
): ObjectDirective<HTMLElement, OverflowUnitDef> {
  return {
    mounted(el, binding: DirectiveBinding<OverflowUnitDef>) {
      // 顺带打上 data-unit，供面板落位与外部诊断按 id 定位，避免模板里再写一遍
      el.dataset.unit = binding.value.id
      ctx.registerUnit(binding.value, el)
    },
    unmounted(_el, binding: DirectiveBinding<OverflowUnitDef>) {
      ctx.unregisterUnit(binding.value.id)
    },
  }
}
