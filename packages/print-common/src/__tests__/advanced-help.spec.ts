// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { DesignerStore } from '../core/store'
import { PrintDesignerElement, definePrintDesigner } from '../print-designer'

function stubStorage() {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, String(value)) },
      removeItem: (key: string) => { map.delete(key) },
      clear: () => { map.clear() },
    },
  })
}

function frame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

async function mountDesigner() {
  definePrintDesigner()
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const el = document.createElement('print-designer') as PrintDesignerElement
  host.appendChild(el)
  const store = (el as unknown as { store: DesignerStore }).store
  store.addElement('text', { left: 10, top: 10, width: 40, height: 10, formatter: '附件单据' })
  store.selectOne(store.elements[0]!.id)
  await frame()
  return { root: el.shadowRoot! }
}

beforeEach(() => {
  stubStorage()
  window.localStorage.setItem('property-group-advanced', 'true')
  window.localStorage.setItem('worm-print-help-tab', 'faq')
})

describe('common 高级设置帮助', () => {
  it('点击分组右侧帮助图标：展开对应章节且不重绘分组', async () => {
    const { root } = await mountDesigner()
    const group = [...root.querySelectorAll<HTMLElement>('.property-group')]
      .find(item => item.querySelector('.group-title')?.textContent === '高级设置')!
    const expanded = group.classList.contains('is-expanded')
    const help = group.querySelector<HTMLButtonElement>('.group-help')
    expect(help).toBeTruthy()

    help!.click()
    await frame()

    expect(group.classList.contains('is-expanded')).toBe(expanded)
    expect(root.querySelector('.help-tab.active')?.textContent).toBe('高级设置')
    const content = root.querySelector('.help-content')?.textContent ?? ''
    expect(content).toContain('每页固定')
    expect(content).toContain('右侧')
    expect(content).toContain('每页重复')

    root.querySelector<HTMLButtonElement>('.help-modal-close')!.click()
    await frame()
    expect(root.querySelector('.help-modal-overlay')).toBeNull()
  })

  it('普通工具栏帮助仍使用记住的页签', async () => {
    const { root } = await mountDesigner()
    root.querySelector<HTMLButtonElement>('.help-button')!.click()
    await frame()

    expect(root.querySelector('.help-tab.active')?.textContent).toBe('常见问题')
  })
})
