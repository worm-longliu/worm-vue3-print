// @vitest-environment happy-dom
// 字段树长名称显示（common 侧）：与 canvas FieldTreePanel.spec.ts 同口径——
// .node-meta 包裹中文名与变量名，整行 data-tip 与分组 data-tip 带出完整文本（浮层由 print-designer 的 JS 提示承担）。
// 单击字段行复制字段中文名（Gitee #IKRIZM）：与 canvas 同口径，复制成功后行内出现「已复制」。
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { PrintBusinessField } from '@worm-vue3-print/core/designer'
import { DesignerStore } from '../../core/store'
import { FormatToolbar } from '../../core/format'
import { render, clear } from '../../core/h'
import type { ShellCtx, ShellState } from '../controls'
import { renderLeftPanel } from '../panels'

const LONG_LABEL = '客户签收备注（加急）'
const LONG_KEY = 'customer.receiptRemark.urgentHandling'
const ROW_TIP = `${LONG_LABEL} (${LONG_KEY}) · 单击复制字段名`

const fields: PrintBusinessField[] = [
  { id: '1', fieldKey: 'customer', fieldLabel: '客户信息', fieldType: 'string', sortOrder: 1 },
  { id: '2', fieldKey: LONG_KEY, fieldLabel: LONG_LABEL, fieldType: 'string', sortOrder: 2 },
]

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true })
})

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
  return writeText
}

function makeState(): ShellState {
  return {
    leftTab: 'fields', leftCollapsed: false, propTab: 'element', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
}

function paint() {
  const store = new DesignerStore()
  store.fields = fields
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  const ctx: ShellCtx = {
    store, format: new FormatToolbar(store), state: makeState(),
    // 与真实外壳一致：复制成功后由 repaint 重画左栏（整体重绘模型）。
    // 必须先 clear——render 只 append，不清空会留下重绘前的旧行，断言就命中了旧 DOM。
    repaint: () => { clear(host); render(renderLeftPanel(ctx), host) },
    fire: () => {}, showHelp: true, isEdit: false,
    host: { fonts: [] },
  }
  render(renderLeftPanel(ctx), host)
  return host
}

/** 复制走 Promise，等一轮宏任务让 repaint 落地 */
function flush() {
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

const rowOf = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('.field-row'))
  .find(r => r.textContent?.includes(LONG_KEY))!

describe('素材台字段树长字段显示', () => {
  it('字段行用 node-meta 包裹中文名与变量名', () => {
    const host = paint()
    const row = rowOf(host)
    expect(row.querySelector('.node-meta')).toBeTruthy()
    expect(row.querySelector('.node-meta > .node-label')?.textContent).toBe(LONG_LABEL)
    expect(row.querySelector('.node-meta > .node-key')?.textContent).toBe(`(${LONG_KEY})`)
  })

  it('整行 data-tip 带出完整中文名与变量名，不残留原生 title', () => {
    const host = paint()
    const row = rowOf(host)
    expect(row.getAttribute('data-tip')).toBe(ROW_TIP)
    expect(row.getAttribute('title')).toBeNull()
  })

  it('分组标题 data-tip 带出完整分组名', () => {
    const host = paint()
    expect(host.querySelector('.field-group-header .group-label')?.getAttribute('data-tip')).toBe('客户信息')
  })
})

describe('素材台字段树单击复制字段名（common）', () => {
  it('单击字段行复制中文名并显示「已复制」', async () => {
    const writeText = stubClipboard()
    const host = paint()
    rowOf(host).click()
    await flush()
    expect(writeText).toHaveBeenCalledWith(LONG_LABEL)
    expect(rowOf(host).querySelector('.copy-hint')?.textContent).toBe('已复制')
  })
})
