import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildBatchPageCss, buildPageCss, buildSheetPageCss, buildBasePageCss, buildPageGeometryCss } from './css-builder.js'
import type { TemplateData } from './types.js'
import type { TileLayout } from '../print/tiling.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function tpl(paperSize: 'A4' | 'CONTINUOUS'): TemplateData {
  return {
    paperSize,
    orientation: 'portrait',
    customWidth: 80,
    margins: { top: 0, right: 0, bottom: 2, left: 0 },
    header: { height: 0, elements: [] },
    footer: { height: 4, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
  } as unknown as TemplateData
}

describe('buildBatchPageCss', () => {
  it('固定纸：单一 @page + 份间分页，无命名页', () => {
    const css = buildBatchPageCss(tpl('A4'), [{}, {}])
    expect(css).toContain('@page {')
    expect(css).toContain('.print-copy:not(:last-child)')
    expect(css).not.toContain('@page copy0')
  })

  it('连续纸：每份命名页尺寸与作用域 min-height/footer top', () => {
    const css = buildBatchPageCss(tpl('CONTINUOUS'), [{ heightMm: 100 }, { heightMm: 200 }])
    expect(css).toContain('@page copy0 { size: 80mm 100mm')
    expect(css).toContain('@page copy1 { size: 80mm 200mm')
    expect(css).toContain('.print-copy-0 { page: copy0; }')
    expect(css).toContain('.print-copy-1 .print-page { min-height: 200mm; }')
    // footer top = 纸高 100 - 下边距 2 - 页脚 4 = 94mm
    expect(css).toContain('.print-copy-0 .page-footer { top: 94mm; }')
    expect(css).toContain('.print-copy:not(:last-child)')
  })
})

describe('buildSheetPageCss', () => {
  const layout: TileLayout = {
    tile: { width: 70, height: 40 },
    sheet: { width: 210, height: 297 },
    columns: 2,
    rows: 6,
    perSheet: 12,
    maxColumns: 2,
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
    gapX: 2,
    gapY: 2,
  }
  const css = buildSheetPageCss(layout)

  it('@page 用拼版纸尺寸且 margin 为 0', () => {
    expect(css).toContain('@page { size: 210mm 297mm; margin: 0; }')
  })

  it('张容器为整页高 + 显式 break-after，末张取消（SPIKE D3）', () => {
    expect(css).toContain('.print-sheet')
    expect(css).toMatch(/height:\s*297mm/)
    expect(css).toContain('break-after: page')
    expect(css).toContain('.print-sheet:last-child { break-after: auto; page-break-after: auto; }')
  })

  it('格容器绝对定位且尺寸等于标签尺寸', () => {
    expect(css).toMatch(/\.print-tile\s*\{[^}]*position:\s*absolute/)
    expect(css).toMatch(/\.print-tile\s*\{[^}]*width:\s*70mm/)
    expect(css).toMatch(/\.print-tile\s*\{[^}]*height:\s*40mm/)
  })

  it('拼版 @page 必须排在标签 @page 之后（SPIKE D4 回归保护）', () => {
    const label = { ...tpl('A4'), paperSize: 'CUSTOM', customWidth: 70, customHeight: 40 } as unknown as TemplateData
    const full = buildPageCss(label) + buildSheetPageCss(layout)
    expect(full.lastIndexOf('@page')).toBeGreaterThan(full.indexOf('@page'))
    expect(full.indexOf('size: 210mm 297mm')).toBeGreaterThan(full.indexOf('size: 70mm 40mm'))
  })

  it('预览期覆盖格内 .print-page 的 margin（SPIKE D1 回归保护）', () => {
    expect(css).toContain('.print-tile > .print-page { margin: 0; box-shadow: none; }')
  })
})

// ─── 多页面模板：CSS 作用域化重构的零回归与作用域验证 ───

