// print-core/src/render/element-border.ts
// 元素级边框（整圈 borderWidth/borderStyle/borderColor + 分边 borders）的纯逻辑判定：
// 设计器画布与出纸共用同一函数，保证所见即所得。
// rect/oval/hline/vline 用 border 画自身本体、table 走单元格边框，均排除在外，否则双重边框。
// 关键：宽度未设 / ≤0 / 非法值 → 无边框（整圈与分边同规则），绝不兜底默认边框（避免存量模板凭空长边框）。
// 口径：pt（与单元格 TableCellBorder、rect/oval 自身 borderWidth 统一）。

import type { ElementBorderSide, ElementOptions } from '../designer/types.js'
import { getElementCapabilities } from '../designer/element-capabilities.js'

export interface ElementBorderCss {
  /** CSS 长度，pt 口径（与 rect/oval、单元格边框一致） */
  borderWidth: string
  borderStyle: string
  borderColor: string
}

/** 元素级边框解析结果：整圈 + 逐边覆盖（渲染时先写整圈、后写各边，CSS 后者覆盖前者） */
export interface ElementBordersCss {
  all: ElementBorderCss | null
  edges: Partial<Record<ElementBorderSide, ElementBorderCss>>
}

export const ELEMENT_BORDER_SIDES: readonly ElementBorderSide[] = ['top', 'right', 'bottom', 'left']

/** 能力位未声明时的历史回落（用 border 画自身本体或走单元格边框的类型） */
const SELF_BORDER_FALLBACK: ReadonlySet<string> = new Set(['rect', 'oval', 'hline', 'vline', 'table'])

/** 该元素类型是否可携带元素级边框（插件可通过 capabilities.acceptsElementBorder 声明或覆盖内置） */
export function acceptsElementBorder(type: string | undefined): boolean {
  if (!type) return false
  const declared = getElementCapabilities(type).acceptsElementBorder
  return declared === undefined ? !SELF_BORDER_FALLBACK.has(type) : declared
}

const VALID_STYLES: ReadonlySet<string> = new Set(['solid', 'dashed', 'dotted', 'double'])

type BorderFields = Pick<ElementOptions, 'borderWidth' | 'borderStyle' | 'borderColor' | 'borders'>

function parseBorder(
  width: number | undefined,
  style: string | undefined,
  color: string | undefined,
): ElementBorderCss | null {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null
  // 线型「无」= 明确不画（与单元格 TableCellBorder.style='none' 同一语义）；非法线型才回落实线
  if (style === 'none') return null
  return {
    borderWidth: `${width}pt`,
    borderStyle: typeof style === 'string' && VALID_STYLES.has(style) ? style : 'solid',
    borderColor: color || '#000',
  }
}

/** 解析元素级边框；返回 null 表示无任何生效边框 */
export function resolveElementBorder(
  type: string | undefined,
  opts: BorderFields | undefined,
): ElementBordersCss | null {
  if (!acceptsElementBorder(type)) return null
  const all = parseBorder(opts?.borderWidth, opts?.borderStyle, opts?.borderColor)
  const edges: Partial<Record<ElementBorderSide, ElementBorderCss>> = {}
  const src = opts?.borders
  if (src) {
    for (const side of ELEMENT_BORDER_SIDES) {
      const edge = src[side]
      if (!edge) continue
      const css = parseBorder(edge.width, edge.style, edge.color)
      if (css) edges[side] = css
    }
  }
  if (!all && Object.keys(edges).length === 0) return null
  return { all, edges }
}
