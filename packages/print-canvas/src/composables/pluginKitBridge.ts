// @worm-vue3-print/plugin-kit 的 Vue 桥接层：把框架无关的 ElementUI 适配成 canvas
// 既有扩展组件契约（画布组件 props 与内置元素一致；属性组件 props element/data + change 事件）。
//
// 设计要点：
// - 桥接组件按 (type, UI 实例) 缓存：getElementExtensions() 每次返回新对象，但组件身份必须稳定，
//   否则画布/属性台会在每次重算时重挂载（输入焦点与插件内部状态全部丢失）。
// - 渲染结果是 HTML 字符串、DOM 节点或 { node, dispose }，统一由本层挂到容器内并管理 dispose。
// - 属性台 update 写回 element.options 后只发 change、不立刻重渲染自身 DOM（避免输入焦点丢失）；
//   外部变更（撤销/重做等）仍走 watch 重渲染。
// - ui.styles 注入 document.head（按 type 幂等），注册态变化时重新同步。
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowReactive, watch } from 'vue'
import type { Component, PropType } from 'vue'
import type { ElementOptions, PrintBusinessField, RuntimeElement } from '@worm-vue3-print/core/designer'
import { getElementUI, getElementUIs, subscribeElementUIRegistry } from '@worm-vue3-print/plugin-kit'
import type {
  ElementUI,
  ElementUIPropertyContext,
  ElementUIRenderResult,
  ElementUIResultObject,
} from '@worm-vue3-print/plugin-kit'

/** plugin-kit 注册态版本号：canvas 侧 computed 读取它以感知注册/注销（core 插件注册表本身非响应式） */
export const pluginKitVersion = shallowReactive({ value: 0 })

interface CachedBridgeComponent {
  ui: ElementUI
  component: Component
}

const canvasComponentCache = new Map<string, CachedBridgeComponent>()
const propertyComponentCache = new Map<string, CachedBridgeComponent>()

const STYLE_ATTR = 'data-plugin-kit-style'
const injectedStyles = new Map<string, HTMLStyleElement>()

/** 按 type 同步 plugin-kit 样式到 document.head：幂等注入、移除已注销 type 的样式 */
export function syncPluginKitStyles(): void {
  if (typeof document === 'undefined') return
  const wanted = new Set<string>()
  for (const ui of getElementUIs()) {
    if (!ui.styles) continue
    for (const type of ui.types) wanted.add(type)
  }
  for (const [type, element] of injectedStyles) {
    if (wanted.has(type)) continue
    element.remove()
    injectedStyles.delete(type)
  }
  for (const type of wanted) {
    if (injectedStyles.has(type)) continue
    const styles = getElementUI(type)?.styles
    if (!styles) continue
    const element = document.createElement('style')
    element.setAttribute(STYLE_ATTR, type)
    element.textContent = styles
    document.head.appendChild(element)
    injectedStyles.set(type, element)
  }
}

/** 移除全部 plugin-kit 注入样式（宿主清理/热重载用） */
export function removePluginKitStyles(): void {
  for (const element of injectedStyles.values()) element.remove()
  injectedStyles.clear()
}

function isResultObject(result: ElementUIRenderResult): result is ElementUIResultObject {
  return typeof result === 'object' && result !== null && 'node' in result
}

/** 把渲染结果挂进容器，返回 dispose（仅 { node, dispose } 形态提供） */
function applyRenderResult(container: HTMLElement, result: ElementUIRenderResult): (() => void) | undefined {
  if (isResultObject(result)) {
    const { node, dispose } = result
    if (typeof node === 'string') container.innerHTML = node
    else container.replaceChildren(node)
    return dispose
  }
  if (typeof result === 'string') container.innerHTML = result
  else container.replaceChildren(result)
  return undefined
}

function safeDispose(dispose: (() => void) | undefined): void {
  if (!dispose) return
  try {
    dispose()
  } catch {
    // 第三方 dispose 抛错不能污染画布/属性台
  }
}

/** 画布桥接组件：props 与内置元素组件一致，watch options 深度 + 元素 type 重绘，卸载 dispose */
function createCanvasBridge(ui: ElementUI, type: string): Component {
  return defineComponent({
    name: `PluginKitCanvasBridge(${type})`,
    props: {
      element: { type: Object as PropType<RuntimeElement>, required: true },
      data: { type: Array as PropType<readonly Record<string, unknown>[]>, default: () => [] },
      designMode: { type: Boolean, default: false },
    },
    setup(props) {
      const host = ref<HTMLElement>()
      let dispose: (() => void) | undefined
      let unmounted = false

      function release(): void {
        const current = dispose
        dispose = undefined
        safeDispose(current)
      }

      function paintFallback(container: HTMLElement): void {
        release()
        container.classList.add('plugin-kit-canvas--error')
        container.textContent = `元素 ${type} 渲染失败`
      }

      function paint(): void {
        const container = host.value
        if (!container || unmounted) return
        release()
        let rendered: ElementUIRenderResult
        try {
          rendered = ui.renderCanvas({
            element: props.element,
            data: props.data,
            designMode: props.designMode,
          })
        } catch {
          paintFallback(container)
          return
        }
        try {
          container.classList.remove('plugin-kit-canvas--error')
          dispose = applyRenderResult(container, rendered)
        } catch {
          paintFallback(container)
        }
      }

      watch(() => props.element.options, paint, { deep: true })
      watch(() => props.element.printElementType?.type, paint)
      onMounted(paint)
      onBeforeUnmount(() => {
        unmounted = true
        release()
      })

      return () => h('div', { ref: host, class: 'plugin-kit-canvas' })
    },
  })
}

