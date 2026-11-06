// template-renderer 单元测试：错误码归类、整段共用截止时间的预算分配、窗口环节失败的资源清理。
// electron / core 管线 / withTimeout 全部替身，只验 bridge 自身的控制流。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'

const env = vi.hoisted(() => ({
  failConstruct: false,
  failLoad: false,
  prepareError: undefined as unknown,
  prepareElapsedMs: 0,
  windows: [] as Array<{ destroyed: boolean; destroy: () => void }>,
}))

const fsEnv = vi.hoisted(() => ({ written: [] as string[] }))

const budget = vi.hoisted(() => ({ timeoutMs: [] as number[] }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    writeFileSync: vi.fn((...args: [string, string, BufferEncoding]) => {
      fsEnv.written.push(args[0])
      return actual.writeFileSync(args[0], args[1], args[2])
    }),
  }
})

vi.mock('electron', () => {
  class FakeWebContents {
    setZoomFactor = vi.fn()
    executeJavaScript = vi.fn(async (code: unknown) => {
      const src = String(code)
      if (src.includes('readElementRects')) return [{ id: 'e1', left: 0, top: 0, width: 10, height: 5 }]
      if (src.includes('.print-page')) return 1
      return undefined
    })
    capturePage = vi.fn(async () => ({
      toPNG: () => Buffer.from('png'),
      getSize: () => ({ width: 794, height: 1123 }),
    }))
  }
  class FakeBrowserWindow {
    webContents = new FakeWebContents()
    destroyed = false
    isDestroyed = (): boolean => this.destroyed
    destroy = (): void => { this.destroyed = true }
    loadFile = vi.fn(async () => {
      if (env.failLoad) throw new Error('加载失败')
    })
    constructor() {
      if (env.failConstruct) throw new Error('窗口创建失败')
      env.windows.push(this)
    }
  }
  return { BrowserWindow: FakeBrowserWindow }
})

vi.mock('@worm-vue3-print/core', () => ({
  prepareDocument: vi.fn(async () => {
    if (env.prepareElapsedMs > 0) vi.advanceTimersByTime(env.prepareElapsedMs)
    if (env.prepareError !== undefined) throw env.prepareError
    return {
      pageCount: 1,
      paperMm: { width: 210, height: 297 },
      html: '<html></html>',
    }
  }),
}))

vi.mock('@worm-vue3-print/core/node', () => ({
  loadExecutorBundle: () => ({ source: '/* executor */' }),
}))

vi.mock('./html-printer.js', () => ({
  waitResourcesReady: vi.fn(async () => {}),
}))

vi.mock('./with-timeout.js', () => ({
  withTimeout: vi.fn(async (run: () => Promise<unknown>, options: { timeoutMs: number }) => {
    budget.timeoutMs.push(options.timeoutMs)
    return run()
  }),
}))

function codeOf(err: unknown): string | undefined {
  return err && typeof err === 'object' ? (err as { code?: string }).code : undefined
}

function withCode(code: string): Error {
  return Object.assign(new Error(`原始报错 ${code}`), { code })
}

async function render(): Promise<unknown> {
  const { createTemplateRenderer } = await import('./template-renderer.js')
  const renderer = createTemplateRenderer({ runtime: {} as never })
  return renderer.renderTemplatePage({ templateJson: { paperSize: 'A4' }, page: 1, scale: 1 })
}

beforeEach(() => {
  vi.useFakeTimers()
  env.failConstruct = false
  env.failLoad = false
  env.prepareError = undefined
  env.prepareElapsedMs = 0
  env.windows.length = 0
  fsEnv.written.length = 0
  budget.timeoutMs.length = 0
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

describe('classifyRenderError', () => {
  it.each(['RENDER_TIMEOUT', 'CLIENT_TIMEOUT'])('%s 归类为 bridge 的 RENDER_TIMEOUT', async (code) => {
    const { classifyRenderError } = await import('./template-renderer.js')
    let caught: unknown
    try {
      classifyRenderError(withCode(code))
    } catch (e) {
      caught = e
    }
    expect(codeOf(caught)).toBe('RENDER_TIMEOUT')
    expect((caught as Error).message).toContain('未完成')
  })

  it('非超时错误码保持 RENDER_FAILED', async () => {
    const { classifyRenderError } = await import('./template-renderer.js')
    let caught: unknown
    try {
      classifyRenderError(withCode('BARCODE_FAILED'))
    } catch (e) {
      caught = e
    }
    expect(codeOf(caught)).toBe('RENDER_FAILED')
    expect((caught as Error).message).toContain('BARCODE_FAILED')
  })
})

describe('预览预算（整段共用 20s 截止时间）', () => {
  it('管线很快时，截图段拿到完整 20s', async () => {
    await expect(render()).resolves.toBeDefined()
    expect(budget.timeoutMs).toHaveLength(1)
    expect(budget.timeoutMs[0]).toBe(20_000)
  })

  it('管线已耗 19.9s 时，截图段只拿剩余 100ms，不再额外给 20s', async () => {
    env.prepareElapsedMs = 19_900
    await expect(render()).resolves.toBeDefined()
    expect(budget.timeoutMs[0]).toBe(100)
  })

  it('管线超时（RENDER_TIMEOUT）向上传播为 RENDER_TIMEOUT', async () => {
    env.prepareError = withCode('RENDER_TIMEOUT')
    await expect(render()).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
    expect(budget.timeoutMs).toHaveLength(0)
  })
})

describe('窗口环节失败也要清理临时 HTML', () => {
  it('BrowserWindow 构造抛错时删除已写入的临时 HTML', async () => {
    env.failConstruct = true
    await expect(render()).rejects.toThrow('窗口创建失败')
    expect(fsEnv.written.length).toBe(1)
    expect(existsSync(fsEnv.written[0]!)).toBe(false)
  })

  it('loadFile 抛错时删除临时 HTML 并销毁窗口', async () => {
    env.failLoad = true
    await expect(render()).rejects.toThrow('加载失败')
    expect(fsEnv.written.length).toBe(1)
    expect(existsSync(fsEnv.written[0]!)).toBe(false)
    expect(env.windows.every(w => w.destroyed)).toBe(true)
  })

  it('成功路径同样删除临时 HTML', async () => {
    await expect(render()).resolves.toBeDefined()
    expect(existsSync(fsEnv.written[0]!)).toBe(false)
  })
})
