import { z } from 'zod'
import type { PaperSize } from '@worm-vue3-print/core/designer'
import { printElementDataSchema } from './element.js'

export const paperSizeSchema = z.enum([
  'A4', 'A3', 'A5', 'Letter', 'Legal',
  'DOT_FULL', 'DOT_HALF', 'DOT_THIRD',
  'LABEL_80X60', 'LABEL_60X40', 'LABEL_40X30',
  'THERMAL_57', 'THERMAL_80', 'THERMAL_110',
  'CUSTOM', 'CONTINUOUS',
])

/** 拼版目标纸：与 core `Exclude<PaperSize,'CONTINUOUS'>` 同集合（连续纸不能拼版） */
export const sheetPaperSizeSchema = z.enum([
  'A4', 'A3', 'A5', 'Letter', 'Legal',
  'DOT_FULL', 'DOT_HALF', 'DOT_THIRD',
  'LABEL_80X60', 'LABEL_60X40', 'LABEL_40X30',
  'THERMAL_57', 'THERMAL_80', 'THERMAL_110',
  'CUSTOM',
])

const mmBox = z.object({
  top: z.number().finite(), right: z.number().finite(),
  bottom: z.number().finite(), left: z.number().finite(),
}).catchall(z.unknown())

function createZoneSchema(elementSchema: z.ZodTypeAny) {
  return z.object({
    height: z.number().finite().nonnegative(),
    elements: z.array(elementSchema),
  }).catchall(z.unknown())
}

/**
 * 模板顶层可选的插件清单（设计文档 §3.4 / §3.7）：
 * 有该字段 → strict 强校验（按注册态放行类型、缺插件报 MISSING_PLUGIN）；
 * 无该字段 → legacy 宽松（历史模板零迁移）。清单只做声明，服务端禁止据此动态 import。
 */
export const pluginsDeclarationSchema = z.array(z.object({
  id: z.string().min(1),
  version: z.string().optional(),
}).catchall(z.unknown())).optional()

/** 字段逐条对齐 core print/tiling.ts:12，enabled/sheetMargin/gapX/gapY/columns 必填 */
const tilingSchema = z.object({
  enabled: z.boolean(),
  sheetPaperSize: sheetPaperSizeSchema.optional(),
  sheetOrientation: z.enum(['portrait', 'landscape']).optional(),
  sheetCustomWidth: z.number().finite().positive().optional(),
  sheetCustomHeight: z.number().finite().positive().optional(),
  sheetMargin: mmBox,
  gapX: z.number().finite().nonnegative(),
  gapY: z.number().finite().nonnegative(),
  columns: z.number().int().positive(),
}).catchall(z.unknown())

const watermarkSchema = z.object({
  mode: z.enum(['fixed', 'binding']).optional(),
  content: z.string().optional(),
  binding: z.string().optional(),
  testData: z.string().optional(),
  rotate: z.number().finite().optional(),
  color: z.string().optional(),
  opacity: z.number().finite().min(0).max(1).optional(),
  timestamp: z.boolean().optional(),
  format: z.string().optional(),
  tileWidth: z.number().finite().min(140).optional(),
  tileHeight: z.number().finite().min(100).optional(),
}).catchall(z.unknown())

/** 模板级字体声明（core print/fonts.ts:6-24）：family 必填，files[].url 必填 */
const fontFileSchema = z.object({
  url: z.string(),
  weight: z.number().finite().optional(),
  style: z.enum(['normal', 'italic']).optional(),
}).catchall(z.unknown())

const fontDeclarationSchema = z.object({
  family: z.string(),
  label: z.string().optional(),
  files: z.array(fontFileSchema),
}).catchall(z.unknown())

/** 按元素 schema 构造单页模板 schema：校验器据此切换 legacy / strict 的类型闸门 */
export function createTemplateDataSchema(elementSchema: z.ZodTypeAny = printElementDataSchema) {
  const zone = createZoneSchema(elementSchema)
  return z.object({
    paperSize: paperSizeSchema,
    orientation: z.enum(['portrait', 'landscape']),
    outputRotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    margins: mmBox,
    header: zone.optional(),
    footer: zone.optional(),
    elements: z.array(elementSchema),
    name: z.string().optional(),
    fonts: z.array(fontDeclarationSchema).optional(),
    tiling: tilingSchema.optional(),
    unit: z.enum(['pt', 'mm']).optional(),
    customWidth: z.number().finite().positive().optional(),
    customHeight: z.number().finite().positive().optional(),
    pageBackground: z.string().optional(),
    watermark: watermarkSchema.optional(),
    guides: z.array(z.object({
      type: z.enum(['vertical', 'horizontal']),
      position: z.number().finite(),
      id: z.string().optional(),
      color: z.string().optional(),
    }).catchall(z.unknown())).optional(),
    designBackground: z.object({
      src: z.string(),
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    }).catchall(z.unknown()).optional(),
    plugins: pluginsDeclarationSchema,
  }).catchall(z.unknown())
}

export const templateDataSchema = createTemplateDataSchema()

/** 多页 wrapper：pages 用同一元素 schema，顶层 plugins 清单可选 */
export function createMultiPageTemplateDataSchema(pageSchema: z.ZodTypeAny = templateDataSchema) {
  return z.object({
    version: z.literal(1).optional(),
    pages: z.array(pageSchema).min(1),
    plugins: pluginsDeclarationSchema,
  }).catchall(z.unknown())
}

export const multiPageTemplateDataSchema = createMultiPageTemplateDataSchema()

// ─── 纸张集合漂移闸门（方向一：本包不得出现 core 不认的纸型；方向二：core 纸型不得漏项） ───
const _paperSchemaValues: readonly PaperSize[] = paperSizeSchema.options
type _PaperMissing = Exclude<PaperSize, (typeof paperSizeSchema.options)[number]>
const _paperFullCoverage: _PaperMissing extends never ? true : never = true
type _SheetPaperMissing = Exclude<PaperSize, (typeof sheetPaperSizeSchema.options)[number] | 'CONTINUOUS'>
const _sheetFullCoverage: _SheetPaperMissing extends never ? true : never = true
void _paperSchemaValues
void _paperFullCoverage
void _sheetFullCoverage
