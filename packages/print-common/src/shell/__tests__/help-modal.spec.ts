// @vitest-environment happy-dom
// 帮助弹窗验收：结构与 canvas 的 HelpModal.vue 逐项一致、内容与 canvas 的 help-content 逐字一致、
// 三条关闭路径（× / Esc / 点遮罩空白处）与页签切换可用。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { h, render } from '../../core/h'
import { mountHelpModal, renderHelpModal } from '../help-modal'
import { helpSections } from '../help-content'

/**
 * 逐字比对用文件路径：不依赖 import.meta.url（vitest 下它是虚拟路径），
 * 兼容「在包目录跑」与「在仓库根跑」两种 cwd。
 */
const HELP_BASES = [
  { common: 'src/shell/help-content', canvas: '../print-canvas/src/help-content' },
  { common: 'packages/print-common/src/shell/help-content', canvas: 'packages/print-canvas/src/help-content' },
] as const

function helpFile(side: keyof (typeof HELP_BASES)[number], name: string): string {
  for (const base of HELP_BASES) {
    const p = resolve(process.cwd(), base[side], `${name}.ts`)
    if (existsSync(p)) return p
  }
  throw new Error(`找不到 help-content/${name}.ts（cwd=${process.cwd()}）`)
}
/** 把弹窗挂到一个干净容器上，返回容器 */
function paint(onClose = () => {}) {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const off = mountHelpModal(host, { onClose })
  return { host, off }
}

const q = (host: ParentNode, sel: string) => host.querySelector<HTMLElement>(sel)
const qa = (host: ParentNode, sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel))

/** happy-dom 该版本未实现 Storage：给 window 打一个最小 localStorage，供「记住页签」路径使用 */
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

beforeEach(() => {
  stubStorage()
  window.localStorage.clear()
})

describe('help-modal 结构（对照 canvas HelpModal.vue）', () => {
  it('遮罩 / 头部 / 侧栏 / 正文类名签名逐项一致', () => {
    const { host, off } = paint()
    expect(q(host, '.help-modal-overlay')).toBeTruthy()
    expect(q(host, '.help-modal')).toBeTruthy()
    expect(q(host, '.help-modal-header')).toBeTruthy()
    expect(q(host, '.help-modal-title-wrap')).toBeTruthy()
    expect(q(host, 'h2.help-modal-title')?.textContent).toBe('帮助文档')
    expect(q(host, '.help-modal-project')?.textContent).toBe('worm-vue3-print')
    expect(q(host, '.help-modal-close')?.textContent).toBe('×')
    expect(q(host, '.help-modal-close')?.title).toBe('关闭')
    expect(q(host, '.help-modal-body')).toBeTruthy()
    expect(q(host, '.help-modal-sidebar')).toBeTruthy()
    expect(q(host, '.help-modal-content > .help-content')).toBeTruthy()
    off()
  })

  it('侧栏页签顺序与文案与 canvas 一致', () => {
    const { host, off } = paint()
    expect(qa(host, '.help-tab').map(b => b.textContent)).toEqual(
      ['快速入门', '功能说明', '快捷键', '常见问题', '更新记录'],
    )
    off()
  })

  it('默认停在「快速入门」并渲染该章节正文', () => {
    const { host, off } = paint()
    expect(q(host, '.help-tab.active')?.textContent).toBe('快速入门')
    expect(q(host, '.help-content')?.textContent).toContain('三栏布局')
    off()
  })
})

describe('help-modal 内容与 canvas 逐字一致', () => {
  const sections = ['getting-started', 'features', 'shortcuts', 'faq', 'changelog'] as const

  it.each(sections)('%s 与 canvas 的同名文件内容一致（去掉本包抬头注释后逐字相同）', (name) => {
    const strip = (src: string) => src.split('\n').filter(l => !l.startsWith('//')).join('\n')
    const common = readFileSync(helpFile('common', name), 'utf8')
    const canvas = readFileSync(helpFile('canvas', name), 'utf8')
    expect(strip(common)).toBe(canvas)
  })

  it('快捷键章节含 canvas 的同款条目（组合 / 撤销 / 微调）', () => {
    const shortcuts = helpSections.find(s => s.id === 'shortcuts')?.content ?? ''
    expect(shortcuts).toContain('<code>Ctrl + G</code>')
    expect(shortcuts).toContain('组合选中元素（打印时整组强制同页）')
    expect(shortcuts).toContain('<code>Shift + 方向键</code>')
    expect(shortcuts).toContain('当焦点在输入框、文本框、下拉框内时，快捷键不生效。')
  })
})

describe('help-modal 交互', () => {
  it('点侧栏页签切换正文并高亮，且记住页签（canvas 的 localStorage 口径）', () => {
    const { host, off } = paint()
    const tabs = qa(host, '.help-tab')
    tabs[2]!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(tabs[2]!.classList.contains('active')).toBe(true)
    expect(tabs[0]!.classList.contains('active')).toBe(false)
    expect(q(host, '.help-content')?.textContent).toContain('常用操作')
    expect(window.localStorage.getItem('worm-print-help-tab')).toBe('shortcuts')
    off()
    // 再次打开：停在离开前的页签
    const again = paint()
    expect(q(again.host, '.help-tab.active')?.textContent).toBe('快捷键')
    again.off()
  })

  it('三条退出路径：× / Esc / 点遮罩空白处', () => {
    const onClose = vi.fn()
    const { host, off } = paint(onClose)
    q(host, '.help-modal-close')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    host.querySelector<HTMLElement>('.help-modal-overlay')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(3)
    off()
  })

  it('点在弹窗本体上不关闭（canvas 的 @click.self 语义）', () => {
    const onClose = vi.fn()
    const { host, off } = paint(onClose)
    q(host, '.help-modal')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()
    off()
  })

  it('卸载即摘除 document 上的 Esc 监听（不留常驻监听）', () => {
    const onClose = vi.fn()
    const { off } = paint(onClose)
    off()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renderHelpModal 只产出节点描述，挂载由调用方决定（外壳整体重绘范式）', () => {
    const host = document.createElement('div')
    document.body.replaceChildren(host)
    render(h('div', { class: 'designer-container' }), host)
    const before = host.children.length
    const el = renderHelpModal({ onClose: () => {} })
    expect(host.children.length).toBe(before)
    render(el, host)
    expect(host.querySelector('.help-modal-overlay')).toBeTruthy()
  })
})
