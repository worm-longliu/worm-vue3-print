import { z } from 'zod'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  ELEMENT_KINDS,
  EXPRESSION_FUNCTIONS,
  checkExpression,
  draftTemplate,
  inspectTemplate,
  validateTemplateJson,
} from '@worm-vue3-print/contract'
import type { TemplateData } from '@worm-vue3-print/core/designer'
import type { DraftSpec } from '@worm-vue3-print/contract'
import { readConfig } from './config.js'
import { requestRenderPdf } from './render-client.js'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asText } from './tool-types.js'

/** zod → JSON Schema；MCP 的 inputSchema 要的是 JSON Schema 而非 zod 实例 */
function schemaOf<T extends z.ZodTypeAny>(schema: T): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

const templateArg = z.object({ templateJson: z.unknown() })

export const TOOLS: ToolDef[] = [
  {
    name: 'print_element_kinds',
    description: '列出 worm-vue3-print 支持的 13 种元素类型（含每种必填 option 键与打印注意事项）和表达式函数白名单。生成模板前必须先调用它。',
    inputSchema: schemaOf(z.object({})),
    handler: async (): Promise<ToolResult> => asText({
      kinds: ELEMENT_KINDS,
      functions: EXPRESSION_FUNCTIONS,
      units: '元素坐标/宽高/行高为 mm；fontSize/lineHeight/borderWidth 为 pt；barWidth/qrQuietZone 为「模块」无量纲',
      expressionSyntax: '绑定用 {字段} 或 {FUNC(字段)}，不是 ${...}',
    }),
  },
  {
    name: 'print_validate_template',
    description: '校验一份打印模板 JSON 是否符合契约：返回 error（必须修）与 warning（废弃键/未知键/缺 unit）。纯 Node，不依赖浏览器。',
    inputSchema: schemaOf(templateArg),
    handler: async (args): Promise<ToolResult> => {
      const r = validateTemplateJson((args as { templateJson: unknown }).templateJson)
      return asText({
        ok: r.ok,
        issues: r.issues,
        deprecatedHits: r.deprecatedHits,
        unknownKeys: r.unknownKeys,
      })
    },
  },
  {
    name: 'print_check_expression',
    description: '校验模板表达式：语法走 core 解析器，函数名走白名单，原型链探测走词法闸门。传 knownFields（宿主字段字典）时才会给出未知字段。',
    inputSchema: schemaOf(z.object({
      expression: z.string(),
      knownFields: z.array(z.string()).optional(),
    })),
    handler: async (args): Promise<ToolResult> => {
      const a = args as { expression: string; knownFields?: string[] }
      return asText(checkExpression(a.expression, a.knownFields ?? []))
    },
  },
  {
    name: 'print_inspect_layout',
    description: '静态版面体检：占位落在纸张外（error，出纸被裁）、侵入页边距（warning）、零尺寸、列宽与元素宽不符、表格无行、flowList 无列数、同区元素交叠。**不做排版测量**，真实行高与页数走 print_render_preview。',
    inputSchema: schemaOf(z.object({
      templateJson: z.unknown(),
      toleranceMm: z.number().positive().max(5).optional(),
    })),
    handler: async (args): Promise<ToolResult> => {
      const a = args as { templateJson: { pages?: unknown[] }; toleranceMm?: number }
      const tpl = a.templateJson
      if (Array.isArray(tpl.pages)) {
        // 多页模板逐页体检，路径带页号，避免 agent 只知道「有一页有问题」
        const per = tpl.pages.map((page, i) => ({
          page: i,
          path: `pages[${i}]`,
          ...inspectTemplate(page as TemplateData, { toleranceMm: a.toleranceMm }),
        }))
        const findings = per.flatMap(p =>
          p.findings.map(f => ({ ...f, path: `${p.path}.${f.path}` })),
        )
        return asText({ ok: per.every(p => p.ok), findings })
      }
      return asText(inspectTemplate(tpl as unknown as TemplateData, { toleranceMm: a.toleranceMm }))
    },
  },
  {
    name: 'print_draft_template',
    description: '按结构化 spec 生成模板草稿（元素走 core 元素工厂，自动带设计器默认值），并当场回灌 validate + inspect + 表达式校验。html 类型被封禁。只产出 JSON，不改动画布。',
    inputSchema: schemaOf(z.object({
      spec: z.object({
        paper: z.object({
          paperSize: z.string().optional(),
          orientation: z.enum(['portrait', 'landscape']).optional(),
          margins: z.object({
            top: z.number(), right: z.number(), bottom: z.number(), left: z.number(),
          }).optional(),
          customWidth: z.number().positive().optional(),
          customHeight: z.number().positive().optional(),
          pageBackground: z.string().optional(),
        }).optional(),
        elements: z.array(z.object({
          type: z.string(),
          options: z.record(z.string(), z.unknown()).optional(),
          formatter: z.string().optional(),
        })),
      }),
    })),
    handler: async (args): Promise<ToolResult> => {
      const spec = (args as { spec: DraftSpec }).spec
      return asText(draftTemplate(spec))
    },
  },
  {
    name: 'print_render_preview',
    description: '调用 print-render 渲染服务出真实 PDF（真分页/真实行高），返回本地 PDF 路径。需要环境变量 PRINT_RENDER_BASE_URL（如 http://127.0.0.1:3001）与 RENDER_API_KEY；未配置时直接返回降级说明。本工具不重复实现排版。',
    inputSchema: schemaOf(z.object({
      templateJson: z.unknown(),
      printData: z.union([
        z.record(z.string(), z.unknown()),
        z.array(z.record(z.string(), z.unknown())),
      ]).optional(),
      baseUrl: z.string().optional(),
      fontBaseUrl: z.string().optional(),
      paperHeightMm: z.number().positive().optional(),
    })),
    handler: async (args): Promise<ToolResult> => {
      const a = args as {
        templateJson: unknown
        printData?: unknown
        baseUrl?: string
        fontBaseUrl?: string
        paperHeightMm?: number
      }
      // 先过契约门：把明显不合法的模板送给渲染服务只是浪费一次浏览器渲染
      const precheck = validateTemplateJson(a.templateJson)
      if (!precheck.ok) {
        return asText({ stage: 'validate', ok: false, issues: precheck.issues })
      }
      const cfg = readConfig()
      const pdfPath = join(tmpdir(), `worm-print-preview-${Date.now()}.pdf`)
      const r = await requestRenderPdf(cfg, {
        templateJson: a.templateJson,
        ...(a.printData !== undefined ? { printData: a.printData } : {}),
        ...(a.baseUrl ? { baseUrl: a.baseUrl } : {}),
        ...(a.fontBaseUrl ? { fontBaseUrl: a.fontBaseUrl } : {}),
        ...(a.paperHeightMm ? { paperHeightMm: a.paperHeightMm } : {}),
      }, pdfPath)
      if (!r.ok) {
        return { content: [{ type: 'text' as const, text: r.message }], isError: true }
      }
      return asText({ ok: true, pdfPath, hint: '用 PDF 页数与目视结果核对分页；静态体检不含真实行高' })
    },
  },
]
