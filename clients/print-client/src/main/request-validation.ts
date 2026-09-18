// print.submit / print.submitHtml payload 校验：边界在进入打印引擎前收敛，错误一律 INVALID_REQUEST。
import type { PrintOptions } from '@worm-vue3-print/client'
import { MAX_BATCH_COPIES } from '@worm-vue3-print/core'
import { ProtocolFailure } from './protocol-error.js'

/** print.submit 校验后的模板渲染任务（原 shared/render-protocol.ts 的 RenderJobSpec） */
export interface PrintSubmitSpec {
  templateJson: Record<string, unknown>
  /** 对象=单份；非空对象数组=批量（上限 MAX_BATCH_COPIES，合并为一个作业） */
  printData?: Record<string, unknown> | Array<Record<string, unknown>>
  baseUrl?: string
  /** 相对路径字体资源基址；缺省回落 baseUrl */
  fontBaseUrl?: string
  /** 连续纸显式纸高逃生门（mm） */
  paperHeightMm?: number
}

/** print.submitHtml 允许携带的打印参数子集（纸张/方向/边距已固化在预渲染 HTML 中） */
export type HtmlPrintOptions = Pick<
  PrintOptions,
  'printerName' | 'copies' | 'paperName' | 'color' | 'pageRanges'
>

/** print.submitHtml 校验后的任务结构 */
export interface HtmlPrintJob {
  html: string
  paperMm: { width: number; height: number }
  continuous: boolean
  pageCount?: number
  print: HtmlPrintOptions
  templateName: string
}

/** HTML 载荷上限（20MB）：正常模板图片走 URL 不内联，超限视为非法请求 */
export const MAX_HTML_BYTES = 20 * 1024 * 1024

function invalid(message: string): never {
  throw new ProtocolFailure('INVALID_REQUEST', message)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

/** 校验 printData：对象放行；数组检查非空、上限与每项类型（与 core normalizePrintData 文案一致） */
function parsePrintData(
  value: unknown,
): Record<string, unknown> | Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    if (value.length === 0) invalid('批量打印数据必须是非空对象数组')
    if (value.length > MAX_BATCH_COPIES) {
      invalid(`批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${value.length} 份`)
    }
    for (let i = 0; i < value.length; i++) {
      if (!isRecord(value[i]) || Array.isArray(value[i])) {
        invalid(`批量打印数据第 ${i + 1} 项必须是对象`)
      }
    }
    return value as Array<Record<string, unknown>>
  }
  if (!isRecord(value)) invalid('printData 必须是对象或数组')
  return value
}

function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

/** 解析 print 对象的通用字段（两种提交通道共用） */
function parsePrintOptions(raw: unknown, { allowPaperOverrides }: {
  allowPaperOverrides: boolean
}): PrintOptions {
  if (!isRecord(raw)) invalid('print 必须是对象')
  const printRaw = raw
  const print: PrintOptions = {}
  if (printRaw.printerName !== undefined) {
    if (typeof printRaw.printerName !== 'string') invalid('print.printerName 必须是字符串')
    print.printerName = printRaw.printerName
  }
  if (printRaw.copies !== undefined) {
    if (!isPositiveInt(printRaw.copies)) invalid('print.copies 必须是正整数')
    print.copies = printRaw.copies
  }
  if (printRaw.paperName !== undefined) {
    if (typeof printRaw.paperName !== 'string') invalid('print.paperName 必须是字符串')
    print.paperName = printRaw.paperName
  }
  if (printRaw.landscape !== undefined) {
    if (!allowPaperOverrides) invalid('预渲染 HTML 已固化方向，print.landscape 不允许覆盖')
    if (typeof printRaw.landscape !== 'boolean') invalid('print.landscape 必须是布尔值')
    print.landscape = printRaw.landscape
  }
  if (printRaw.color !== undefined) {
    if (typeof printRaw.color !== 'boolean') invalid('print.color 必须是布尔值')
    print.color = printRaw.color
  }
  if (printRaw.paperSize !== undefined) {
    if (!allowPaperOverrides) invalid('预渲染 HTML 已固化纸张，print.paperSize 不允许覆盖')
    if (!isRecord(printRaw.paperSize)) invalid('print.paperSize 必须是对象')
    const width = printRaw.paperSize.width
    if (width !== undefined && !isPositiveInt(width)) {
      invalid('print.paperSize.width 必须是正整数（微米）')
    }
    const height = printRaw.paperSize.height
    if (height !== undefined && height !== 0 && !isPositiveInt(height)) {
      invalid('print.paperSize.height 必须是正整数或 0（0 表示推导）')
    }
    print.paperSize = { width: width as number | undefined, height: height as number | undefined }
  }
  if (printRaw.margins !== undefined) {
    if (!allowPaperOverrides) invalid('预渲染 HTML 已固化边距，print.margins 不允许覆盖')
    const m = printRaw.margins
    if (!isRecord(m)) invalid('print.margins 必须是对象')
    for (const k of ['top', 'bottom', 'left', 'right'] as const) {
      if (typeof m[k] !== 'number' || (m[k] as number) < 0) {
        invalid(`print.margins.${k} 必须是非负数字（微米）`)
      }
    }
    print.margins = {
      top: m.top as number,
      bottom: m.bottom as number,
      left: m.left as number,
      right: m.right as number,
    }
  }
  if (printRaw.pageRanges !== undefined) {
    if (!Array.isArray(printRaw.pageRanges)) invalid('print.pageRanges 必须是数组')
    print.pageRanges = printRaw.pageRanges.map((r, i) => {
      if (!isRecord(r) || !isPositiveInt(r.from) || !isPositiveInt(r.to) || r.to < r.from) {
        invalid(`print.pageRanges[${i}] 非法`)
      }
      return { from: r.from as number, to: r.to as number }
    })
  }
  return print
}

