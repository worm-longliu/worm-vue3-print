import { millimetersToInches } from './units.js'
import type { MarginsMm, PaperMm, PdfTargetSpec, ScreenshotTargetSpec } from './types.js'

const ZERO_MARGINS_MM: MarginsMm = { top: 0, right: 0, bottom: 0, left: 0 }

/** 边距恒为零：边距由 core 生成的 HTML padding 控制，避免两层边距叠加 */
export function buildPdfTargetSpec(paperMm: PaperMm): PdfTargetSpec {
  return {
    paperMm,
    marginsMm: { ...ZERO_MARGINS_MM },
    printBackground: true,
    scale: 1,
    preferCSSPageSize: false,
  }
}

/** Electron.PrintToPDFOptions 的最小结构（pageSize/margins 单位均为英寸） */
export interface ElectronPrintToPdfOptions {
  margins: MarginsMm
  pageSize: { width: number; height: number }
  printBackground: boolean
  scale: number
  preferCSSPageSize: boolean
}

export function toElectronPrintToPdfOptions(spec: PdfTargetSpec): ElectronPrintToPdfOptions {
  return {
    margins: { ...spec.marginsMm },
    pageSize: {
      width: millimetersToInches(spec.paperMm.width),
      height: millimetersToInches(spec.paperMm.height),
    },
    printBackground: spec.printBackground,
    scale: spec.scale,
    preferCSSPageSize: spec.preferCSSPageSize,
  }
}

/** Playwright page.pdf 的最小结构（宽高与边距使用 mm 字符串） */
export interface PlaywrightPdfOptions {
  width: string
  height: string
  margin: { top: string; right: string; bottom: string; left: string }
  printBackground: boolean
  preferCSSPageSize: boolean
}

export function toPlaywrightPdfOptions(spec: PdfTargetSpec): PlaywrightPdfOptions {
  const mm = (value: number): string => `${value}mm`
  return {
    width: mm(spec.paperMm.width),
    height: mm(spec.paperMm.height),
    margin: {
      top: mm(spec.marginsMm.top),
      right: mm(spec.marginsMm.right),
      bottom: mm(spec.marginsMm.bottom),
      left: mm(spec.marginsMm.left),
    },
    printBackground: spec.printBackground,
    preferCSSPageSize: spec.preferCSSPageSize,
  }
}

/** Playwright page.screenshot 的最小结构 */
export function buildScreenshotTargetSpec(): ScreenshotTargetSpec {
  return { type: 'png', fullPage: true, omitBackground: false }
}
