import { z } from 'zod'
import type { ElementType } from '@worm-vue3-print/core/designer'
import { OPTION_META, OPTION_KEYS } from '../option-meta.js'
import type { OptionMeta } from '../units.js'

/** 13 种元素类型：与 core `ElementType` 逐字对齐（文件末尾有双向漂移闸门） */
export const elementTypeSchema = z.enum([
  'text', 'image', 'longText', 'table', 'flowList', 'hline', 'vline', 'rect', 'oval',
  'barcode', 'qrcode', 'html', 'pageNumber',
])

// 方向一：本包不得出现 core 不认的类型；方向二：core 的类型不得漏项
const _elementTypeValues: readonly ElementType[] = elementTypeSchema.options
type _ElementTypeMissing = Exclude<ElementType, (typeof elementTypeSchema.options)[number]>
const _elementTypeFull: _ElementTypeMissing extends never ? true : never = true
void _elementTypeValues
void _elementTypeFull

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

/** 元素分边边框（types.ts:261-268/308）：四边各自 { width pt, style, color } */
const elementBorderEdgeSchema = z.object({
  width: z.number().finite().nonnegative(),
  style: z.string().optional(),
  color: z.union([z.string(), z.number()]).optional(),
}).catchall(z.unknown())

const bordersSchema = z.object({
  top: elementBorderEdgeSchema.optional(),
  right: elementBorderEdgeSchema.optional(),
  bottom: elementBorderEdgeSchema.optional(),
  left: elementBorderEdgeSchema.optional(),
}).catchall(z.unknown())

/**
 * 复合对象键的结构校验：OPTION_META 里这些键只标了 kind='object'，
 * 整块 z.unknown() 等于放行任意结构，AI 写错也检不出来，故在此逐个覆盖。
 * 存量兼容优先：内部字段一律 optional，只校验「出现了就必须是合法形状」。
 */
const STRUCTURED_OVERRIDES: Record<string, z.ZodTypeAny> = {
  borders: bordersSchema,
  pagination: z.object({
    pageable: z.boolean().optional(),
    keepWithNext: z.boolean().optional(),
  }).catchall(z.unknown()),
  tablePagination: z.object({ enabled: z.boolean().optional() }).catchall(z.unknown()),
  tableColWidths: z.array(z.number().finite().nonnegative()),
  tableRows: z.array(tableRowSchema),
}

const optionalShape = Object.fromEntries(
  OPTION_KEYS.map(k => [
    k,
    (STRUCTURED_OVERRIDES[k] ?? optionValueSchema(OPTION_META[k])).optional(),
  ]),
)

/** 四个几何键是元素必填项，放最后展开以覆盖 optional() */
export const elementOptionsSchema = z.object({
  ...optionalShape,
  left: z.number().finite(),
  top: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).catchall(z.unknown())

export const printElementDataSchema = z.object({
  id: z.string().optional(),
  // 类型必须落在 core 的 ElementType 上：拼错（Text / tabel）过去整块放行，
  // 草稿会静默产出一个渲染端不认识的元素（element-factory 走 default 分支）
  type: elementTypeSchema.optional(),
  options: elementOptionsSchema,
  printElementType: z.object({
    type: elementTypeSchema,
    title: z.string().optional(),
    editable: z.boolean().optional(),
    formatter: z.string().optional(),
    styler: z.string().optional(),
  }).catchall(z.unknown()),
}).catchall(z.unknown())

export const KNOWN_OPTION_KEYS = new Set<string>(OPTION_KEYS)
