import { describe, it, expect, vi } from 'vitest'
import { createImageTools, type ImageReaderBridge } from '../image-tools.js'
import type { TemplateRenderBridge } from '../render-tools.js'
import type { GrayBitmap } from '../image-analysis.js'

const W = 400
const H = 300

function makeBitmap(w = W, h = H): GrayBitmap {
  return { width: w, height: h, gray: new Uint8Array(w * h).fill(255) }
}

function drawFrame(bmp: GrayBitmap, l: number, t: number, r: number, b: number, width = 2): void {
  const set = (x: number, y: number): void => { bmp.gray[y * bmp.width + x] = 0 }
  for (let d = 0; d < width; d++) {
    for (let y = t; y <= b; y++) { set(l + d, y); set(r - d, y) }
    for (let x = l; x <= r; x++) { set(x, t + d); set(x, b - d) }
  }
}

function drawVLine(bmp: GrayBitmap, x: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) bmp.gray[y * bmp.width + x] = 0
}

const validTemplate = {
  paperSize: 'A5' as const,
  orientation: 'landscape' as const,
  unit: 'mm',
  margins: { top: 5, right: 5, bottom: 5, left: 5 },
  elements: [{
    id: 'e1', type: 'text',
    options: { left: 10, top: 10, width: 60, height: 8, formatter: 'x' },
    printElementType: { type: 'text' },
  }],
}

/** 生成一张"看起来像"渲染结果的白底图：外框 + 一条竖线 */
function frameBitmap(withInnerLine = true): GrayBitmap {
  const bmp = makeBitmap()
  drawFrame(bmp, 10, 10, 389, 289)
  if (withInnerLine) drawVLine(bmp, 200, 12, 288)
  return bmp
}

/** 内容区左上角在 (l,t)、尺寸 w×h 的边框图（内含居中竖线），用于构造「整版平移」 */
function frameAt(l: number, t: number, w: number, h: number): GrayBitmap {
  const bmp = makeBitmap()
  drawFrame(bmp, l, t, l + w, t + h)
  drawVLine(bmp, l + Math.round(w / 2), t + 2, t + h - 2)
  return bmp
}

function stubReader(overrides: Partial<ImageReaderBridge> = {}): ImageReaderBridge & { readCalls: string[] } {
  const readCalls: string[] = []
  return {
    readCalls,
    readGrayImage: vi.fn(async (path: string) => {
      readCalls.push(path)
      return frameBitmap()
    }),
    decodePngBase64: vi.fn(async () => frameBitmap()),
    ...overrides,
  } as never
}

function stubRender(error?: unknown): TemplateRenderBridge {
  return {
    renderTemplatePage: vi.fn(async (input) => {
      if (error !== undefined) throw error
      return {
        pageCount: 1,
        pageSizeMm: { width: 210, height: 148 },
        pngBase64: 'stub',
        widthPx: 1588,
        heightPx: 1119,
        ...(input ? {} : {}),
      }
    }),
  } as never
}

function tools(reader = stubReader(), render = stubRender()) {
  return createImageTools({ imageReader: reader, renderBridge: render })
}

const analyzeTool = (deps = tools()) => deps.find(t => t.name === 'print_analyze_reference_image')!
const compareTool = (deps = tools()) => deps.find(t => t.name === 'print_compare_with_reference')!

function firstText(r: { content: Array<{ type: string; text?: string }> }): string {
  const block = r.content[0]
  return block && block.type === 'text' ? String(block.text ?? '') : ''
}

describe('工具注册', () => {
  it('导出两个图像工具，名称互不重复', () => {
    const names = tools().map(t => t.name).sort()
    expect(names).toEqual(['print_analyze_reference_image', 'print_compare_with_reference'])
  })

  it('分析工具只读本地文件（openWorldHint=false）；比对工具会触发宿主渲染（openWorldHint=true）', () => {
    const byName = new Map(tools().map(t => [t.name, t]))
    const analyze = byName.get('print_analyze_reference_image')!
    const compare = byName.get('print_compare_with_reference')!
    expect(analyze.annotations?.readOnlyHint).toBe(true)
    expect(analyze.annotations?.openWorldHint).toBe(false)
    expect(compare.annotations?.readOnlyHint).toBe(true)
    expect(compare.annotations?.destructiveHint).toBe(false)
    expect(compare.annotations?.openWorldHint).toBe(true)
    expect(compare.description).toContain('网络')
  })
})

