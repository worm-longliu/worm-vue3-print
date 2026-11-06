import { describe, it, expect } from 'vitest'
import {
  analyzeGeometry,
  binarize,
  detectHorizontalLines,
  detectTables,
  detectVerticalLines,
  toMillimeters,
  type GrayBitmap,
} from '../image-analysis.js'

/** 构造白底灰度位图（255 = 白） */
function makeBitmap(w: number, h: number): GrayBitmap {
  return { width: w, height: h, gray: new Uint8Array(w * h).fill(255) }
}

/** 画竖线（含线宽） */
function drawVLine(bmp: GrayBitmap, x: number, y0: number, y1: number, width = 1): void {
  for (let dx = 0; dx < width; dx++) {
    for (let y = y0; y <= y1; y++) bmp.gray[y * bmp.width + x + dx] = 0
  }
}

/** 画横线 */
function drawHLine(bmp: GrayBitmap, y: number, x0: number, x1: number, height = 1): void {
  for (let dy = 0; dy < height; dy++) {
    for (let x = x0; x <= x1; x++) bmp.gray[(y + dy) * bmp.width + x] = 0
  }
}

/** 画矩形框 */
function drawFrame(bmp: GrayBitmap, l: number, t: number, r: number, b: number, width = 1): void {
  drawVLine(bmp, l, t, b, width)
  drawVLine(bmp, r - width + 1, t, b, width)
  drawHLine(bmp, t, l, r, width)
  drawHLine(bmp, b - height0(width), l, r, width)
}
function height0(w: number): number { return w - 1 }

/**
 * 在指定区域画"文字块"：用有间隙的短竖条模拟字符笔画。
 * 关键：水平游程保持很短（3px），否则会被线条检测误判成横线——真实文字也应如此。
 */
function drawTextBlock(bmp: GrayBitmap, x0: number, y0: number, w: number, lines: number): void {
  for (let i = 0; i < lines; i++) {
    const top = y0 + i * 12
    for (let x = x0; x < x0 + w; x += 6) {
      for (let dy = 0; dy < 8; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const px = x + dx
          const py = top + dy
          if (px < bmp.width && py < bmp.height) bmp.gray[py * bmp.width + px] = 0
        }
      }
    }
  }
}

describe('binarize', () => {
  it('按阈值把灰度转成 0/1', () => {
    const bmp: GrayBitmap = { width: 3, height: 1, gray: new Uint8Array([0, 128, 255]) }
    const bin = binarize(bmp, 128)
    expect(Array.from(bin.dark)).toEqual([1, 0, 0])
  })
})

describe('detectVerticalLines', () => {
  it('检出竖线并给出线宽与游程', () => {
    const bmp = makeBitmap(200, 300)
    drawVLine(bmp, 40, 10, 290, 2)
    drawVLine(bmp, 120, 50, 250, 1)
    const bin = binarize(bmp)
    const lines = detectVerticalLines(bin, { left: 0, top: 0, right: 199, bottom: 299 })
    expect(lines).toHaveLength(2)
    expect(lines[0]!.xPx).toBe(40)
    expect(lines[0]!.widthPx).toBe(2)
    expect(lines[0]!.runPx).toBe(281)
    expect(lines[1]!.xPx).toBe(120)
  })

  it('短笔画不被当成线', () => {
    const bmp = makeBitmap(200, 300)
    drawVLine(bmp, 40, 100, 110, 1) // 只有 11px，远小于内容区 8%
    const bin = binarize(bmp)
    expect(detectVerticalLines(bin, { left: 0, top: 0, right: 199, bottom: 299 })).toHaveLength(0)
  })
})

describe('detectHorizontalLines', () => {
  it('检出横线', () => {
    const bmp = makeBitmap(300, 200)
    drawHLine(bmp, 30, 10, 290, 2)
    const bin = binarize(bmp)
    const lines = detectHorizontalLines(bin, { left: 0, top: 0, right: 299, bottom: 199 })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.yPx).toBe(30)
    expect(lines[0]!.heightPx).toBe(2)
  })
})