export function parsePrintSubmit(raw: unknown): {
  spec: PrintSubmitSpec
  print: PrintOptions
  templateName: string
} {
  if (!isRecord(raw)) invalid('请求体必须是对象')
  if (!isRecord(raw.templateJson)) invalid('templateJson 必须是对象')

  const printRaw = raw.print === undefined ? {} : raw.print
  if (!isRecord(printRaw)) invalid('print 必须是对象')
  const print = parsePrintOptions(printRaw, { allowPaperOverrides: true })

  const spec: PrintSubmitSpec = { templateJson: raw.templateJson }
  if (raw.printData !== undefined) {
    spec.printData = parsePrintData(raw.printData)
  }
  if (raw.baseUrl !== undefined) {
    if (typeof raw.baseUrl !== 'string') invalid('baseUrl 必须是字符串')
    spec.baseUrl = raw.baseUrl
  }
  if (raw.fontBaseUrl !== undefined) {
    if (typeof raw.fontBaseUrl !== 'string') invalid('fontBaseUrl 必须是字符串')
    spec.fontBaseUrl = raw.fontBaseUrl
  }

  return { spec, print, templateName: parseTemplateName(raw.templateName) }
}

/** 校验 print.submitHtml：浏览器预渲染 HTML 直提交通道 */
export function parsePrintSubmitHtml(raw: unknown): HtmlPrintJob {
  if (!isRecord(raw)) invalid('请求体必须是对象')

  if (typeof raw.html !== 'string' || raw.html.trim().length === 0) {
    invalid('html 必须是非空字符串')
  }
  const byteLength = Buffer.byteLength(raw.html, 'utf8')
  if (byteLength > MAX_HTML_BYTES) {
    invalid(`html 载荷超过 ${MAX_HTML_BYTES} 字节上限`)
  }

  if (!isRecord(raw.paperMm)) invalid('paperMm 必须是对象')
  if (!isPositiveFinite(raw.paperMm.width) || !isPositiveFinite(raw.paperMm.height)) {
    invalid('paperMm.width/height 必须是正数（毫米）')
  }

  const printRaw = raw.print === undefined ? {} : raw.print
  if (!isRecord(printRaw)) invalid('print 必须是对象')
  // 纸张/方向/边距已由浏览器侧 core 固化进最终 HTML，禁止协议层覆盖
  const print = parsePrintOptions(printRaw, { allowPaperOverrides: false })

  let continuous = false
  if (raw.continuous !== undefined) {
    if (typeof raw.continuous !== 'boolean') invalid('continuous 必须是布尔值')
    continuous = raw.continuous
  }

  let pageCount: number | undefined
  if (raw.pageCount !== undefined) {
    if (!isPositiveInt(raw.pageCount)) invalid('pageCount 必须是正整数')
    pageCount = raw.pageCount
  }

  return {
    html: raw.html,
    paperMm: { width: raw.paperMm.width, height: raw.paperMm.height },
    continuous,
    pageCount,
    print,
    templateName: parseTemplateName(raw.templateName),
  }
}

function parseTemplateName(v: unknown): string {
  if (v === undefined) return ''
  if (typeof v !== 'string') invalid('templateName 必须是字符串')
  return v.trim()
}

/**
 * 从模板 JSON 中尽力读取模板名（兼容不同字段）。
 * 显式传入的模板名称（打印协议 templateName，业务元数据）优先，
 * 再回退读取渲染 JSON 中的 templateName/name/title。
 */
export function readTemplateName(
  templateJson: Record<string, unknown>,
  fallbackName = '',
): string {
  if (fallbackName.trim().length > 0) return fallbackName
  const v = templateJson.templateName ?? templateJson.name ?? templateJson.title
  return typeof v === 'string' && v.length > 0 ? v : '未命名模板'
}
