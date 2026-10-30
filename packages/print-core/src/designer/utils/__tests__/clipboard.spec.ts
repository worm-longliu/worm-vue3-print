// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { copyTextToClipboard } from '../clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true })
}

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true, writable: true })
  vi.restoreAllMocks()
})

/** 非安全上下文回退分支：把 execCommand 临时替换成可控桩 */
function stubExecCommand(result: boolean | 'throw') {
  const impl = () => {
    if (result === 'throw') throw new Error('execCommand unsupported')
    return result
  }
  Object.defineProperty(document, 'execCommand', { value: vi.fn(impl), configurable: true, writable: true })
  return document.execCommand as unknown as ReturnType<typeof vi.fn>
}

describe('copyTextToClipboard', () => {
  it('安全上下文优先走 navigator.clipboard.writeText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await expect(copyTextToClipboard('客户签收备注')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('客户签收备注')
  })

  it('writeText 被拒时回退到 execCommand 且清理临时节点', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    const execCommand = stubExecCommand(true)
    await expect(copyTextToClipboard('ASN单号')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('回退分支失败时返回 false，不残留临时节点', async () => {
    setClipboard(undefined)
    stubExecCommand(false)
    await expect(copyTextToClipboard('ASN单号')).resolves.toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('execCommand 抛错时返回 false', async () => {
    setClipboard(undefined)
    stubExecCommand('throw')
    await expect(copyTextToClipboard('ASN单号')).resolves.toBe(false)
  })

  it('空文本直接返回 false，不触碰剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    await expect(copyTextToClipboard('')).resolves.toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })
})