describe('print_analyze_reference_image', () => {
  it('只给路径时返回像素层 + 归一化层，毫米层缺省并提示补齐', async () => {
    const r = await analyzeTool().handler({ imagePath: '/tmp/ref.png' })
    expect(r.isError).toBeFalsy()
    const data = JSON.parse(firstText(r))
    expect(data.image).toEqual({ widthPx: W, heightPx: H })
    expect(data.contentArea.px.left).toBe(10)
    expect(data.verticalLines.length).toBeGreaterThan(0)
    expect(data.verticalLines[0].xNorm).toBeGreaterThanOrEqual(0)
    expect(data.millimeters).toBeUndefined()
    expect(data.hints.some((h: string) => h.includes('dpi'))).toBe(true)
  })

  it('给 dpi 时输出毫米层', async () => {
    const r = await analyzeTool().handler({ imagePath: '/tmp/ref.png', dpi: 96 })
    const data = JSON.parse(firstText(r))
    expect(data.millimeters).toBeDefined()
    expect(data.millimeters.pxPerMm).toBeCloseTo(96 / 25.4, 2)
    expect(data.hints).toEqual([])
  })

  it('给 paper 时用宽度比例反推', async () => {
    const r = await analyzeTool().handler({
      imagePath: '/tmp/ref.png',
      paper: { widthMm: 200, heightMm: 150 },
    })
    const data = JSON.parse(firstText(r))
    expect(data.millimeters.contentAreaMm.width).toBeCloseTo(200, 0)
  })

  it('缺少 imagePath 报可行动错误', async () => {
    const r = await analyzeTool().handler({})
    expect(r.isError).toBe(true)
    expect(firstText(r)).toContain('imagePath')
  })

  it('bridge 抛 IMAGE_NOT_FOUND 时映射为可行动文案', async () => {
    const err = new Error('/nope.png')
    ;(err as Error & { code?: string }).code = 'IMAGE_NOT_FOUND'
    const reader = stubReader({ readGrayImage: vi.fn(async () => { throw err }) })
    const r = await analyzeTool(tools(reader)).handler({ imagePath: '/nope.png' })
    expect(r.isError).toBe(true)
    expect(firstText(r)).toContain('图片不存在')
    expect(firstText(r)).toContain('绝对路径')
  })

  it('bridge 抛 IMAGE_UNSUPPORTED 时给出支持格式', async () => {
    const err = new Error('tiff')
    ;(err as Error & { code?: string }).code = 'IMAGE_UNSUPPORTED'
    const reader = stubReader({ readGrayImage: vi.fn(async () => { throw err }) })
    const r = await analyzeTool(tools(reader)).handler({ imagePath: '/a.tiff' })
    expect(firstText(r)).toContain('PNG')
  })
})