function fixture(over: Partial<TemplateData>): TemplateData {
  return {
    paperSize: 'A4', orientation: 'portrait',
    margins: { top: 10, right: 12, bottom: 8, left: 14 },
    header: { height: 15, elements: [] },
    footer: { height: 12, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    ...over,
  }
}

// 重构前 buildPageCss 输出 fixture（dump-css 生成，保持逐字比对）
const cssFixture = JSON.parse(
  readFileSync(join(__dirname, '__fixtures__', 'build-page-css.json'), 'utf-8'),
) as Record<string, string>

describe('多页面模板：buildPageCss 重构零回归', () => {
  const t1 = fixture({ pageBackground: '#f5f5f5' })
  const t2 = fixture({
    paperSize: 'A4', orientation: 'landscape',
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
    header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
    firstPageOverlay: { height: 20, elements: [] },
  })
  const t3 = fixture({
    paperSize: 'CUSTOM', orientation: 'portrait', customWidth: 120, customHeight: 80,
    margins: { top: 3, right: 4, bottom: 5, left: 6 },
    header: { height: 8, elements: [] }, footer: { height: 6, elements: [] },
    firstPageOverlay: { height: 10, elements: [] },
  })
  const t4 = fixture({
    paperSize: 'CONTINUOUS', orientation: 'portrait', customWidth: 80,
    margins: { top: 2, right: 2, bottom: 10, left: 2 },
    header: { height: 5, elements: [] }, footer: { height: 8, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
  })

  it('A4 竖版与 fixture 逐字一致', () => {
    expect(buildPageCss(t1)).toBe(cssFixture.a4Portrait)
  })
  it('A4 横版与 fixture 逐字一致', () => {
    expect(buildPageCss(t2)).toBe(cssFixture.a4Landscape)
  })
  it('CUSTOM 纸张与 fixture 逐字一致', () => {
    expect(buildPageCss(t3)).toBe(cssFixture.custom)
  })
  it('连续纸推导纸高与 fixture 逐字一致', () => {
    expect(buildPageCss(t4, 123.45)).toBe(cssFixture.continuous)
  })
})

describe('多页面模板：作用域几何 CSS', () => {
  it('页面规则按 .mt-N 作用域，:last-child 保持全局', () => {
    const t = fixture({
      paperSize: 'A4', orientation: 'landscape',
      margins: { top: 5, right: 5, bottom: 5, left: 5 },
      header: { height: 0, elements: [] }, footer: { height: 0, elements: [] },
      firstPageOverlay: { height: 20, elements: [] },
    })
    const css = `${buildBasePageCss()}\n${buildPageGeometryCss(t, '.mt-1')}`
    expect(css).toContain('.mt-1.print-page {')
    expect(css).toContain('padding: 5mm 5mm 5mm 5mm;')
    // :last-child 必须保持全局（仅文档末页取消强制分页，模板边界仍需分页）
    expect(css).toContain('.print-page:last-child {')
    expect(css).not.toContain('.mt-1.print-page:last-child {')
    // 区域规则后代作用域
    expect(css).toContain('.mt-1 .page-header {')
    expect(css).toContain('.mt-1 .page-footer {')
    expect(css).toContain('.mt-1 .content-area {')
    expect(css).toContain('.mt-1 .first-page-overlay {')
  })

  it('同一纸张不同边距的多页模板：作用域规则互不干扰', () => {
    const pageA = fixture({})
    const pageB = fixture({ margins: { top: 2, right: 2, bottom: 2, left: 2 } })
    const css = `${buildPageCss(pageA)}\n${buildPageGeometryCss(pageB, '.mt-1')}`
    expect(css).toContain('.print-page {\n  width: 210mm;\n  min-height: 297mm;\n  background: #fff;\n  padding: 10mm 12mm 8mm 14mm;')
    expect(css).toContain('.mt-1.print-page {\n  width: 210mm;\n  min-height: 297mm;\n  background: #fff;\n  padding: 2mm 2mm 2mm 2mm;')
  })
})

describe('出纸旋转（outputRotation）整页旋转', () => {
  it('旋转 90°：@page/外层为竖向纸，转子为设计稿横版并旋转 90°', () => {
    const t = fixture({
      orientation: 'landscape',
      outputRotation: 90,
      margins: { top: 10, right: 12, bottom: 8, left: 14 },
      header: { height: 15, elements: [] },
      footer: { height: 12, elements: [] },
    })
    const css = buildPageCss(t)
    // 外层（出纸）尺寸 = 竖向纸 210×297
    expect(css).toContain('@page { size: 210mm 297mm; margin: 0; }')
    expect(css).toMatch(/\.print-page\s*\{[^}]*width:\s*210mm/)
    expect(css).toMatch(/\.print-page\s*\{[^}]*min-height:\s*297mm/)
    // 旋转时 .print-page 不内边距（边距由转子承担）
    expect(css).toMatch(/\.print-page\s*\{[^}]*padding:\s*0;/)
    // 转子层 = 设计稿横版 297×210，整页旋转 90° 填入竖向纸（基础规则 + -90 修饰类）
    expect(css).toContain('.print-page-rotor {')
    expect(css).toMatch(/\.print-page-rotor\s*\{[^}]*width:\s*297mm/)
    expect(css).toMatch(/\.print-page-rotor\s*\{[^}]*height:\s*210mm/)
    expect(css).toContain('.print-page-rotor-90 {')
    expect(css).toContain('transform: translate(210mm, 0mm) rotate(90deg);')
    // 三区几何基于设计稿（横版 297×210）：内容宽 = 297-14-12=271，页脚 top = 210-8-12=190
    expect(css).toMatch(/\.content-area\s*\{[^}]*width:\s*271mm/)
    expect(css).toMatch(/\.page-footer\s*\{[^}]*top:\s*190mm/)
  })

  it('旋转 180°：纸张不变（仍横版 297×210），转子翻转 180°', () => {
    const t = fixture({
      orientation: 'landscape',
      outputRotation: 180,
      margins: { top: 10, right: 12, bottom: 8, left: 14 },
      header: { height: 15, elements: [] },
      footer: { height: 12, elements: [] },
    })
    const css = buildPageCss(t)
    expect(css).toContain('@page { size: 297mm 210mm; margin: 0; }')
    expect(css).toContain('.print-page-rotor-180 {')
    expect(css).toContain('transform: translate(297mm, 210mm) rotate(180deg);')
  })

  it('旋转 270°：纸张交换长宽（竖向 210×297），转子旋转 270°', () => {
    const t = fixture({
      orientation: 'landscape',
      outputRotation: 270,
      margins: { top: 10, right: 12, bottom: 8, left: 14 },
    })
    const css = buildPageCss(t)
    expect(css).toContain('@page { size: 210mm 297mm; margin: 0; }')
    expect(css).toContain('.print-page-rotor-270 {')
    expect(css).toContain('transform: translate(0mm, 297mm) rotate(270deg);')
  })

  it('无 outputRotation（0°）时不输出转子规则（零回归）', () => {
    const css = buildPageCss(fixture({ orientation: 'landscape' }))
    expect(css).not.toContain('.print-page-rotor')
    expect(css).not.toContain('rotate(90deg)')
    expect(css).not.toContain('rotate(180deg)')
    expect(css).not.toContain('rotate(270deg)')
  })

  it('连续纸忽略旋转：不输出转子', () => {
    const css = buildPageCss(fixture({ paperSize: 'CONTINUOUS', orientation: 'portrait', outputRotation: 90 }))
    expect(css).not.toContain('.print-page-rotor')
  })
})
