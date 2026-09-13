// 生成 PDF 落盘策略单测：默认落临时目录并删除；开启保留后落指定目录
import { describe, it, expect } from 'vitest'
import {
  resolvePdfPath,
  shouldKeepPdf,
  buildPdfOutputPolicy,
  TEMP_PDF_DIR,
} from './pdf-output.js'

describe('resolvePdfPath', () => {
  it('未开启保留：落系统临时目录', () => {
    const p = resolvePdfPath('job-1', { keep: false, dir: '/Users/x/PrintPdf' })
    expect(p).toBe(`${TEMP_PDF_DIR}/job-1.pdf`)
  })

  it('开启保留：落指定目录', () => {
    const p = resolvePdfPath('job-2', { keep: true, dir: '/Users/x/PrintPdf' })
    expect(p).toBe('/Users/x/PrintPdf/job-2.pdf')
  })

  it('开启保留但目录为空：回退临时目录（避免写到根目录/当前目录）', () => {
    const p = resolvePdfPath('job-3', { keep: true, dir: '' })
    expect(p).toBe(`${TEMP_PDF_DIR}/job-3.pdf`)
  })
})

describe('shouldKeepPdf', () => {
  it('仅在 keep=true 且目录非空时保留', () => {
    expect(shouldKeepPdf({ keep: true, dir: '/tmp/x' })).toBe(true)
    expect(shouldKeepPdf({ keep: true, dir: '   ' })).toBe(false)
    expect(shouldKeepPdf({ keep: false, dir: '/tmp/x' })).toBe(false)
  })
})

describe('buildPdfOutputPolicy（配置 → 落盘策略）', () => {
  it('目录留空：用 <userData>/pdf', () => {
    expect(buildPdfOutputPolicy({ keepGeneratedPdf: true, pdfOutputDir: '  ' }, '/Users/x/Library/App'))
      .toEqual({ keep: true, dir: '/Users/x/Library/App/pdf' })
  })
  it('指定目录：去掉首尾空白后使用', () => {
    expect(buildPdfOutputPolicy({ keepGeneratedPdf: true, pdfOutputDir: ' /Users/x/PrintPdf ' }, '/u'))
      .toEqual({ keep: true, dir: '/Users/x/PrintPdf' })
  })
  it('未开启：keep=false（目录仍解析，便于配置页展示）', () => {
    expect(buildPdfOutputPolicy({ keepGeneratedPdf: false, pdfOutputDir: '' }, '/u'))
      .toEqual({ keep: false, dir: '/u/pdf' })
  })
})
