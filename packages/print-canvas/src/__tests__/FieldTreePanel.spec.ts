// 字段树长名称显示契约：中文名与变量名包进 .node-meta，最多两行、每行放不下时各自省略；
// 整行 data-tip 带出完整中文名与变量名，悬停 300ms 后由 .pd-hover-tip 浮层看全（侧栏会裁掉 CSS 气泡）。
// 单击字段行复制字段中文名（Gitee #IKRIZM）：复制成功后在行内出现「已复制」，拖拽起手不复制。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FieldTreePanel from '../components/FieldTreePanel.vue'
import type { PrintBusinessField } from '@worm-vue3-print/core/designer'

const LONG_LABEL = '客户签收备注（加急）'
const LONG_KEY = 'customer.receiptRemark.urgentHandling'
const ROW_TIP = `${LONG_LABEL} (${LONG_KEY}) · 单击复制字段名 · Ctrl/⌘+拖动插入字段名`

const fields: PrintBusinessField[] = [
  { id: '1', fieldKey: 'customer', fieldLabel: '客户信息', fieldType: 'string', sortOrder: 1 },
  { id: '2', fieldKey: LONG_KEY, fieldLabel: LONG_LABEL, fieldType: 'string', sortOrder: 2 },
]

function mountPanel() {
  return mount(FieldTreePanel, { props: { fields } })
}

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

describe('FieldTreePanel 长字段显示', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('字段行用 node-meta 包裹中文名与变量名', () => {
    const w = mountPanel()
    const row = w.findAll('.field-row').find(r => r.text().includes(LONG_KEY))!
    expect(row.find('.node-meta').exists()).toBe(true)
    expect(row.find('.node-meta > .node-label').text()).toBe(LONG_LABEL)
    expect(row.find('.node-meta > .node-key').text()).toBe(`(${LONG_KEY})`)
  })

  it('整行 data-tip 带出完整中文名与变量名，不残留原生 title', () => {
    const w = mountPanel()
    const row = w.findAll('.field-row').find(r => r.text().includes(LONG_KEY))!
    expect(row.attributes('data-tip')).toBe(ROW_TIP)
    expect(row.attributes('title')).toBeUndefined()
  })

  it('分组标题 data-tip 带出完整分组名', () => {
    const w = mountPanel()
    expect(w.find('.field-group-header .group-label').attributes('data-tip')).toBe('客户信息')
  })

  it('悬停字段行 300ms 后浮层显示全文，行内子元素间移动不隐藏', async () => {
    const w = mountPanel()
    const row = w.findAll('.field-row').find(r => r.text().includes(LONG_KEY))!
    expect(w.find('.pd-hover-tip').exists()).toBe(false)
    await row.find('.node-label').trigger('mouseover')
    vi.advanceTimersByTime(300)
    await nextTick()
    expect(w.find('.pd-hover-tip').text()).toBe(ROW_TIP)
    // 中文名 → 变量名：同一 data-tip 目标内部移动，浮层不闪断
    await row.find('.node-label').trigger('mouseout', { relatedTarget: row.find('.node-key').element })
    expect(w.find('.pd-hover-tip').exists()).toBe(true)
    // 移到行外的其它区域：原浮层收起
    await row.find('.node-label').trigger('mouseout', { relatedTarget: w.find('.panel-title').element })
    expect(w.find('.pd-hover-tip').exists()).toBe(false)
  })
})

describe('FieldTreePanel 单击复制字段名', () => {
  it('单击字段行复制中文名并给出「已复制」行内反馈', async () => {
    const writeText = stubClipboard()
    const w = mountPanel()
    const row = w.findAll('.field-row').find(r => r.text().includes(LONG_KEY))!
    await row.trigger('click')
    await flushPromises()
    await nextTick()
    expect(writeText).toHaveBeenCalledWith(LONG_LABEL)
    expect(row.find('.copy-hint').text()).toBe('已复制')
  })

  it('拖拽起手后不触发点击复制', async () => {
    const writeText = stubClipboard()
    const w = mountPanel()
    const row = w.findAll('.field-row').find(r => r.text().includes(LONG_KEY))!
    await row.trigger('dragstart', { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
    await row.trigger('click')
    await flushPromises()
    expect(writeText).not.toHaveBeenCalled()
    expect(row.find('.copy-hint').exists()).toBe(false)
  })
})
