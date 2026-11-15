import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearElementUIs,
  defineElementUI,
  getElementUI,
  getElementUIEntries,
  getElementUIs,
  getElementUITypes,
  registerElementUI,
  subscribeElementUIRegistry,
} from './index.js'

function ui(types: string[], extra: Record<string, unknown> = {}) {
  return defineElementUI({
    types,
    renderCanvas: () => `<svg data-types="${types.join(',')}"></svg>`,
    ...extra,
  })
}

afterEach(() => clearElementUIs())

describe('plugin-kit 注册表', () => {
  it('注册后按类型解析，覆盖多个 type', () => {
    registerElementUI(ui(['foo', 'bar']))
    expect(getElementUI('foo')).toBe(getElementUI('bar'))
    expect(getElementUITypes()).toEqual(['foo', 'bar'])
    expect(getElementUIEntries().map(entry => entry.type)).toEqual(['foo', 'bar'])
  })

  it('同一份 UI 覆盖多个 type 时 getElementUIs 只返回一次', () => {
    const one = ui(['foo', 'bar'])
    registerElementUI(one)
    registerElementUI(ui(['baz']))
    expect(getElementUIs()).toHaveLength(2)
    expect(getElementUIs()[0]).toBe(one)
  })

  it('同 type 后注册者覆盖，注销句柄只撤销自己那一版', () => {
    const first = ui(['foo'])
    const second = ui(['foo'])
    const disposeFirst = registerElementUI(first)
    registerElementUI(second)
    expect(getElementUI('foo')).toBe(second)
    disposeFirst()
    expect(getElementUI('foo')).toBe(second)
  })

  it('注销后类型从注册表移除', () => {
    const dispose = registerElementUI(ui(['foo']))
    dispose()
    expect(getElementUI('foo')).toBeUndefined()
    expect(getElementUITypes()).toEqual([])
  })

  it('注册/注销/清空都会通知订阅者', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeElementUIRegistry(listener)
    const dispose = registerElementUI(ui(['foo']))
    expect(listener).toHaveBeenCalledTimes(1)
    dispose()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    registerElementUI(ui(['bar']))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('监听器抛错不影响其它监听器与注册动作', () => {
    const good = vi.fn()
    subscribeElementUIRegistry(() => { throw new Error('boom') })
    subscribeElementUIRegistry(good)
    expect(() => registerElementUI(ui(['foo']))).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('描述符校验：types 非空、renderCanvas 必填', () => {
    expect(() => defineElementUI({ types: [], renderCanvas: () => '' } as never)).toThrow(/types/)
    expect(() => defineElementUI({ types: ['x'] } as never)).toThrow(/renderCanvas/)
    expect(() => registerElementUI({ types: ['x'], renderCanvas: 'no' } as never)).toThrow(/renderCanvas/)
  })

  it('注册态挂在 globalThis，重复加载同一包不会产生两份注册表', async () => {
    registerElementUI(ui(['foo']))
    vi.resetModules()
    const reloaded = await import('./registry.js')
    expect(reloaded.getElementUI('foo')).toBeDefined()
  })
})
