import { describe, it, expect, vi } from 'vitest'
import { createRenderTools, type TemplateRenderBridge } from '../render-tools.js'
import { TOOLS } from '../tools.js'

const validTemplate = {
  paperSize: 'A4', orientation: 'portrait', unit: 'mm',
  margins: { top: 10, right: 10, bottom: 10, left: 10 },
  elements: [{
    id: 'e1', type: 'text',
    options: { left: 10, top: 10, width: 60, height: 8, formatter: '{orderNo}' },
    printElementType: { type: 'text' },
  }],
}

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUg==' // PNG 头签名，内容无所谓

/** stub bridge：可注入返回值与抛错 */
function stubBridge(
  result: Partial<Awaited<ReturnType<TemplateRenderBridge['renderTemplatePage']>>> = {},
  error?: unknown,
): TemplateRenderBridge & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    renderTemplatePage: vi.fn(async (input) => {
      calls.push(input as Record<string, unknown>)
      if (error !== undefined) throw error
      return {
        pageCount: 3,
        pageSizeMm: { width: 210, height: 297 },
        pngBase64: PNG_BASE64,
        widthPx: 1588,
        heightPx: 2246,
        ...result,
      }
    }),
  } as never
}

async function call(bridge: TemplateRenderBridge, args: Record<string, unknown>) {
  const tool = createRenderTools(bridge)[0]
  if (!tool) throw new Error('print_preview_template 未注册')
  return tool.handler(args)
}

const textOf = (r: Awaited<ReturnType<typeof call>>) => {
  const block = r.content[0]
  if (!block || block.type !== 'text') throw new Error('首块不是文本')
  return block.text
}

describe('print_preview_template 注册与隔离', () => {
  it('渲染工具不进纯计算工具集，名字不冲突', () => {
    expect(TOOLS.map(t => t.name)).not.toContain('print_preview_template')
    expect(createRenderTools(stubBridge()).map(t => t.name)).toEqual(['print_preview_template'])
  })

  it('预览只读不落画布，但如实声明会触网（模板可引用远程图片/字体）', () => {
    const tool = createRenderTools(stubBridge())[0]!
    expect(tool.annotations?.readOnlyHint).toBe(true)
    expect(tool.annotations?.destructiveHint).toBe(false)
    expect(tool.annotations?.openWorldHint).toBe(true)
    expect(tool.description).toContain('网络')
    expect(tool.description).toContain('远程图片')
  })
})

describe('print_preview_template 门禁', () => {
  it('缺少 templateJson 报错', async () => {
    const r = await call(stubBridge(), {})
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain('templateJson')
  })

  it('契约校验不过直接拒绝，不触达 bridge', async () => {
    const bridge = stubBridge()
    const r = await call(bridge, { templateJson: { paperSize: 'A99' } })
    expect(r.isError).toBe(true)
    expect(JSON.parse(textOf(r)).stage).toBe('validate')
    expect(bridge.calls).toHaveLength(0)
  })

  it('html 元素被拦截并给出 blockedPaths', async () => {
    const bridge = stubBridge()
    const r = await call(bridge, {
      templateJson: {
        ...validTemplate,
        elements: [{
          id: 'e2', type: 'html',
          options: { left: 10, top: 10, width: 60, height: 8 },
          printElementType: { type: 'html' },
        }],
      },
    })
    expect(r.isError).toBe(true)
    expect(JSON.parse(textOf(r)).stage).toBe('blocked-elements')
    expect(bridge.calls).toHaveLength(0)
  })
})

describe('print_preview_template 正常路径', () => {
  it('返回 text + image 两块，text 带页数与像素尺寸', async () => {
    const r = await call(stubBridge(), { templateJson: validTemplate, printData: { orderNo: 'A001' } })
    expect(r.isError).toBeFalsy()
    expect(r.content).toHaveLength(2)
    const [text, image] = r.content as [{ type: string; text: string }, { type: string; data: string; mimeType: string }]
    expect(text.type).toBe('text')
    expect(image.type).toBe('image')
    expect(image.mimeType).toBe('image/png')
    expect(image.data).toBe(PNG_BASE64)
    const payload = JSON.parse(text.text)
    expect(payload).toMatchObject({ ok: true, pageCount: 3, page: 1, pageSizeMm: { width: 210, height: 297 } })
    expect(payload.note).toContain('自评')
  })

  it('page/scale 缺省值与透传（含 templateJson 外壳解包）', async () => {
    const bridge = stubBridge()
    await call(bridge, { templateJson: { templateJson: validTemplate } })
    expect(bridge.calls[0]).toMatchObject({ page: 1, scale: 2 })
    expect((bridge.calls[0]!.templateJson as { paperSize: string }).paperSize).toBe('A4')
  })

  it('page/scale 显式值透传给 bridge', async () => {
    const bridge = stubBridge({ pageCount: 5 })
    await call(bridge, { templateJson: validTemplate, page: 2, scale: 3 })
    expect(bridge.calls[0]).toMatchObject({ page: 2, scale: 3 })
  })
})

describe('print_preview_template 错误映射', () => {
  it('PAGE_OUT_OF_RANGE 映射为可行动文案', async () => {
    const err = new Error('模板共 3 页，没有第 9 页')
    ;(err as Error & { code?: string }).code = 'PAGE_OUT_OF_RANGE'
    const r = await call(stubBridge({}, err), { templateJson: validTemplate, page: 9 })
    expect(r.isError).toBe(true)
    expect(textOf(r)).toContain('page 超出范围')
    expect(textOf(r)).toContain('3 页')
  })

  it('RENDER_TIMEOUT 映射为精简建议', async () => {
    const err = new Error('timeout')
    ;(err as Error & { code?: string }).code = 'RENDER_TIMEOUT'
    const r = await call(stubBridge({}, err), { templateJson: validTemplate })
    expect(textOf(r)).toContain('渲染超时')
  })

  it('未知错误原样透传 message', async () => {
    const r = await call(stubBridge({}, new Error('boom')), { templateJson: validTemplate })
    expect(textOf(r)).toContain('boom')
  })
})
