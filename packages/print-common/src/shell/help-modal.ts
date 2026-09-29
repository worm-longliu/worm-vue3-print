// 帮助弹窗：移植 print-canvas/src/components/HelpModal.vue（无框架版）。
// 类名与 canvas 逐字一致（样式由 scripts/gen-styles.mjs 从 canvas 派生，只认类名）：
//   .help-modal-overlay > .help-modal > .help-modal-header > .help-modal-title-wrap
//     > h2.help-modal-title + span.help-modal-project ; button.help-modal-close
//   .help-modal-body > .help-modal-sidebar > button.help-tab(.active)
//   .help-modal-body > .help-modal-content > .help-content（v-html 同源的静态片段）
// 章节数据直接复用 ./help-content（逐字复制自 canvas 的 help-content 目录），本文件不写文案。
//
// ─── 与 canvas 的接线差异 ─────────────────────────────────────────
//   canvas：props.visible 控显隐 + emit('close')；document 上挂 keydown 处理 Esc；
//           Teleport 到 body；<Transition name="help-modal"> 做 0.2s 淡入淡出。
//   本包：外壳是整体重绘模型，弹窗必须挂在 shadow root 上（.designer-container 的兄弟节点），
//         由 print-designer.ts 的 helpVisible + syncHelp() 决定 DOM 存在与否（同表达式编辑器范式）；
//         mountHelpModal 登记一次性 document keydown，卸载即摘；无进出场过渡（见 PARITY §八）。
import { helpSections } from './help-content'
import { h, render } from '../core/h'
import type { El } from '../core/h'

/** 与 canvas 同款 key：同一浏览器里两侧记住的是同一个页签 */
const STORAGE_KEY = 'worm-print-help-tab'
const DEFAULT_TAB = 'getting-started'

export interface HelpModalOptions {
  /** 首次打开的页签（canvas 的 initialTab，默认「快速入门」） */
  initialTab?: string
  onClose: () => void
}

function knownTab(id: string | null | undefined): string {
  return helpSections.some(s => s.id === id) ? String(id) : ''
}

/** 上次的页签优先（canvas 在 onMounted 与 watch(visible) 两处读同一份存储，口径一致） */
function resolveTab(initial?: string): string {
  let saved: string | null = null
  try {
    // 显式 window. 前缀：happy-dom 下 localStorage 不挂在 globalThis 上，浏览器行为一致
    saved = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null // 隐私模式或存储不可用：回落到 initialTab
  }
  return knownTab(saved) || knownTab(initial) || DEFAULT_TAB
}

/** 渲染帮助弹窗（调用方负责挂到 shadow root 上） */
export function renderHelpModal(opts: HelpModalOptions): El {
  const active = resolveTab(opts.initialTab)

  /** 切页签：canvas 由响应式重算 currentContent，这里只定点改高亮与正文，不重建弹窗 */
  const switchTab = (ev: Event, tabId: string) => {
    const btn = ev.currentTarget as HTMLElement
    const dialog = btn.closest('.help-modal')
    if (!dialog) return
    for (const tab of Array.from(dialog.querySelectorAll<HTMLElement>('.help-tab'))) {
      tab.classList.toggle('active', tab === btn)
    }
    const body = dialog.querySelector<HTMLElement>('.help-content')
    if (body) body.innerHTML = helpSections.find(s => s.id === tabId)?.content ?? ''
    try {
      window.localStorage.setItem(STORAGE_KEY, tabId)
    } catch {
      // 持久化失败只影响「记住页签」，不影响阅读
    }
  }

  return h('div', {
    class: 'help-modal-overlay',
    tabindex: '-1',
    // canvas 的 @click.self：点在遮罩空白处才关，落在弹窗本体不关
    onClick: (ev: MouseEvent) => { if (ev.target === ev.currentTarget) opts.onClose() },
    onKeydown: (ev: KeyboardEvent) => { if (ev.key === 'Escape') opts.onClose() },
  }, [
    h('div', { class: 'help-modal' }, [
      h('div', { class: 'help-modal-header' }, [
        h('div', { class: 'help-modal-title-wrap' }, [
          h('h2', { class: 'help-modal-title', text: '帮助文档' }),
          h('span', { class: 'help-modal-project', text: 'worm-vue3-print' }),
        ]),
        h('button', {
          type: 'button', class: 'help-modal-close', title: '关闭', text: '×',
          onClick: () => opts.onClose(),
        }),
      ]),
      h('div', { class: 'help-modal-body' }, [
        h('div', { class: 'help-modal-sidebar' }, helpSections.map(item => h('button', {
          type: 'button',
          class: `help-tab${item.id === active ? ' active' : ''}`,
          text: item.title,
          onClick: (ev: Event) => switchTab(ev, item.id),
        }))),
        h('div', { class: 'help-modal-content' }, [
          h('div', {
            class: 'help-content',
            html: helpSections.find(s => s.id === active)?.content ?? '',
          }),
        ]),
      ]),
    ]),
  ])
}

/**
 * 挂载弹窗并返回卸载函数。Esc 监听挂在 document（与 canvas 一致：焦点不在遮罩内也能关），
 * 卸载时一并摘除，不留常驻监听。
 */
export function mountHelpModal(
  parent: Element | ShadowRoot,
  opts: HelpModalOptions,
): () => void {
  const node = render(renderHelpModal(opts), parent) as HTMLElement
  const onKeydown = (ev: KeyboardEvent) => { if (ev.key === 'Escape') opts.onClose() }
  document.addEventListener('keydown', onKeydown)
  // 焦点落到遮罩上，键盘用户不必再 Tab 一次
  node.focus?.()
  return () => {
    document.removeEventListener('keydown', onKeydown)
    node.remove()
  }
}