/** 属性台桥接组件：update 写回 element.options 并 emit('change')，外部变更才重渲染 */
function createPropertyBridge(
  ui: ElementUI,
  type: string,
  renderProperty: NonNullable<ElementUI['renderProperty']>,
): Component {
  return defineComponent({
    name: `PluginKitPropertyBridge(${type})`,
    props: {
      element: { type: Object as PropType<RuntimeElement>, required: true },
      data: { type: Array as PropType<readonly Record<string, unknown>[]>, default: () => [] },
      /** 宿主业务字段：图表类插件据此生成数据源/字段映射下拉 */
      fields: { type: Array as PropType<readonly PrintBusinessField[]>, default: () => [] },
    },
    emits: ['change'],
    setup(props, { emit }) {
      const host = ref<HTMLElement>()
      let dispose: (() => void) | undefined
      let unmounted = false
      // update 写回 options 会触发下方 watch；在本次 tick 内抑制，避免重建 DOM 丢输入焦点
      let suppressSelfPaint = false
      let repaintScheduled = false

      function release(): void {
        const current = dispose
        dispose = undefined
        safeDispose(current)
      }

      function paintFallback(container: HTMLElement): void {
        release()
        container.classList.add('plugin-kit-property--error')
        container.textContent = `属性 ${type} 渲染失败`
      }

      function scheduleRepaint(): void {
        if (repaintScheduled || unmounted) return
        repaintScheduled = true
        void nextTick(() => {
          repaintScheduled = false
          if (!unmounted) paint()
        })
      }

      function paint(): void {
        const container = host.value
        if (!container || unmounted) return
        release()
        const ctx: ElementUIPropertyContext = {
          element: props.element,
          data: props.data,
          fields: props.fields,
          update(partial: Partial<ElementOptions>) {
            if (unmounted) return
            suppressSelfPaint = true
            Object.assign(props.element.options, partial)
            emit('change')
            // 必须在 options 变更后注册：Vue 的 watch flush 已被排队，本回调在其后执行，
            // 才能保证「抑制标记在本次 watch 内有效」。
            void nextTick(() => {
              suppressSelfPaint = false
            })
          },
          repaint: scheduleRepaint,
        }
        let rendered: ElementUIRenderResult
        try {
          rendered = renderProperty(ctx)
        } catch {
          paintFallback(container)
          return
        }
        try {
          container.classList.remove('plugin-kit-property--error')
          dispose = applyRenderResult(container, rendered)
        } catch {
          paintFallback(container)
        }
      }

      watch(
        () => props.element.options,
        () => {
          if (suppressSelfPaint) return
          paint()
        },
        { deep: true },
      )
      onMounted(paint)
      onBeforeUnmount(() => {
        unmounted = true
        release()
      })

      return () => h('div', { ref: host, class: 'plugin-kit-property' })
    },
  })
}

/** 取（并按缓存复用）某元素类型的画布桥接组件；该 type 未注册 plugin-kit UI 时为 undefined */
export function getPluginKitCanvasComponent(type: string): Component | undefined {
  const ui = getElementUI(type)
  if (!ui) {
    canvasComponentCache.delete(type)
    return undefined
  }
  const cached = canvasComponentCache.get(type)
  if (cached?.ui === ui) return cached.component
  const component = createCanvasBridge(ui, type)
  canvasComponentCache.set(type, { ui, component })
  return component
}

/** 取（并按缓存复用）某元素类型的属性台桥接组件；未提供 renderProperty 时为 undefined */
export function getPluginKitPropertyComponent(type: string): Component | undefined {
  const ui = getElementUI(type)
  const renderProperty = ui?.renderProperty
  if (!ui || !renderProperty) {
    propertyComponentCache.delete(type)
    return undefined
  }
  const cached = propertyComponentCache.get(type)
  if (cached?.ui === ui) return cached.component
  const component = createPropertyBridge(ui, type, renderProperty)
  propertyComponentCache.set(type, { ui, component })
  return component
}

// 注册/注销 plugin-kit UI 时：版本号驱动 Vue 侧刷新，样式随之同步。
subscribeElementUIRegistry(() => {
  pluginKitVersion.value++
  syncPluginKitStyles()
})
syncPluginKitStyles()
