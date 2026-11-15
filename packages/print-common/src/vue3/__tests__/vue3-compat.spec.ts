// @vitest-environment happy-dom
// Vue 3 兼容门面的契约回归：宿主按 canvas 的写法传 props / 监听 emits / 调 ref 方法，
// 门面必须把它们无损翻译给 <print-designer>，尤其是「对象与函数不能被字符串化」、
// 「save 首参是 JSON 字符串」、「getTemplateJson 返回对象」这三处与 Custom Element 的硬差异。
import { createApp, h, nextTick, reactive, ref } from 'vue'
import type { App } from 'vue'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createDefaultTemplate } from '../../core/default-template'
import type { PrintDesignerElement } from '../../print-designer'
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/core/designer'
import { PrintDesigner } from '../PrintDesigner'
import { PrintHtmlPreview } from '../PrintHtmlPreview'
import type { PrintDesignerExpose } from '../PrintDesigner'
import * as vue3 from '../index'

/** happy-dom 该版本未实现 Storage：面板折叠态读写需要 localStorage */
function stubStorage() {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => { map.set(k, String(v)) },
      removeItem: (k: string) => { map.delete(k) },
      clear: () => map.clear(),
    },
  })
}

// 标尺绘制与码制测量都要 canvas 2d 上下文，happy-dom 不实现；与既有 spec 同款 Proxy 兜底
const ctxTarget: Record<string, unknown> = { measureText: (t: unknown) => ({ width: String(t).length * 8 }) }
const noopCtx: Record<string, unknown> = new Proxy(ctxTarget, {
  get: (target, prop) => (prop in target ? target[prop as string] : () => noopCtx),
  set: () => true,
})
;(HTMLCanvasElement.prototype as unknown as { getContext: (t: string) => unknown }).getContext = () => noopCtx

beforeAll(stubStorage)

const FIELD_A: PrintBusinessField = {
  fieldKey: 'orderNo', fieldLabel: '订单号', fieldType: 'string', sortOrder: 0,
}
const uploadA = vi.fn(async () => 'data:image/png;base64,A')
const uploadB = vi.fn(async () => 'data:image/png;base64,B')

interface HostState {
  initialTemplate?: TemplateData
  fields?: PrintBusinessField[]
  fonts?: readonly { family: string }[]
  designData?: Record<string, unknown>
  uploadImage?: typeof uploadA
  uploadDesignBackground?: typeof uploadA
  isEdit?: boolean
  showHelp?: boolean
}

const apps: App[] = []
const hosts: HTMLElement[] = []

function mount(initial: HostState = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)

  const state = reactive<HostState>({ ...initial })
  const saved: string[] = []
  const previewHits: number[] = []
  const apiRef = ref<PrintDesignerExpose | null>(null)

  // Vue 的 h() 对「可选 prop 显式传 undefined」推断过严，这里要模拟宿主未传态；
  // 断言绕过只作用于测试脚手架，运行时走的仍是组件真实的 props 声明。
  // 必须每次渲染重新求值，否则 reactive state 的更新会被快照吃掉。
  const bindings = () => ({
    ref: apiRef,
    initialTemplate: state.initialTemplate,
    fields: state.fields,
    fonts: state.fonts,
    designData: state.designData,
    uploadImage: state.uploadImage,
    uploadDesignBackground: state.uploadDesignBackground,
    isEdit: state.isEdit,
    showHelp: state.showHelp,
    onSave: (json: string) => { saved.push(json) },
    onPreview: () => { previewHits.push(1) },
  }) as any

  const app = createApp({
    setup: () => () => h(PrintDesigner, bindings()),
  })
  app.mount(host)
  apps.push(app)

  const el = host.querySelector('print-designer') as PrintDesignerElement
  return { host, el, state, saved, previewHits, apiRef }
}

afterEach(() => {
  while (apps.length) apps.pop()!.unmount()
  while (hosts.length) hosts.pop()!.remove()
})

