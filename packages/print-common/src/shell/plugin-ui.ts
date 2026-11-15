// plugin-kit 渲染产物 → DOM 挂载与生命周期。
//
// common 是整树重绘模型：每次 paint 都会重建画布与属性台，所以插件 UI 的 dispose
// 只能在「下一次重建前」尽力调用（paint 开头统一清理上一轮登记的回调）。
// 字符串产物按合同用 innerHTML 注入；Node / { node } 直接 append。
import type { ElementUIRenderResult } from '@worm-vue3-print/plugin-kit'

/** 挂点 key → 上一轮渲染登记的资源释放回调（同一个挂点重复渲染先释放旧实例） */
const disposers = new Map<string, () => void>()

function isNode(value: unknown): value is Node {
  return typeof Node !== 'undefined' && value instanceof Node
}

/** 把 renderCanvas / renderProperty 的返回值装进宿主容器 */
export function mountElementUIResult(key: string, result: ElementUIRenderResult, host: HTMLElement): void {
  disposeElementUI(key)
  if (typeof result === 'string') {
    host.innerHTML = result
    return
  }
  if (isNode(result)) {
    host.appendChild(result)
    return
  }
  if (typeof result.node === 'string') host.innerHTML = result.node
  else host.appendChild(result.node)
  if (typeof result.dispose === 'function') disposers.set(key, result.dispose)
}

/** 释放单个挂点的插件实例（重绘同一挂点前调用） */
export function disposeElementUI(key: string): void {
  const dispose = disposers.get(key)
  if (!dispose) return
  disposers.delete(key)
  try {
    dispose()
  } catch {
    // 插件自身的清理失败不应阻断设计器重绘
  }
}

/** 释放全部挂点：整树重建前调用 */
export function disposeAllElementUI(): void {
  for (const key of [...disposers.keys()]) disposeElementUI(key)
}
