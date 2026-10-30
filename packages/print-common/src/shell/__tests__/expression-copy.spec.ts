// @vitest-environment happy-dom
// 表达式弹窗字段行复制按钮（common 侧）：与 canvas ExpressionEditor.spec.ts 同口径——
// 每个字段行右侧有 .ee-copy-btn，单击复制字段中文名，图标在 1.2s 内变为对勾（is-copied）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { PrintBusinessField } from '@worm-vue3-print/core/designer'
import { render } from '../../core/h'
import { renderExpressionEditor } from '../expression-editor'

const fields: PrintBusinessField[] = [
  { id: '1', fieldKey: 'customer', fieldLabel: '客户信息', fieldType: 'string', sortOrder: 1 },
  { id: '2', fieldKey: 'customer.receiptRemark', fieldLabel: '客户签收备注', fieldType: 'string', sortOrder: 2 },
]

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true })
  return writeText
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true })
})

function mountEditor() {
  const host = document.createElement('div')
  document.body.replaceChildren(host)
  render(renderExpressionEditor({
    fields,
    onClose: () => {},
    onApply: () => {},
  }, { elementId: 'el-1', targetPath: 'options.formatter', value: '' }), host)
  return host
}

/** 复制走 Promise，等一轮微任务让 repaint 落地 */
function flush() {
  return new Promise<void>(resolve => setTimeout(resolve, 0))
}

describe('表达式弹窗字段行复制按钮（common）', () => {
  it('每个字段行右侧都有复制按钮', () => {
    const host = mountEditor()
    const rows = Array.from(host.querySelectorAll<HTMLElement>('.ee-field-item'))
    expect(rows.length).toBe(1)
    expect(rows[0]!.querySelector('.ee-copy-btn')).toBeTruthy()
  })

  it('单击复制按钮复制字段中文名并显示已复制图标', async () => {
    const writeText = stubClipboard()
    const host = mountEditor()
    const btn = host.querySelector<HTMLElement>('.ee-field-item .ee-copy-btn')!
    btn.click()
    await flush()
    expect(writeText).toHaveBeenCalledWith('客户签收备注')
    expect(host.querySelector('.ee-field-item .ee-copy-btn')?.classList.contains('is-copied')).toBe(true)
  })

  it('复制不触发双击插入，表达式文本域保持为空', async () => {
    stubClipboard()
    const host = mountEditor()
    host.querySelector<HTMLElement>('.ee-field-item .ee-copy-btn')!.click()
    await flush()
    expect(host.querySelector<HTMLTextAreaElement>('.ee-textarea')!.value).toBe('')
  })

  it('复制按钮的提示挂 data-tip（不残留原生 title），复制后变「已复制」', async () => {
    stubClipboard()
    const host = mountEditor()
    const btn = host.querySelector<HTMLElement>('.ee-field-item .ee-copy-btn')!
    expect(btn.getAttribute('data-tip')).toBe('复制字段名「客户签收备注」')
    expect(btn.getAttribute('title')).toBeNull()

    btn.click()
    await flush()
    expect(host.querySelector<HTMLElement>('.ee-field-item .ee-copy-btn')!.getAttribute('data-tip')).toBe('已复制')
  })
})
