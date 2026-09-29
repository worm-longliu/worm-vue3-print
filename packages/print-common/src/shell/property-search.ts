// 属性台搜索：移植 print-canvas 的 PropertySearch.vue + PropertyPanel.vue 的
// filteredGroups / matchedKeys / searching 门控口径（无框架版）。
// 注册表与命中算法直接走 core 导出（@worm-vue3-print/core/designer 的
// PROPERTY_REGISTRY / searchProperties），本文件只做「接线」不重写算法。
//
// canvas 侧口径逐条对应：
// · 分组：`v-if="filteredGroups.includes('xxx')"` → 本包用等价的显隐切换（见下）
// · 分组内字段：`v-show="showItem('xxx')"` → 节点留在 DOM，只切 display
// · searching = `!!searchText.trim()`，未搜索时恒显示
//
// 为什么用 display 而不是直接不建节点：canvas 的 v-show 本身就是保留节点隐藏，
// 且输入过滤词时只做定点 DOM 更新（不整体重绘），中文输入法组合与光标才不会被打断。
import { PROPERTY_REGISTRY, searchProperties } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import type { El } from '../core/h'
import type { ShellCtx } from './controls'

const REGISTRY_GROUPS = new Set(PROPERTY_REGISTRY.map(g => g.group))

/** Common 分组 key → 注册表分组 key（表格设置在 canvas 口径里挂在 content 组下） */
const GROUP_ALIAS: Record<string, string> = { 'table-settings': 'content' }

export interface PropertySearchResult {
  groups: string[]
  keys: Set<string>
  searching: boolean
}

const CACHE = new Map<string, PropertySearchResult>()

/** 命中结果（按关键字缓存：一次重绘要问几十次，避免重复扫描注册表） */
export function propertySearch(text?: string): PropertySearchResult {
  const key = text ?? ''
  let hit = CACHE.get(key)
  if (!hit) {
    const { groups, itemKeys } = searchProperties(key)
    hit = { groups, keys: itemKeys, searching: !!key.trim() }
    CACHE.set(key, hit)
  }
  return hit
}

/** 该分组是否受搜索门控：不在注册表内的分组（行属性/单元格）恒显示 */
export function searchGroupOf(groupKey: string): string {
  const resolved = GROUP_ALIAS[groupKey] ?? groupKey
  return REGISTRY_GROUPS.has(resolved) ? resolved : ''
}

/** 对应 canvas 各分组的 `v-if="filteredGroups.includes(key)"` */
export function showGroup(ctx: ShellCtx, groupKey: string): boolean {
  const res = propertySearch(ctx.state.propSearch)
  if (!res.searching) return true
  const g = searchGroupOf(groupKey)
  return !g || res.groups.includes(g)
}

/** 对应 canvas 分组内的 `v-show="showItem(key)"` */
export function showItem(ctx: ShellCtx, itemKey: string): boolean {
  const res = propertySearch(ctx.state.propSearch)
  return !res.searching || res.keys.has(itemKey)
}

/** 合并 display 而不覆盖既有内联样式 */
function withDisplay(node: El, visible: boolean): El {
  const base = (node.props.style ?? {}) as Record<string, string>
  node.props.style = { ...base, display: visible ? '' : 'none' }
  return node
}

/** 字段门控：挂 data-prop-key（供输入时定点更新）+ 按搜索态决定显隐 */
export function gateItem(ctx: ShellCtx, itemKey: string, node: El): El {
  const ds = (node.props.dataset ?? {}) as Record<string, string>
  node.props.dataset = { ...ds, propKey: itemKey }
  return withDisplay(node, showItem(ctx, itemKey))
}

/** 分组门控标记：挂 data-prop-group 并给出是否显示 */
export function gateGroup(ctx: ShellCtx, groupKey: string, node: El): El {
  const g = searchGroupOf(groupKey)
  if (!g) return node
  const ds = (node.props.dataset ?? {}) as Record<string, string>
  node.props.dataset = { ...ds, propGroup: g }
  return withDisplay(node, showGroup(ctx, groupKey))
}

/**
 * 定点重放：搜索框输入时只切显隐，不整体重绘；外壳 paint() 末尾同样调用它，
 * 保证重绘后的 DOM 与当前过滤词一致。
 */
export function applyPropertySearch(root: ParentNode, text?: string): void {
  const res = propertySearch(text)
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-prop-group]'))) {
    const g = searchGroupOf(el.dataset.propGroup ?? '')
    el.style.display = !res.searching || !g || res.groups.includes(g) ? '' : 'none'
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-prop-key]'))) {
    el.style.display = !res.searching || res.keys.has(el.dataset.propKey ?? '') ? '' : 'none'
  }
}

/** 搜索框：canvas 的 PropertySearch.vue 等价物（类名与结构逐字一致） */
export function renderPropertySearch(ctx: ShellCtx): El {
  return h('div', { class: 'property-search' }, [
    h('input', {
      class: 'pd-input',
      type: 'search',
      placeholder: '搜索属性...',
      'aria-label': '搜索属性',
      value: ctx.state.propSearch ?? '',
      onInput: (ev: Event) => {
        const input = ev.target as HTMLInputElement
        const text = input.value
        ctx.state.propSearch = text
        applyPropertySearch(input.getRootNode() as ParentNode, text)
      },
    }),
  ])
}
