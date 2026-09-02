import { describe, it, expect, vi } from 'vitest'
import { useKeyboard } from '../composables/useKeyboard'

function fireKey(key: string, opts: Partial<KeyboardEvent> = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('useKeyboard', () => {
  it('方向键触发 onMove', () => {
    const onMove = vi.fn()
    const { setup, cleanup } = useKeyboard({ onMove })

    setup()
    fireKey('ArrowUp')
    expect(onMove).toHaveBeenCalledWith(0, -1)
    fireKey('ArrowDown')
    expect(onMove).toHaveBeenCalledWith(0, 1)
    fireKey('ArrowLeft')
    expect(onMove).toHaveBeenCalledWith(-1, 0)
    fireKey('ArrowRight')
    expect(onMove).toHaveBeenCalledWith(1, 0)

    cleanup()
  })

  it('Delete 键触发 onDelete', () => {
    const onDelete = vi.fn()
    const { setup, cleanup } = useKeyboard({ onDelete })

    setup()
    fireKey('Delete')
    expect(onDelete).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Backspace 键触发 onDelete', () => {
    const onDelete = vi.fn()
    const { setup, cleanup } = useKeyboard({ onDelete })

    setup()
    fireKey('Backspace')
    expect(onDelete).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+C 触发 onCopy', () => {
    const onCopy = vi.fn()
    const { setup, cleanup } = useKeyboard({ onCopy })

    setup()
    fireKey('c', { ctrlKey: true })
    expect(onCopy).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+V 触发 onPaste', () => {
    const onPaste = vi.fn()
    const { setup, cleanup } = useKeyboard({ onPaste })

    setup()
    fireKey('v', { ctrlKey: true })
    expect(onPaste).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+A 触发 onSelectAll', () => {
    const onSelectAll = vi.fn()
    const { setup, cleanup } = useKeyboard({ onSelectAll })

    setup()
    fireKey('a', { ctrlKey: true })
    expect(onSelectAll).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+Z 触发 onUndo', () => {
    const onUndo = vi.fn()
    const { setup, cleanup } = useKeyboard({ onUndo })

    setup()
    fireKey('z', { ctrlKey: true })
    expect(onUndo).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+Shift+Z 触发 onRedo', () => {
    const onRedo = vi.fn()
    const { setup, cleanup } = useKeyboard({ onRedo })

    setup()
    fireKey('z', { ctrlKey: true, shiftKey: true })
    expect(onRedo).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+Y 触发 onRedo', () => {
    const onRedo = vi.fn()
    const { setup, cleanup } = useKeyboard({ onRedo })

    setup()
    fireKey('y', { ctrlKey: true })
    expect(onRedo).toHaveBeenCalledOnce()
    cleanup()
  })

  it('INPUT 标签跳过快捷键', () => {
    const onMove = vi.fn()
    const { setup, cleanup } = useKeyboard({ onMove })

    setup()
    const input = document.createElement('input')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(onMove).not.toHaveBeenCalled()

    cleanup()
  })

  it('TEXTAREA 标签跳过快捷键', () => {
    const onMove = vi.fn()
    const { setup, cleanup } = useKeyboard({ onMove })

    setup()
    const textarea = document.createElement('textarea')
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(onMove).not.toHaveBeenCalled()

    cleanup()
  })

  it('cleanup 后不再响应键盘事件', () => {
    const onMove = vi.fn()
    const { setup, cleanup } = useKeyboard({ onMove })

    setup()
    cleanup()
    fireKey('ArrowUp')
    expect(onMove).not.toHaveBeenCalled()
  })
})

describe('useKeyboard 修饰符与 Ctrl+D/Ctrl+1', () => {
  it('Shift+方向键大步 10pt', () => {
    const calls: [number, number][] = []
    const onMove = (dx: number, dy: number) => calls.push([dx, dy])
    const { setup, cleanup } = useKeyboard({ onMove })

    setup()
    fireKey('ArrowRight', { shiftKey: true })
    expect(calls[0]).toEqual([10, 0])
    cleanup()
  })

  it('Ctrl+方向键小步 0.5pt', () => {
    const calls: [number, number][] = []
    const onMove = (dx: number, dy: number) => calls.push([dx, dy])
    const { setup, cleanup } = useKeyboard({ onMove })

    setup()
    fireKey('ArrowRight', { ctrlKey: true })
    expect(calls[0]).toEqual([0.5, 0])
    cleanup()
  })

  it('Ctrl+D 触发 onDuplicate', () => {
    const onDuplicate = vi.fn()
    const { setup, cleanup } = useKeyboard({ onDuplicate })

    setup()
    fireKey('d', { ctrlKey: true })
    expect(onDuplicate).toHaveBeenCalledOnce()
    cleanup()
  })

  it('Ctrl+1 触发 onResetZoom', () => {
    const onResetZoom = vi.fn()
    const { setup, cleanup } = useKeyboard({ onResetZoom })

    setup()
    fireKey('1', { ctrlKey: true })
    expect(onResetZoom).toHaveBeenCalledOnce()
    cleanup()
  })
})

describe('useKeyboard 对齐快捷键', () => {
  it('Ctrl+L/R/E/T/B 触发对应对齐回调', () => {
    const calls: string[] = []
    const { setup, cleanup } = useKeyboard({
      onAlignLeft: () => calls.push('left'),
      onAlignRight: () => calls.push('right'),
      onAlignCenterH: () => calls.push('centerH'),
      onAlignTop: () => calls.push('top'),
      onAlignBottom: () => calls.push('bottom'),
    })

    setup()
    fireKey('l', { ctrlKey: true })
    fireKey('r', { ctrlKey: true })
    fireKey('e', { ctrlKey: true })
    fireKey('t', { ctrlKey: true })
    fireKey('b', { ctrlKey: true })
    expect(calls).toEqual(['left', 'right', 'centerH', 'top', 'bottom'])
    cleanup()
  })
})

describe('useKeyboard 编组快捷键', () => {
  it('Ctrl+G 触发 onGroup, Ctrl+Shift+G 触发 onUngroup', () => {
    const onGroup = vi.fn()
    const onUngroup = vi.fn()
    const { setup, cleanup } = useKeyboard({ onGroup, onUngroup })

    setup()
    fireKey('g', { ctrlKey: true })
    expect(onGroup).toHaveBeenCalledOnce()
    fireKey('g', { ctrlKey: true, shiftKey: true })
    expect(onUngroup).toHaveBeenCalledOnce()
    cleanup()
  })
})
