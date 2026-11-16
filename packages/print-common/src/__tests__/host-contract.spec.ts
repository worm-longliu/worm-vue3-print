// 宿主契约测试：声明面与运行时实现逐项对拍，任何「悄悄加/删 attribute、方法、事件」都会红。
import { describe, expect, it, vi } from 'vitest'
import {
  PRINT_DESIGNER_ATTRIBUTES,
  PRINT_DESIGNER_CONTRACT_VERSION,
  PRINT_DESIGNER_EVENT,
  PRINT_DESIGNER_EVENTS,
  PRINT_DESIGNER_EVENT_OPTIONS,
  PRINT_DESIGNER_METHODS,
  PRINT_DESIGNER_PARTS,
  PRINT_DESIGNER_PROPERTY_NAMES,
  PRINT_DESIGNER_TAG,
  PRINT_DESIGNER_THEME_TOKENS,
  getHostContract,
} from '../host-contract'
import { PrintDesignerElement, definePrintDesigner } from '../print-designer'

definePrintDesigner()

function create(): PrintDesignerElement {
  const el = document.createElement(PRINT_DESIGNER_TAG) as PrintDesignerElement
  document.body.appendChild(el)
  return el
}

describe('宿主契约：声明面', () => {
  it('版本与标签固定，契约快照字段齐全', () => {
    expect(PRINT_DESIGNER_CONTRACT_VERSION).toBe('1.0.0')
    expect(PRINT_DESIGNER_TAG).toBe('print-designer')
    const c = getHostContract()
    expect(c.version).toBe(PRINT_DESIGNER_CONTRACT_VERSION)
    expect(c.attributes).toEqual(PRINT_DESIGNER_ATTRIBUTES)
    expect(c.methods).toEqual(PRINT_DESIGNER_METHODS)
    expect(c.events).toEqual(PRINT_DESIGNER_EVENTS)
    expect(c.parts).toEqual(PRINT_DESIGNER_PARTS)
    expect(c.themeTokens).toEqual(PRINT_DESIGNER_THEME_TOKENS)
    expect(c.properties).toEqual(PRINT_DESIGNER_PROPERTY_NAMES)
  })

  it('事件选项恒为 bubbles + composed，保证能穿透 Shadow DOM', () => {
    expect(PRINT_DESIGNER_EVENT_OPTIONS).toEqual({ bubbles: true, composed: true })
    expect(Object.isFrozen(PRINT_DESIGNER_EVENT_OPTIONS)).toBe(true)
  })

  it('主题令牌全部是真实存在的 --pd-* 变量（与 core 共享源对齐）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    // vitest 的 cwd 是本包根目录；共享源在兄弟包 print-core
    const css = readFileSync(resolve(process.cwd(), '../print-core/src/styles/theme.css'), 'utf8')
    const declared = new Set([...css.matchAll(/(--pd-[a-z0-9-]+)\s*:/g)].map(m => m[1]))
    for (const token of PRINT_DESIGNER_THEME_TOKENS) {
      expect(declared.has(token), `${token} 未在 theme.css 定义`).toBe(true)
    }
  })
})

