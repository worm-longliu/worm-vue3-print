// 极简 DOM 构建助手：设计器视图层不用框架，靠它把描述变成节点。

export type AttrValue = string | number | boolean | null | undefined
export interface Child { node: Node }

export interface El {
  tag: string
  props: Record<string, unknown>
  children: unknown[]
}

/** h('div', { class, style, onClick, html, ... }, [...]) */
export function h(tag: string, props: Record<string, unknown> = {}, children: unknown[] = []): El {
  return { tag, props, children }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** 这几个属性是「枚举型布尔」，写成空串会被解析成 false，必须显式 true */
const ENUM_BOOLEAN_ATTRS = new Set(['draggable', 'contenteditable', 'spellcheck'])

function isSvg(tag: string) {
  return tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'rect' || tag === 'line' || tag === 'g'
}

export function render(node: El | string | Node, parent: Element | ShadowRoot): Element | Text {
  if (typeof node === 'string') {
    const t = document.createTextNode(node)
    parent.appendChild(t)
    return t
  }
  if (node instanceof Node) {
    parent.appendChild(node)
    return node as Element
  }
  const { tag, props, children } = node
  const el = isSvg(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)

  for (const [key, raw] of Object.entries(props)) {
    if (raw === null || raw === undefined || raw === false) continue
    if (key === 'class') el.setAttribute('class', String(raw))
    else if (key === 'style') {
      if (typeof raw === 'string') (el as HTMLElement).style.cssText = raw
      else Object.assign((el as HTMLElement).style, raw as Record<string, string>)
    } else if (key === 'html') (el as HTMLElement).innerHTML = String(raw)
    else if (key === 'text') el.textContent = String(raw)
    else if (key.startsWith('on') && typeof raw === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), raw as EventListener)
    } else if (key === 'dataset') {
      for (const [dk, dv] of Object.entries(raw as Record<string, string>)) (el as HTMLElement).dataset[dk] = dv
    } else if (typeof raw === 'boolean') {
      if (raw) el.setAttribute(key, ENUM_BOOLEAN_ATTRS.has(key) ? 'true' : '')
    } else el.setAttribute(key, String(raw))
  }

  for (const child of children) render(child as El | string | Node, el)
  parent.appendChild(el)
  return el
}

/** 清空容器（重渲染前调用） */
export function clear(node: Element | ShadowRoot) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

export function mm(v: number): string {
  return `${Math.round(v * 100) / 100}mm`
}

export const SVG_NS_CONST = SVG_NS
