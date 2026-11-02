// 桌面安全工具集：stdio 6 工具中剔除 print_render_preview（不访问渲染服务、不落临时文件），
// 并移除 templatePath 入参（桌面端不读本地模板文件；伪造传入时 isError 拒绝，不触达文件系统）。
import { TOOLS } from './tools.js'
import type { ToolDef, ToolResult } from './tool-types.js'
import { asError } from './tool-types.js'

/** 桌面端明令排除的工具（远程渲染 + 文件落盘，不属于桌面安全集） */
export const DESKTOP_BLOCKED_TOOL_NAMES = ['print_render_preview'] as const

const DESKTOP_TOOL_NAMES = [
  'print_element_kinds',
  'print_validate_template',
  'print_check_expression',
  'print_inspect_layout',
  'print_draft_template',
] as const

const TEMPLATE_PATH_CLAUSE = '与 templatePath 二选一，二者都给时以本字段为准。'
const DESKTOP_REJECT =
  '桌面端工具不读取本地模板文件（templatePath 在此不可用）：'
  + '请直接传 templateJson，模板内容来自打开的设计器页面（print_get_open_template）或由你本次生成。'

/** 深拷贝后剔除 templatePath 字段，并清掉字段说明里指向路径的二选一措辞 */
function stripTemplatePath(inputSchema: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(inputSchema)) as {
    properties?: Record<string, unknown>
    required?: unknown[]
  }
  delete clone.properties?.templatePath
  if (Array.isArray(clone.required)) {
    clone.required = clone.required.filter(k => k !== 'templatePath')
  }
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === 'string') {
          ;(node as Record<string, unknown>)[key] = value.replaceAll(TEMPLATE_PATH_CLAUSE, '')
        } else {
          walk(value)
        }
      }
    }
  }
  walk(clone)
  return clone
}

/**
 * 桌面端可复用的 5 个纯计算工具：无网络请求、无文件读取、无落盘，
 * templatePath 即便被 agent 伪造传入也直接拒绝（isError），绝不触达 fs。
 */
export function createDesktopPrintTools(): ToolDef[] {
  return DESKTOP_TOOL_NAMES.map(name => {
    const base = TOOLS.find(t => t.name === name)!
    const desktop: ToolDef = {
      name: base.name,
      description: base.description,
      annotations: base.annotations,
      inputSchema: stripTemplatePath(base.inputSchema),
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        // 运行时封禁：伪造传入 templatePath 一律 isError，绝不触达 fs
        if (args && typeof args === 'object' && 'templatePath' in args) {
          return asError(DESKTOP_REJECT)
        }
        return base.handler(args)
      },
    }
    return desktop
  })
}
