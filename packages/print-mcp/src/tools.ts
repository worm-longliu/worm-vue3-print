import { z } from 'zod'
import {
  ELEMENT_KINDS,
  EXPRESSION_FUNCTIONS,
  SYSTEM_VARIABLES,
  checkExpression,
  draftTemplate,
  elementTypeSchema,
  inspectTemplate,
  listPresetSummaries,
  paperSizeSchema,
  validateTemplateJson,
} from '@worm-vue3-print/contract'
import type { TemplateData } from '@worm-vue3-print/core/designer'
import type { DraftSpec } from '@worm-vue3-print/contract'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asError, asText } from './tool-types.js'

/** zod → JSON Schema；字段级 .describe() 会落进属性 description，是模型唯一的入参说明书 */
function schemaOf<T extends z.ZodTypeAny>(schema: T): Record<string, unknown> {
  return z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

const templateJsonField = z.record(z.string(), z.unknown()).describe(
  '打印模板 JSON：单页 TemplateData（顶层有 paperSize/orientation/margins/elements），'
  + '或多页 wrapper { version: 1, pages: [TemplateData, ...] }，或 { templateJson, printData } 外壳。'
  + '坐标与尺寸单位 mm（fontSize/lineHeight/borderWidth 为 pt），新模板请写 unit: "mm"。',
)

/** 纯计算工具：不落文件、不出网，宿主可放心免审批 */
const PURE_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

export const TOOLS: ToolDef[] = [
  {
    name: 'print_element_kinds',
    description: 'worm-vue3-print 模板能力速查：13 种元素类型（含每种必填 option 键与打印注意事项）、'
      + '布局配方 preset 清单（id / 场景 / 槽位）、表达式函数白名单、系统变量、单位口径、表达式语法。'
      + '生成或修改模板前先调用它，不要凭印象猜字段名；常见单据/标签/小票/面单优先选 preset。',
    annotations: { title: '打印模板能力速查', ...PURE_ANNOTATIONS },
    inputSchema: schemaOf(z.object({})),
    handler: async (): Promise<ToolResult> => asText({
      kinds: ELEMENT_KINDS,
      presets: listPresetSummaries(),
      functions: EXPRESSION_FUNCTIONS,
      systemVariables: SYSTEM_VARIABLES,
      units: '元素 left/top/width/height/barHeight/maxWidth/flowRowHeight 为 mm；'
        + 'fontSize/lineHeight/letterSpacing/shrinkMinFontSize/borderWidth 为 pt；'
        + 'barWidth/barQuietZone/qrQuietZone/flowColumns 是「模块数/列数」，无量纲，不能按长度换算',
      expressionSyntax: '绑定写 {字段} 或 {FUNC(字段)}，嵌套字段用点号 {order.no}；'
        + '不支持 ${...}，也不支持 JavaScript 语句与控制流',
      pageNumberHint: '页码变量是 {pageIndex}/{totalPages}（1 起），到分页最终趟才求值',
    }),
  },
  {
    name: 'print_validate_template',
    description: '校验模板 JSON 是否符合契约，返回可直接定位的 issues（含 elements[0].options.width 这类路径）。'
      + 'level=error 必须修（渲染会出错或被拒）；level=warning 是存量兼容提示（废弃键 title/tableMode/fields、'
      + '契约未知键、缺 unit），不必强行清零。修完后重跑本工具直到 ok=true。',
    annotations: { title: '校验模板契约', ...PURE_ANNOTATIONS },
    inputSchema: schemaOf(z.object({ templateJson: templateJsonField })),
    handler: async (args): Promise<ToolResult> => {
      if (!Object.prototype.hasOwnProperty.call(args, 'templateJson')) return asError('缺少必填参数 templateJson')
      const r = validateTemplateJson(args.templateJson)
      const errorCount = r.issues.filter(i => i.level === 'error').length
      return asText({
        ok: r.ok,
        issues: r.issues,
        deprecatedHits: r.deprecatedHits,
        unknownKeys: r.unknownKeys,
        summary: r.ok
          ? `通过。${r.issues.length} 条 warning 属存量兼容项，可不处理。`
          : `${errorCount} 条 error 必须修：按 issues[].path 定位元素与键，改完重跑本工具。`
            + 'warning 不影响 ok。',
      })
    },
  },
  {
    name: 'print_check_expression',
    description: '校验模板表达式（formatter / styler / dataSource 里的写法）。语法判定走 core 解析器，'
      + '与出纸端同一套规则：未闭合花括号、空表达式、未知函数、原型链探测、${} 写法都会被拒。'
      + '传 knownFields（宿主业务字段字典）后才会额外给出 unknownFields 警告；不传则只判合法性。',
    annotations: { title: '校验模板表达式', ...PURE_ANNOTATIONS },
    inputSchema: schemaOf(z.object({
      expression: z.string().describe(
        '表达式原文，如 "合计：{MONEY(SUM(amount))}"。必须成对花括号；不接受 ${...}。'
        + '聚合函数 SUM/AVG/COUNT/MIN/MAX 只用于表格 subtotal/summary 单元格。',
      ),
      knownFields: z.array(z.string()).optional().describe(
        '宿主业务字段键名清单（如 ["orderNo","amount","details.name"]）。给了才会报未知字段。',
      ),
    })),
    handler: async (args): Promise<ToolResult> => {
      const a = args as { expression: string; knownFields?: string[] }
      const r = checkExpression(a.expression, a.knownFields ?? [])
      return asText({
        ...r,
        allowedFunctions: EXPRESSION_FUNCTIONS,
        systemVariables: SYSTEM_VARIABLES,
      })
    },
  },
  {
    name: 'print_inspect_layout',
    description: '静态版面体检（只看模板里写死的坐标，不做排版测量）：占位落在纸张外 OUT_OF_PAPER（error，出纸被裁）、'
      + '侵入页边距 OUT_OF_CONTENT_AREA（warning）、零尺寸 ZERO_SIZE_ELEMENT、表格无行 TABLE_MISSING_ROWS、'
      + '流式列表无列数 FLOW_MISSING_COLUMNS、列宽与元素宽不符 TABLE_COL_WIDTH_MISMATCH、同区交叠 ELEMENT_OVERLAP、'
      + '页眉页脚带装不下 BAND_TOO_SMALL。表格真实行高、长文本换行占位、真实页数一律不在这里判，'
      + '需要那些数字请在设计器或打印预览中确认。',
    annotations: { title: '版面静态体检', ...PURE_ANNOTATIONS },
    inputSchema: schemaOf(z.object({
      templateJson: templateJsonField,
      toleranceMm: z.number().positive().max(5).optional().describe(
        '几何容差（mm），默认 0.2：贴边与浮点误差不算越界。',
      ),
    })),
    handler: async (args): Promise<ToolResult> => {
      const a = args as { templateJson?: unknown; toleranceMm?: number }
      if (!Object.prototype.hasOwnProperty.call(args, 'templateJson')) return asError('缺少必填参数 templateJson')
      const tpl = a.templateJson as { pages?: unknown[] }
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
    description: '按结构化 spec 生成模板草稿：优先传 preset（布局配方，整份骨架含占位绑定，坐标由配方保证）；'
      + '没有匹配配方时再传 elements 逐元素描述（元素走 core 元素工厂补设计器默认值）。'
      + '返回前当场回灌 validate + inspect + 表达式校验，所以 issues/expressionErrors 就是这份草稿的可用性结论。'
      + '只产出 JSON，不触碰画布状态；html 类型被封禁（防标记注入）。'
      + '手排表格必须给 tableRows 且 tableColWidths 合计等于元素宽；flowList 必须给 flowColumns。',
    annotations: { title: '生成模板草稿', ...PURE_ANNOTATIONS },
    inputSchema: schemaOf(z.object({
      spec: z.object({
        preset: z.enum(listPresetSummaries().map(p => p.id) as [string, ...string[]]).optional().describe(
          '布局配方 id（先调 print_element_kinds 看 presets 清单选场景）。'
          + '传入后生成整份版式骨架（元素坐标/尺寸由配方保证，绑定是占位表达式），'
          + '与 elements 互斥——不要同时传；基于返回的 template 修改绑定后用 print_validate_template 复验。'
          + 'spec.paper 仍可覆盖配方默认纸张。',
        ),
        paper: z.object({
          paperSize: paperSizeSchema.optional().describe(
            '预设纸型或 CUSTOM/CONTINUOUS；缺省 A4。标签 LABEL_*、小票 THERMAL_*、针式 DOT_* 也是预设。',
          ),
          orientation: z.enum(['portrait', 'landscape']).optional().describe('缺省 portrait'),
          margins: z.object({
            top: z.number(), right: z.number(), bottom: z.number(), left: z.number(),
          }).optional().describe('页边距（mm），四边都必填；缺省 10/10/10/10'),
          customWidth: z.number().positive().optional().describe('mm，仅 paperSize=CUSTOM 与连续纸生效'),
          customHeight: z.number().positive().optional().describe('mm，仅 CUSTOM 生效；连续纸时只作设计画布高'),
          pageBackground: z.string().optional().describe('页面背景色，CSS 值，如 "#ffffff"'),
        }).optional(),
        elements: z.array(z.object({
          type: elementTypeSchema.describe('元素类型，必须是 13 种之一；先调 print_element_kinds 看必填键'),
          options: z.record(z.string(), z.unknown()).optional().describe(
            '元素属性。left/top/width/height 为 mm（不给则用 core 工厂默认值）；'
            + 'fontSize/borderWidth 为 pt；barWidth/qrQuietZone 是模块数',
          ),
          formatter: z.string().optional().describe(
            '元素级绑定表达式，形如 {orderNo}；表格/列表的绑定写在 tableRows[].cells[].formatter',
          ),
        })).optional().describe('与 preset 互斥；传了 preset 就不要再传。坐标相对内容区左上角'),
      }).describe('草稿内容：preset（优先）或 paper+elements 手排。元素属性缺省时由 core 元素工厂补默认值。'),
    })),
    handler: async (args): Promise<ToolResult> => {
      const spec = (args as { spec: DraftSpec }).spec
      const r = draftTemplate(spec)
      return asText({
        ...r,
        summary: r.expressionErrors.length
          ? `表达式有 ${r.expressionErrors.length} 处非法，见 expressionErrors。`
          : r.issues.some(i => i.level === 'error')
            ? '草稿存在 error，见 issues（含 validate 与版面体检两路），修完再落画布。'
            : spec.preset
              ? 'preset 骨架已生成（坐标/结构由配方保证）：把占位绑定改成宿主业务字段，'
                + 'print_validate_template 复验后再写回。'
              : '草稿可用；warnings 多为 core 工厂自带的废弃键（title/tableMode/fields）。',
      })
    },
  },

]
