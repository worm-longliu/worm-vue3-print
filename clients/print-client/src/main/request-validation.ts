// print.submit payload 校验：边界在进入打印引擎前收敛，错误一律 INVALID_REQUEST。
import type { PrintOptions } from '@worm-vue3-print/client'
import { ProtocolFailure } from './protocol-error.js'
import type { RenderJobSpec } from '../shared/render-protocol.js'

function invalid(message: string): never {
  throw new ProtocolFailure('INVALID_REQUEST', message)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0
}

export function parsePrintSubmit(raw: unknown): { spec: RenderJobSpec; print: PrintOptions } {
  if (!isRecord(raw)) invalid('请求体必须是对象')
  if (!isRecord(raw.templateJson)) invalid('templateJson 必须是对象')

  const printRaw = raw.print === undefined ? {} : raw.print
  if (!isRecord(printRaw)) invalid('print 必须是对象')

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
    if (typeof printRaw.landscape !== 'boolean') invalid('print.landscape 必须是布尔值')
    print.landscape = printRaw.landscape
  }
  if (printRaw.color !== undefined) {
    if (typeof printRaw.color !== 'boolean') invalid('print.color 必须是布尔值')
    print.color = printRaw.color
  }
  if (printRaw.paperSize !== undefined) {
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

  const spec: RenderJobSpec = { templateJson: raw.templateJson }
  if (raw.printData !== undefined) {
    if (!isRecord(raw.printData) && !Array.isArray(raw.printData)) {
      invalid('printData 必须是对象或数组')
    }
    spec.printData = raw.printData as Record<string, unknown>
  }
  if (raw.baseUrl !== undefined) {
    if (typeof raw.baseUrl !== 'string') invalid('baseUrl 必须是字符串')
    spec.baseUrl = raw.baseUrl
  }
  return { spec, print }
}

/** 从模板 JSON 中尽力读取模板名（兼容不同字段） */
export function readTemplateName(templateJson: Record<string, unknown>): string {
  const v = templateJson.templateName ?? templateJson.name ?? templateJson.title
  return typeof v === 'string' && v.length > 0 ? v : '未命名模板'
}