describe('PrintDesigner 门面：props → element property', () => {
  it('对象与函数不被 setAttribute 字符串化，元素已升级且有 shadow root', () => {
    const template = createDefaultTemplate()
    const fonts = [{ family: 'DemoFont' }]
    const { el } = mount({
      initialTemplate: template,
      fields: [FIELD_A],
      fonts,
      designData: { trend: [1, 2] },
      uploadImage: uploadA,
      uploadDesignBackground: uploadB,
      isEdit: true,
      showHelp: true,
    })

    expect(customElements.get('print-designer')).toBeDefined()
    expect(el.shadowRoot?.querySelector('.designer-container')).toBeTruthy()
    expect(el.uploadImage).toBe(uploadA)
    expect(el.uploadDesignBackground).toBe(uploadB)
    expect(el.fonts).toEqual(fonts)
    // designData 是单对象信封，归一后成数组
    expect(el.designData).toEqual([{ trend: [1, 2] }])
    // fields 只有 setter，读回走 store
    expect((el as unknown as { store: { fields: PrintBusinessField[] } }).store.fields).toEqual([FIELD_A])
    expect(el.getAttribute('is-edit')).toBe('true')
    expect(el.getAttribute('show-help')).toBe('true')
    // 模板进了 store，而不是被写成 attribute 里的 "[object Object]"
    expect(el.getAttribute('template')).toBeNull()
    expect((JSON.parse(el.template as string) as TemplateData).paperSize).toBe('A4')
  })

  it('不传可选布尔 props 时不擅自改写元素默认值', () => {
    const { el } = mount({ fields: [] })
    expect(el.hasAttribute('is-edit')).toBe(false)
    expect(el.hasAttribute('show-help')).toBe(false)
  })

  it('props 变化会重新赋 property（fields 进 store、上传函数换引用）', async () => {
    const { el, state } = mount({ fields: [FIELD_A], uploadImage: uploadA })
    const nextField: PrintBusinessField = {
      fieldKey: 'amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 1,
    }

    state.fields = [nextField]
    state.uploadImage = uploadB
    await nextTick()

    expect((el as unknown as { store: { fields: PrintBusinessField[] } }).store.fields).toEqual([nextField])
    expect(el.uploadImage).toBe(uploadB)
  })
})

describe('PrintDesigner 门面：CustomEvent → Vue emit', () => {
  it('save 把 detail 解成字符串首参，宿主 onSave 收到的不是 Event', () => {
    const { el, saved } = mount()
    el.dispatchEvent(new CustomEvent('save', { detail: '{"paperSize":"A4"}' }))
    expect(saved).toEqual(['{"paperSize":"A4"}'])
  })

  it('preview 转成无参 emit', () => {
    const { el, previewHits } = mount()
    el.dispatchEvent(new CustomEvent('preview', { detail: 'ignored' }))
    expect(previewHits).toHaveLength(1)
  })

  it('卸载后移除监听，不再向已销毁的宿主派发', () => {
    const { el, saved } = mount()
    const app = apps.pop()!
    app.unmount()
    el.dispatchEvent(new CustomEvent('save', { detail: '{}' }))
    expect(saved).toEqual([])
  })
})

describe('PrintDesigner 门面：expose 与 canvas 同形', () => {
  it('getTemplateJson 返回对象，validateTemplate / getGeometryWarnings 返回数组', () => {
    const { apiRef } = mount({ initialTemplate: createDefaultTemplate() })
    const api = apiRef.value
    expect(api).toBeTruthy()
    const json = api!.getTemplateJson()
    expect(typeof json).toBe('object')
    expect(Array.isArray(json)).toBe(false)
    expect((json as TemplateData).paperSize).toBe('A4')
    expect(Array.isArray(api!.validateTemplate())).toBe(true)
    expect(Array.isArray(api!.getGeometryWarnings())).toBe(true)
  })
})

describe('PrintHtmlPreview 门面', () => {
  it('根节点类名、iframe、幂等样式注入与 expose 齐备', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const app = createApp(PrintHtmlPreview)
    apps.push(app)
    const vm = app.mount(host) as unknown as {
      print: () => void
      rerender: () => void
      setViewZoom: (key: string) => void
    }

    expect(host.querySelector('.print-html-preview.pcv3-preview')).toBeTruthy()
    expect(host.querySelector('iframe.print-html-preview-iframe')).toBeTruthy()
    expect(document.getElementById('worm-print-common-vue3-preview')).toBeTruthy()
    expect(document.querySelectorAll('#worm-print-common-vue3-preview')).toHaveLength(1)
    expect(typeof vm.print).toBe('function')
    expect(typeof vm.rerender).toBe('function')
    expect(typeof vm.setViewZoom).toBe('function')
  })
})

describe('/vue3 导出面', () => {
  it('覆盖 canvas 宿主实际 import 的全部符号', () => {
    // 逐项对应 demo/src/App.vue:154-161 的导入清单
    const required = [
      'PrintDesigner', 'PrintHtmlPreview', 'DEFAULT_DEMO_DATA', 'createDefaultTemplate',
      'provideToolbarOverflow', 'createOverflowUnitDirective',
      // canvas 其余常用导出也一并提供
      'PrintHtmlPreview', 'renderHtmlPages', 'browserCodeRenderer', 'toRuntimePool',
      'getDemoData', 'useToolbarOverflow', 'emptyToolbarOverflow', 'TOOLBAR_OVERFLOW', 'moreSlotId',
    ]
    for (const key of required) {
      expect((vue3 as unknown as Record<string, unknown>)[key], key).toBeDefined()
    }
    expect(typeof vue3.createOverflowUnitDirective(vue3.emptyToolbarOverflow())).toBe('object')
  })
})