describe('print_compare_with_reference', () => {
  it('渲染与参考图一致时 pass / status=pass，无多余/缺失线', async () => {
    const r = await compareTool().handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    expect(r.isError).toBeFalsy()
    const data = JSON.parse(firstText(r))
    expect(data.pass).toBe(true)
    expect(data.status).toBe('pass')
    expect(data.extraInTemplate).toEqual([])
    expect(data.missingInTemplate).toEqual([])
    expect(data.matchedCount).toBeGreaterThan(0)
    // 同版式、同内容区位置：整图层面的偏移应为 0
    expect(data.contentAreaOffset).toEqual({ left: 0, top: 0, right: 0, bottom: 0, max: 0 })
  })

  it('内容区整体平移（16/20px）：不能 pass → status=inconclusive 并给出偏移与告警', async () => {
    // 两图版式与内部线条完全一致，只有整版在图像中的位置差 (16, 20)px：
    // 线条坐标相对各自内容区归一化后一模一样，必须靠 pageNorm 才看得出来
    const reader = stubReader({
      decodePngBase64: vi.fn(async () => frameAt(26, 30, 350, 230)),
      readGrayImage: vi.fn(async () => frameAt(10, 10, 350, 230)),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.pass).toBe(false)
    expect(data.status).toBe('inconclusive')
    expect(data.status).not.toBe('pass')
    expect(data.contentAreaOffset.left).toBeCloseTo(16 / W, 3)
    expect(data.contentAreaOffset.top).toBeCloseTo(20 / H, 3)
    expect(data.contentAreaOffset.right).toBeCloseTo(16 / W, 3)
    expect(data.contentAreaOffset.bottom).toBeCloseTo(20 / H, 3)
    expect(data.contentAreaOffset.max).toBeGreaterThan(0.002)
    expect(data.warnings.some((w: string) => w.includes('内容区') && w.includes('位置'))).toBe(true)
  })

  it('内容区位置一致（同版式同位置）：offset 全 0 且仍 status=pass', async () => {
    const reader = stubReader({
      decodePngBase64: vi.fn(async () => frameAt(10, 10, 350, 230)),
      readGrayImage: vi.fn(async () => frameAt(10, 10, 350, 230)),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.status).toBe('pass')
    expect(data.pass).toBe(true)
    expect(data.contentAreaOffset.max).toBe(0)
  })

  it('模板多一条线时进 extraInTemplate 并判不通过', async () => {
    // 渲染图多一条竖线，参考图没有
    const reader = stubReader({
      decodePngBase64: vi.fn(async () => {
        const bmp = frameBitmap(true)
        drawVLine(bmp, 300, 12, 288)
        return bmp
      }),
      readGrayImage: vi.fn(async () => frameBitmap(false)),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.pass).toBe(false)
    expect(data.status).toBe('fail')
    expect(data.extraInTemplate.length).toBeGreaterThan(0)
    expect(data.extraInTemplate[0].kind).toBe('vline')
  })

  it('参考图有线而模板没有时进 missingInTemplate', async () => {
    const reader = stubReader({
      decodePngBase64: vi.fn(async () => frameBitmap(false)),
      readGrayImage: vi.fn(async () => frameBitmap(true)),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.missingInTemplate.length).toBeGreaterThan(0)
    expect(data.pass).toBe(false)
  })

  it('空白图 vs 空白图：无线可比 → pass=false, status=inconclusive', async () => {
    const reader = stubReader({
      decodePngBase64: vi.fn(async () => makeBitmap()),
      readGrayImage: vi.fn(async () => makeBitmap()),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.pass).toBe(false)
    expect(data.status).toBe('inconclusive')
    expect(data.warnings.some((w: string) => w.includes('没有检测到任何线条'))).toBe(true)
  })

  it('两图内容区宽高比明显不同：pass=false, status=inconclusive', async () => {
    // 参考图外框偏窄（内容区 ~300×280），与模板图 ~380×280 偏差 > 2%：不是同一版式
    const reader = stubReader({
      decodePngBase64: vi.fn(async () => frameBitmap(true)),
      readGrayImage: vi.fn(async () => {
        const bmp = makeBitmap()
        drawFrame(bmp, 80, 10, 299, 289)
        drawVLine(bmp, 180, 12, 288)
        return bmp
      }),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.pass).toBe(false)
    expect(data.status).toBe('inconclusive')
    expect(data.warnings.some((w: string) => w.includes('宽高比不一致'))).toBe(true)
  })

  it('位置一致但线长只有 1/6：不算匹配 → pass=false（进 extra/missing）', async () => {
    const reader = stubReader({
      // 模板：竖线纵贯内容区
      decodePngBase64: vi.fn(async () => {
        const bmp = frameBitmap(false)
        drawVLine(bmp, 200, 12, 288)
        return bmp
      }),
      // 参考图：同一 x 的竖线只画 1/6 长
      readGrayImage: vi.fn(async () => {
        const bmp = frameBitmap(false)
        drawVLine(bmp, 200, 12, 58)
        return bmp
      }),
    })
    const r = await compareTool(tools(reader)).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    const data = JSON.parse(firstText(r))
    expect(data.pass).toBe(false)
    expect(data.status).toBe('fail')
    // 全长线与 1/6 长线不互相抵消：模板的进 extra，参考的进 missing
    expect(data.extraInTemplate.length).toBeGreaterThan(0)
    expect(data.missingInTemplate.length).toBeGreaterThan(0)
    // 成对出现时给出解释性告警，避免被读成两条独立差异
    expect(data.warnings.some((w: string) => w.includes('线长不匹配'))).toBe(true)
    // extra / missing 带归一化起止范围，可按 norm 配对
    expect(data.extraInTemplate[0]).toMatchObject({ kind: 'vline', start: 0, end: 1 })
    expect(data.missingInTemplate[0].end).toBeLessThan(1)
    // status=fail 时 maxDeviationRatio 不能是 0（线长差异也要计进偏差）
    expect(data.maxDeviationRatio).toBeGreaterThan(0)
  })

  it('page 参数透传给渲染 bridge（缺省仍为 1）', async () => {
    const render = {
      renderTemplatePage: vi.fn(async () => ({
        pageCount: 3,
        pageSizeMm: { width: 210, height: 148 },
        pngBase64: 'stub',
        widthPx: 1588,
        heightPx: 1119,
      })),
    }
    const deps = createImageTools({
      imageReader: stubReader(),
      renderBridge: render as never,
    })
    await deps[1]!.handler({ templateJson: validTemplate, referenceImagePath: '/tmp/ref.png', page: 2 })
    expect((render.renderTemplatePage as ReturnType<typeof vi.fn>).mock.calls[0][0].page).toBe(2)
  })

  it('契约不通过时直接拒绝，不触达渲染', async () => {
    const render = stubRender()
    const r = await compareTool(tools(stubReader(), render)).handler({
      templateJson: { paperSize: 'A99' },
      referenceImagePath: '/tmp/ref.png',
    })
    expect(r.isError).toBe(true)
    expect(JSON.parse(firstText(r)).stage).toBe('validate')
    expect((render.renderTemplatePage as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('缺 referenceImagePath 报错', async () => {
    const r = await compareTool().handler({ templateJson: validTemplate })
    expect(r.isError).toBe(true)
    expect(firstText(r)).toContain('referenceImagePath')
  })

  it('渲染超时映射为精简建议', async () => {
    const err = new Error('timeout')
    ;(err as Error & { code?: string }).code = 'RENDER_TIMEOUT'
    const r = await compareTool(tools(stubReader(), stubRender(err))).handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
    })
    expect(firstText(r)).toContain('渲染超时')
  })

  it('输出带容差与近似的毫米偏差（模板有纸张尺寸时）', async () => {
    const r = await compareTool().handler({
      templateJson: validTemplate,
      referenceImagePath: '/tmp/ref.png',
      toleranceRatio: 0.01,
    })
    const data = JSON.parse(firstText(r))
    expect(data.toleranceRatio).toBe(0.01)
    expect(data.items.every((it: { diffMmApprox?: number }) => typeof it.diffMmApprox === 'number')).toBe(true)
  })
})
