// 属性分组外壳：DOM 对齐 canvas 的 property/PropertyGroup.vue
// （.property-group.is-expanded > .group-header > .group-icon/.group-title/.expand-icon + .group-content）。
// 单独成文件是为了让表格类分组（shell/table-props.ts）与元素属性分组共用同一展开态口径，
// 避免 property-panel.ts 与 table-props.ts 互相 import 形成循环依赖。
import { h } from '../core/h'
import type { El } from '../core/h'
import type { ShellCtx } from './controls'
import { gateGroup } from './property-search'

/** canvas 的 PropertyGroup 只映射这三个图标名，其余（Location/Picture/Postcard/Grid/Menu…）落到默认圆点 */
const GROUP_ICON: Record<string, string> = {
  Document: '≡', Brush: '◧', Setting: '⚙',
}

/** 展开态与 canvas 共用 localStorage 键（`property-group-<key>`），同一浏览器里两侧偏好互通 */
function readExpanded(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`property-group-${key}`)
    return raw === null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

function writeExpanded(key: string, value: boolean) {
  try { localStorage.setItem(`property-group-${key}`, String(value)) } catch { /* 隐私模式或存储满，忽略 */ }
}

export function group(
  ctx: ShellCtx, key: string, title: string, icon: string, rows: unknown[], defaultExpanded = true,
): El {
  const expanded = readExpanded(key, defaultExpanded)
  // canvas 的分组显隐由 PropertyPanel 的 `v-if="filteredGroups.includes(key)"` 门控，
  // 这里在同一处收口（含搜索门控标记），元素属性与表格分组共用同一口径
  return gateGroup(ctx, key, h('div', { class: `property-group${expanded ? ' is-expanded' : ''}` }, [
    h('div', {
      class: 'group-header',
      onClick: () => {
        writeExpanded(key, !expanded)
        ctx.repaint()
      },
    }, [
      h('span', { class: 'group-icon', text: GROUP_ICON[icon] || '•' }),
      h('span', { class: 'group-title', text: title }),
      h('span', { class: 'expand-icon', text: expanded ? '▾' : '▸' }),
    ]),
    // canvas 的收起态是 v-show：节点常驻只切 display，隐藏分组的字段仍在 DOM 里可被搜索门控
    h('div', {
      class: 'group-content',
      style: expanded ? '' : { display: 'none' },
    }, rows.filter(Boolean)),
  ]))
}

/** 表单壳：canvas 各分组内容恒为 form.pd-form 且屏蔽回车提交 */
export function pdForm(children: unknown[]): El {
  return h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, children.filter(Boolean))
}