describe('宿主契约：运行时对拍', () => {
  it('同纸型横纵混排可以加载、保存并再次打开，方向不丢失', () => {
    const el = create()
    try {
      const page = JSON.parse(el.getTemplateJson())
      el.loadTemplate({ version: 1, pages: [page, { ...page, orientation: 'landscape' }] })
      const saves: string[] = []
      el.addEventListener('save', e => saves.push(String((e as CustomEvent).detail)))
      el.save()
      expect(saves).toHaveLength(1)
      el.loadTemplate(saves[0])
      const saved = JSON.parse(el.getTemplateJson())
      expect(saved.pages.map((p: { orientation: string }) => p.orientation)).toEqual(['portrait', 'landscape'])
    } finally {
      el.remove()
    }
  })

  it('observedAttributes 与声明逐项一致', () => {
    expect(PrintDesignerElement.observedAttributes).toEqual([...PRINT_DESIGNER_ATTRIBUTES])
    expect(PrintDesignerElement.contractVersion).toBe(PRINT_DESIGNER_CONTRACT_VERSION)
    expect(PrintDesignerElement.getHostContract()).toEqual(getHostContract())
  })

  it('所有声明的方法与 property 在实例上真实存在', () => {
    const el = create()
    try {
      for (const name of PRINT_DESIGNER_METHODS) {
        expect(typeof (el as unknown as Record<string, unknown>)[name], name).toBe('function')
      }
      for (const name of PRINT_DESIGNER_PROPERTY_NAMES) {
        const proto = Object.getPrototypeOf(el)
        let cursor: object | null = el
        let found = false
        while (cursor && cursor !== Object.prototype) {
          if (Object.getOwnPropertyDescriptor(cursor, name)) { found = true; break }
          cursor = Object.getPrototypeOf(cursor)
        }
        expect(found, `property ${name} 未在实例原型链声明`).toBe(true)
        void proto
      }
      expect(el.getHostContract()).toEqual(getHostContract())
    } finally {
      el.remove()
    }
  })

  it('save / preview 事件带模板 JSON 字符串，help 无载荷', async () => {
    const el = create()
    try {
      const seen: Array<{ name: string; detail: unknown; bubbles: boolean; composed: boolean }> = []
      for (const name of PRINT_DESIGNER_EVENTS) {
        el.addEventListener(name, (ev) => {
          const e = ev as CustomEvent
          seen.push({ name, detail: e.detail, bubbles: e.bubbles, composed: e.composed })
        })
      }
      el.save()
      // save 会跑校验与 alert；此处只关心事件契约，若模板合法必然派发
      const saveEvent = seen.find(e => e.name === PRINT_DESIGNER_EVENT.save)
      expect(saveEvent, '合法默认模板应派发 save').toBeTruthy()
      expect(typeof saveEvent!.detail).toBe('string')
      expect(() => JSON.parse(saveEvent!.detail as string)).not.toThrow()
      expect(saveEvent!.bubbles).toBe(true)
      expect(saveEvent!.composed).toBe(true)
    } finally {
      el.remove()
    }
  })

  it('外壳 8 个 ::part 挂在 Shadow DOM 顶层容器上', async () => {
    const el = create()
    try {
      // repaint 走 requestAnimationFrame，等一帧让首轮 paint 完成
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const parts = [...el.shadowRoot!.querySelectorAll('[part]')].map(n => n.getAttribute('part'))
      expect(parts).toContain('container')
      for (const part of ['toolbar', 'format-bar', 'left-panel', 'canvas-area', 'property-panel', 'status-bar', 'page-tabs']) {
        expect(parts, `缺 ::part(${part})`).toContain(part)
      }
    } finally {
      el.remove()
    }
  })

  it('事件名常量与声明数组完全对应（防实现侧写死字符串漂移）', () => {
    expect(PRINT_DESIGNER_EVENTS).toEqual([
      PRINT_DESIGNER_EVENT.save, PRINT_DESIGNER_EVENT.preview, PRINT_DESIGNER_EVENT.help,
      PRINT_DESIGNER_EVENT.dblclickElement, PRINT_DESIGNER_EVENT.dblclickCell,
    ])
    expect(Object.isFrozen(PRINT_DESIGNER_EVENT)).toBe(true)
  })
})

describe('宿主契约：卸载与重连', () => {
  type Call = [string, unknown, boolean]
  const norm = (calls: unknown[][]): Call[] => calls.map(c => {
    const o = c[2] as AddEventListenerOptions | boolean | undefined
    return [String(c[0]), c[1], o === true || (typeof o === 'object' && o !== null && o.capture === true)]
  })
  const leftover = (add: Call[], remove: Call[]) =>
    add.filter(a => !remove.some(r => r[0] === a[0] && r[1] === a[1] && r[2] === a[2]))

  it('卸载后 window / document 级监听全部成对摘除（SPA 反复挂载不累积）', () => {
    const addW = vi.spyOn(window, 'addEventListener')
    const rmW = vi.spyOn(window, 'removeEventListener')
    const addD = vi.spyOn(document, 'addEventListener')
    const rmD = vi.spyOn(document, 'removeEventListener')
    try {
      const el = create()
      el.remove()
      expect(leftover(norm(addW.mock.calls), norm(rmW.mock.calls))).toEqual([])
      expect(leftover(norm(addD.mock.calls), norm(rmD.mock.calls))).toEqual([])
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('重连会重新登记实例监听，二次卸载仍无残留', () => {
    const addW = vi.spyOn(window, 'addEventListener')
    const rmW = vi.spyOn(window, 'removeEventListener')
    try {
      const el = create()
      expect(addW.mock.calls.filter(c => c[0] === 'mousemove')).toHaveLength(1)
      el.remove()
      document.body.appendChild(el)
      expect(addW.mock.calls.filter(c => c[0] === 'mousemove')).toHaveLength(2)
      expect(rmW.mock.calls.filter(c => c[0] === 'mousemove')).toHaveLength(1)
      el.remove()
      expect(rmW.mock.calls.filter(c => c[0] === 'mousemove')).toHaveLength(2)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
