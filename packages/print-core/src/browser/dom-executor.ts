// 唯一一份 DOM 执行器：浏览器进程内直接调用，服务端/客户端以 IIFE 注入后调用。
import { renderCodeSvg } from './browser-code-renderer.js'
import type { CodeSpec, RawMeasurement } from '../print/types.js'

/** 执行器版本：注入失败时用于日志定位产物不匹配 */
export const EXECUTOR_VERSION = '1'

const DEFAULT_READY_TIMEOUT_MS = 5000

/** 等待文档加载、字体就绪与图片完成；任何失败都不阻断（测量有兜底） */
export async function waitReady(win: Window, timeoutMs = DEFAULT_READY_TIMEOUT_MS): Promise<void> {
  const doc = win.document
  const wait = (task: Promise<unknown>): Promise<unknown> =>
    Promise.race([task, new Promise(resolve => setTimeout(resolve, timeoutMs))])
  const ready = (async () => {
    if (doc.readyState !== 'complete') {
      await wait(new Promise<void>(resolve => win.addEventListener('load', () => resolve(), { once: true })))
    }
    const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts
    if (fonts) {
      // 模板声明的 webfont 必须显式加载：只等 fonts.ready 会在字体尚未进入布局时提前 resolve，
      // 之后按兜底字体度量，分页与出图静默错版。加载失败不阻断，交给兜底栈。
      await wait(Promise.all(declaredFontFaces(doc).map(face =>
        fonts.load(`${face.style} ${face.weight} 16px "${face.family}"`).catch(() => undefined),
      )))
      if (fonts.ready) await wait(fonts.ready)
    }
    await wait(Promise.all(Array.from(doc.images ?? []).map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    )))
  })()
  await wait(ready)
}

/** 读出文档里 @font-face 声明的族名/字重/字型（跨源样式表读不到时忽略） */
function declaredFontFaces(doc: Document): Array<{ family: string; weight: string; style: string }> {
  const out: Array<{ family: string; weight: string; style: string }> = []
  const CSS_FONT_FACE_RULE = 5
  for (const sheet of Array.from(doc.styleSheets ?? [])) {
    let rules: CSSRuleList | undefined
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules ?? [])) {
      if (rule.type !== CSS_FONT_FACE_RULE) continue
      const style = (rule as CSSFontFaceRule).style
      const family = (style.getPropertyValue('font-family') || '').replace(/^["']|["']$/g, '')
      if (!family) continue
      out.push({
        family,
        weight: style.getPropertyValue('font-weight') || '400',
        style: style.getPropertyValue('font-style') || 'normal',
      })
    }
  }
  return out
}

/** 读取 [data-measure-id] 元素高度与表格行高（原始 CSS px） */
export function readMeasurements(doc: Document): RawMeasurement[] {
  const result: RawMeasurement[] = []
  doc.querySelectorAll('[data-measure-id]').forEach(node => {
    const el = node as HTMLElement
    const id = el.getAttribute('data-measure-id')
    if (!id) return
    const table = el.querySelector('table.print-table')
    if (!table) {
      result.push({ id, heightPx: el.offsetHeight })
      return
    }
    const rowHeightsPx: number[] = []
    table.querySelectorAll('tbody > tr[data-row-index]').forEach(row => {
      rowHeightsPx.push((row as HTMLElement).offsetHeight)
    })
    result.push({ id, heightPx: el.offsetHeight, rowHeightsPx })
  })
  return result
}

/** 内容区后代相对 .print-page 顶部的最大底边（CSS px）；绝对定位元素的几何由真实引擎决定 */
export function readContentBottom(doc: Document): number {
  const page = doc.querySelector('.print-page') as HTMLElement | null
  const area = doc.querySelector('.content-area') as HTMLElement | null
  if (!page || !area) return 0
  const pageTop = page.getBoundingClientRect().top
  let maxBottom = 0
  area.querySelectorAll<HTMLElement>('*').forEach(node => {
    const rect = node.getBoundingClientRect()
    if (rect.height > 0) maxBottom = Math.max(maxBottom, rect.bottom - pageTop)
  })
  const areaRect = area.getBoundingClientRect()
  if (areaRect.height > 0) maxBottom = Math.max(maxBottom, areaRect.bottom - pageTop)
  return maxBottom
}

/** 码值 → SVG 映射；单项失败跳过，交由 core 降级文本占位 */
export function renderCodes(specs: CodeSpec[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const spec of specs) {
    try {
      map[spec.key] = renderCodeSvg(spec.value, spec.cellType, spec.opts)
    } catch {
      // 单值失败不影响其它码值
    }
  }
  return map
}

/** 注入后挂在 globalThis.__wormDom 上的执行器对象 */
export const domExecutor = {
  version: EXECUTOR_VERSION,
  waitReady,
  readMeasurements,
  readContentBottom,
  renderCodes,
}
