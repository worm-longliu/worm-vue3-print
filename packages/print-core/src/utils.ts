// packages/print-core/src/utils.ts

/**
 * 按点分路径取值；优先扁平 key（含点），其次嵌套路径。取不到返回 undefined。
 */
export function getByPath(obj: any, path: string): any {
  if (obj == null || path == null) return undefined
  // 扁平 key 优先（支持 key 本身含点）
  if (typeof obj === 'object' && path in obj) return obj[path]
  const parts = path.split('.')
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}