describe('analyzeGeometry', () => {
  it('识别外框作为内容区，并检出内部网格', () => {
    const bmp = makeBitmap(400, 300)
    // 外框贴近画面边缘（占画面 95%+，confidence=high）
    drawFrame(bmp, 10, 10, 389, 289, 2)
    // 内部两条竖线 + 两条横线（模拟表格）
    drawVLine(bmp, 150, 120, 260)
    drawVLine(bmp, 260, 120, 260)
    drawHLine(bmp, 120, 22, 378)
    drawHLine(bmp, 260, 22, 378)

    const g = analyzeGeometry(bmp)
    expect(g.contentArea.confidence).toBe('high')
    expect(g.contentArea.px.left).toBe(10)
    expect(g.contentArea.px.right).toBe(388)
    expect(g.contentArea.px.top).toBe(10)
    expect(g.contentArea.px.bottom).toBe(288)

    // 竖线：外框左右 + 内部 2 条
    const xs = g.verticalLines.map(l => l.xPx).sort((a, b) => a - b)
    expect(xs).toContain(150)
    expect(xs).toContain(260)
    // 归一化：内部 150px 相对内容区 10..388
    const inner = g.verticalLines.find(l => l.xPx === 150)!
    expect(inner.xNorm).toBeCloseTo((150 - 10) / (388 - 10), 3)
  })

  it('contentArea.pageNorm 是内容区相对整幅图像的位置（整版平移的唯一可观测信号）', () => {
    const bmp = makeBitmap(400, 300)
    drawFrame(bmp, 10, 10, 389, 289, 2)
    const g = analyzeGeometry(bmp)
    // 检出的外框在 10..388 / 10..288（2px 线宽的代表列）
    expect(g.contentArea.pageNorm).toEqual({
      left: 10 / 400,
      top: 10 / 300,
      right: 388 / 400,
      bottom: 288 / 300,
    })

    // 整版平移 16px：内容区相对自身恒等（norm 无信息量），pageNorm 才有差异
    const shifted = makeBitmap(400, 300)
    drawFrame(shifted, 26, 10, 389, 289, 2)
    const s = analyzeGeometry(shifted)
    expect(s.contentArea.norm).toEqual(g.contentArea.norm)
    expect(s.contentArea.pageNorm.left).toBeGreaterThan(g.contentArea.pageNorm.left + 14 / 400)
    expect(s.contentArea.pageNorm.left).toBeLessThan(g.contentArea.pageNorm.left + 18 / 400)

    // 无外框退化为整图时 pageNorm 覆盖到图像边缘
    const plain = analyzeGeometry(makeBitmap(300, 200))
    expect(plain.contentArea.pageNorm).toEqual({ left: 0, top: 0, right: 299 / 300, bottom: 199 / 200 })
  })

  it('无外框时退化为整图并降级 confidence', () => {
    const bmp = makeBitmap(300, 200)
    drawHLine(bmp, 100, 10, 290)
    const g = analyzeGeometry(bmp)
    expect(g.contentArea.confidence).toBe('low')
    expect(g.contentArea.px).toEqual({ left: 0, top: 0, right: 299, bottom: 199 })
    expect(g.warnings.some(w => w.includes('未检测到闭合外框'))).toBe(true)
  })

  it('纯空白图：无线条也无表格，给出可读告警', () => {
    const g = analyzeGeometry(makeBitmap(400, 300))
    expect(g.verticalLines).toHaveLength(0)
    expect(g.horizontalLines).toHaveLength(0)
    expect(g.warnings.some(w => w.includes('未检测到任何线条'))).toBe(true)
  })

  it('文本行按区域切分，regionIndex 来自检测到的竖线', () => {
    const bmp = makeBitmap(400, 300)
    drawFrame(bmp, 10, 10, 389, 289, 2)
    drawVLine(bmp, 200, 12, 288) // 中部竖线把内容分成两区
    drawTextBlock(bmp, 40, 60, 80, 1)   // 左区文字
    drawTextBlock(bmp, 240, 120, 80, 1) // 右区文字（不同 y，避免同行合并成一个 band）
    const g = analyzeGeometry(bmp)
    const rows = g.textRows.filter(r => r.yStartPx >= 55 && r.yEndPx <= 135)
    expect(rows.length).toBe(2)
    const left = rows.find(r => r.xEndPx < 200)
    const right = rows.find(r => r.xStartPx > 200)
    expect(left).toBeDefined()
    expect(right).toBeDefined()
    expect(left!.regionIndex).not.toBe(right!.regionIndex)
  })

  it('textRows / tableCandidates 都带相对内容区的 0..1 归一化包围盒', () => {
    const bmp = makeBitmap(400, 300)
    drawFrame(bmp, 10, 10, 389, 289, 2)
    drawHLine(bmp, 100, 12, 388)
    drawHLine(bmp, 180, 12, 388)
    drawVLine(bmp, 200, 12, 288)
    drawTextBlock(bmp, 40, 130, 60, 1)
    const g = analyzeGeometry(bmp)

    for (const row of g.textRows) {
      // norm 存在且 clamp 到 0..1
      expect(row.norm).toBeDefined()
      for (const v of [row.norm.left, row.norm.top, row.norm.right, row.norm.bottom]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      // 归一化与像素坐标互推一致（xStartPx 相对内容区 10..388）
      expect(row.norm.left).toBeCloseTo((row.xStartPx - 10) / (388 - 10), 3)
      expect(row.norm.bottom).toBeCloseTo((row.yEndPx - 10) / (288 - 10), 3)
    }
    expect(g.tableCandidates.length).toBeGreaterThan(0)
    for (const t of g.tableCandidates) {
      expect(t.norm).toBeDefined()
      const norm = t.norm!
      for (const v of [norm.left, norm.top, norm.right, norm.bottom]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      // 左上角归一化与 leftPx/topPx 对应
      expect(norm.left).toBeCloseTo((t.leftPx - 10) / (388 - 10), 3)
      expect(norm.top).toBeCloseTo((t.topPx - 10) / (288 - 10), 3)
    }
  })
})

describe('detectTables', () => {
  it('四边围成的网格被识别为表格候选', () => {
    const bmp = makeBitmap(400, 300)
    drawFrame(bmp, 10, 10, 389, 289, 2)
    drawHLine(bmp, 100, 12, 388)
    drawHLine(bmp, 180, 12, 388)
    drawVLine(bmp, 200, 12, 288)
    const bin = binarize(bmp)
    const area = { left: 10, top: 10, right: 388, bottom: 288 }
    const v = detectVerticalLines(bin, area, 0.1)
    const h = detectHorizontalLines(bin, area, 0.1)
    const tables = detectTables(v, h)
    expect(tables.length).toBeGreaterThanOrEqual(1)
    const t = tables[0]!
    // 外框左右 + 中间 1 条竖线 → 2 段列宽
    expect(t.colWidthsPx.length).toBe(2)
    expect(t.rowHeightsPx.length).toBeGreaterThanOrEqual(2)
    expect(t.colWidthsPx[0]).toBeGreaterThan(100)
  })
})

describe('toMillimeters', () => {
  const g = analyzeGeometry((() => {
    const bmp = makeBitmap(400, 300)
    drawFrame(bmp, 10, 10, 389, 289, 2)
    drawVLine(bmp, 200, 12, 288)
    return bmp
  })())

  it('给 dpi 时按像素物理尺寸换算', () => {
    const mmLayer = toMillimeters(g, { dpi: 96 })!
    expect(mmLayer.pxPerMm).toBeCloseTo(96 / 25.4, 2)
    // 内容区 379px 宽 → 379 / 3.7795 ≈ 100.3mm
    expect(mmLayer.contentAreaMm.width).toBeCloseTo(100.3, 0)
  })

  it('给纸质尺寸时以宽度比例反推，比例不匹配时告警', () => {
    const mmLayer = toMillimeters(g, { paper: { widthMm: 200, heightMm: 160, margins: { top: 0, right: 0, bottom: 0, left: 0 } } })!
    expect(mmLayer.contentAreaMm.width).toBeCloseTo(200, 0)
    // 内容区 379×279（比例 1.359）与 200×160（1.25）不符，应给出告警
    expect(mmLayer.warnings.some(w => w.includes('比例不一致'))).toBe(true)
  })

  it('既无 dpi 也无 paper 时返回 undefined（只保留像素与归一化层）', () => {
    expect(toMillimeters(g, {})).toBeUndefined()
  })

  it('dpi 优先于 paper', () => {
    const byDpi = toMillimeters(g, { dpi: 96, paper: { widthMm: 999, heightMm: 999 } })!
    expect(byDpi.contentAreaMm.width).toBeCloseTo(100.3, 0)
    expect(byDpi.warnings).toEqual([])
  })
})
