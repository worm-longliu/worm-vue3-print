import { describe, it, expect } from 'vitest'
import {
  buildPdfTargetSpec,
  toElectronPrintToPdfOptions,
  toPlaywrightPdfOptions,
  buildScreenshotTargetSpec,
} from '../pdf-spec.js'

describe('buildPdfTargetSpec', () => {
  it('固定零边距、保留背景、缩放 1、不优先 CSS 纸型', () => {
    expect(buildPdfTargetSpec({ width: 210, height: 297 })).toEqual({
      paperMm: { width: 210, height: 297 },
      marginsMm: { top: 0, right: 0, bottom: 0, left: 0 },
      printBackground: true,
      scale: 1,
      preferCSSPageSize: false,
    })
  })
})

describe('toElectronPrintToPdfOptions', () => {
  it('纸张毫米换算为英寸：printToPDF 的 pageSize 单位是英寸，不是微米', () => {
    const opts = toElectronPrintToPdfOptions(buildPdfTargetSpec({ width: 210, height: 297 }))
    expect(opts.pageSize.width).toBeCloseTo(8.2677165354, 9)
    expect(opts.pageSize.height).toBeCloseTo(11.6929133858, 9)
  })
  it('零边距 + 保留背景 + 不优先 CSS 纸型', () => {
    const opts = toElectronPrintToPdfOptions(buildPdfTargetSpec({ width: 80, height: 132.5 }))
    expect(opts.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
    expect(opts.printBackground).toBe(true)
    expect(opts.scale).toBe(1)
    expect(opts.preferCSSPageSize).toBe(false)
  })
  it('连续纸推导高度同样按英寸换算', () => {
    const opts = toElectronPrintToPdfOptions(buildPdfTargetSpec({ width: 80, height: 132.5 }))
    expect(opts.pageSize.height).toBeCloseTo(5.2165354331, 9)
  })
})

describe('toPlaywrightPdfOptions', () => {
  it('显式 mm 宽高 + 零边距 + 保留背景 + 不优先 CSS 纸型', () => {
    expect(toPlaywrightPdfOptions(buildPdfTargetSpec({ width: 80, height: 132.5 }))).toEqual({
      width: '80mm',
      height: '132.5mm',
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
  })
})

describe('buildScreenshotTargetSpec', () => {
  it('PNG、整页、不省略背景', () => {
    expect(buildScreenshotTargetSpec()).toEqual({ type: 'png', fullPage: true, omitBackground: false })
  })
})
