import { z } from 'zod'
import { OPTION_META, OPTION_KEYS } from '../option-meta.js'
import type { OptionMeta } from '../units.js'

/** 按元数据推导单键 schema；长度类只校验「数值 + 区间」，不做像素/毫米换算 */
function optionValueSchema(meta: OptionMeta): z.ZodTypeAny {
  switch (meta.kind) {
    case 'mm':
    case 'pt':
    case 'count': {
      let s: z.ZodNumber = z.number().finite()
      if (meta.min !== undefined) s = s.min(meta.min)
      if (meta.max !== undefined) s = s.max(meta.max)
      return s
    }
    case 'bool': return z.boolean()
    case 'color': return z.union([z.string(), z.number()])
    case 'text': return z.union([z.string(), z.number()])
    case 'enum': return z.enum((meta.enum ?? []) as [string, ...string[]])
    case 'object': return z.unknown()
  }
}

const optionalShape = Object.fromEntries(
  OPTION_KEYS.map(k => [k, optionValueSchema(OPTION_META[k]).optional()]),
)

/** 四个几何键是元素必填项，放最后展开以覆盖 optional() */
export const elementOptionsSchema = z.object({
  ...optionalShape,
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).catchall(z.unknown())

export const tableCellSchema = z.object({
  id: z.string().optional(),
  formatter: z.string().optional(),
  cellType: z.enum(['text', 'barcode', 'qrcode', 'image']).optional(),
  rowspan: z.number().int().positive().optional(),
  colspan: z.number().int().positive().optional(),
  merged: z.boolean().optional(),
  mergeSameValue: z.boolean().optional(),
}).catchall(z.unknown())

export const tableRowSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['header', 'data', 'subtotal', 'summary']).optional(),
  height: z.number().finite().nonnegative(),
  repeatOnPage: z.boolean().optional(),
  cells: z.array(tableCellSchema),
}).catchall(z.unknown())

export const printElementDataSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  options: elementOptionsSchema,
  printElementType: z.object({
    type: z.string(),
    title: z.string().optional(),
    editable: z.boolean().optional(),
    formatter: z.string().optional(),
    styler: z.string().optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown())

export const KNOWN_OPTION_KEYS = new Set<string>(OPTION_KEYS)
