// 左栏素材台 / 页签栏 / 状态栏：DOM 类名对齐 canvas 的
// LeftPanel.vue、FieldTreePanel.vue、LayerPanel.vue、PageTabs.vue、StatusBar.vue。
import { PAPER_PRESETS, copyTextToClipboard, getPaperDimensions, groupFields, isWideMaterialLabel } from '@worm-vue3-print/core/designer'
import type { ElementType, PrintBusinessField, RuntimeElement } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import { iconSvg } from '../core/icons'
import {
  BUILTIN_ELEMENT_DEFINITIONS, getElementLayerIcon, getMaterialElementDefinitions,
} from '../core/element-definitions'
import type { ShellCtx } from './controls'

/**
 * 元素库：由统一注册表派生的「内置基线快照」，与 canvas LeftPanel.elementTypes 同序同图标。
 * 运行时素材台请用 `getMaterialElementDefinitions()`（含插件动态项与自定义覆盖）。
 */
export const ELEMENT_TYPES: { type: ElementType; label: string; icon: string }[] =
  BUILTIN_ELEMENT_DEFINITIONS.filter(def => def.material)
    .map(def => ({ type: def.type as ElementType, label: def.label, icon: def.icon }))

/** 图标名 → 内联 SVG；canvas/common 两侧对未知名统一回落 Shapes */
function iconMarkup(name: string | undefined, size: number): string {
  return iconSvg(name ?? 'Shapes', size) || iconSvg('Shapes', size)
}

export function renderLeftPanel(ctx: ShellCtx) {
  const st = ctx.state
  if (st.leftCollapsed) {
    return h('div', { class: 'left-panel collapsed' }, [
      h('div', { class: 'left-collapsed' }, [
        collapseBtn('ChevronsRight', '展开素材台', () => { st.leftCollapsed = false; ctx.repaint() }),
        ...([['elements', '元素', 'Table2'], ['fields', '字段', 'ListTree'], ['layers', '图层', 'Layers']] as const).map(([tab, title, icon]) =>
          h('button', {
            type: 'button', class: `lc-btn${st.leftTab === tab ? ' on' : ''}`, title,
            html: iconMarkup(icon, 14),
            onClick: () => { st.leftTab = tab; st.leftCollapsed = false; ctx.repaint() },
          })),
      ]),
    ])
  }

  // canvas 的三个页签都是 `v-show`（节点常驻、只切 display），这里同构：
  // 只渲染当前页签会让隐藏 DOM 签名与 canvas 不一致，也会让页签切换时的首帧布局测量落空
  const tabPane = (tab: string, children: unknown[], extraClass = '') => h('div', {
    class: `pd-tab-pane${extraClass ? ` ${extraClass}` : ''}`, role: 'tabpanel',
    style: st.leftTab === tab ? '' : { display: 'none' },
  }, children)

  return h('div', { class: 'left-panel' }, [
    h('div', { class: 'left-head' }, [
      h('span', { class: 'left-title', text: '素材台' }),
      collapseBtn('ChevronsLeft', '收起素材台', () => { st.leftCollapsed = true; ctx.repaint() }),
    ]),
    h('div', { class: 'pd-tabs left-tabs' }, [
      h('div', { class: 'pd-tab-bar', role: 'tablist' }, [
        ...([['elements', '元素'], ['fields', '字段'], ['layers', '图层']] as const).map(([tab, label]) =>
          h('button', {
            type: 'button', class: `pd-tab${st.leftTab === tab ? ' active' : ''}`,
            text: label,
            onClick: () => { st.leftTab = tab; ctx.repaint() },
          })),
      ]),
      tabPane('elements', elementsPane(), 'material-grid'),
      tabPane('fields', [fieldsPane(ctx)]),
      tabPane('layers', [layersPane(ctx)]),
    ]),
  ])
}

function collapseBtn(icon: string, title: string, onClick: () => void) {
  return h('button', { type: 'button', class: 'collapse-btn', title, html: iconMarkup(icon, 14), onClick })
}

function materialCard(type: string, label: string, icon: string) {
  return h('div', {
    // 与 canvas LeftPanel 同构：标签文本较长的素材在两列栅格下独占整行
    class: `material-card${isWideMaterialLabel(label) ? ' material-card--wide' : ''}`,
    draggable: true,
    dataset: { test: `material-${type}` },
    onDragstart: (ev: Event) => {
      const dt = (ev as DragEvent).dataTransfer
      dt?.setData('elementType', type)
      // 宽效果集，理由同 canvas LeftPanel：收窄会让 macOS 的 ⌘ 重算落到允许集外被会话拒绝
      if (dt) dt.effectAllowed = 'all'
    },
  }, [
    h('span', { class: 'material-icon', 'data-icon': icon, html: iconMarkup(icon, 14) }),
    h('span', { class: 'material-label', text: label }),
  ])
}

/** 素材台：统一注册表（内置 + 自定义覆盖 + 插件项）按注册顺序出卡，group 出分组标题 */
function elementsPane(): unknown[] {
  const cards: unknown[] = []
  let prevGroup: string | undefined
  for (const item of getMaterialElementDefinitions()) {
    const group = (item as { group?: string }).group
    // 与 canvas LeftPanel 的 groupStart 同判据：首个同组项前渲染分组标题
    if (group && group !== prevGroup) cards.push(h('div', { class: 'material-group-title', text: group }))
    if (group) prevGroup = group
    cards.push(materialCard(item.type, item.label, item.icon))
  }
  return [h('div', { class: 'panel-title', text: '拖拽元素到画布' }), ...cards]
}

function fieldsPane(ctx: ShellCtx) {
  const st = ctx.state
  const groups = groupFields(ctx.store.fields as PrintBusinessField[])
  const keyword = (st.fieldSearch ?? '').trim().toLowerCase()
  const matched = keyword
    ? groups.map(g => ({ ...g, fields: g.fields.filter(f =>
      `${f.fieldLabel}${f.fieldKey}`.toLowerCase().includes(keyword)) }))
      .filter(g => g.fields.length)
    : groups
  return h('div', { class: 'field-tree-panel' }, [
    h('div', { class: 'panel-title', text: '业务字段' }),
    h('input', {
      class: 'pd-input search-input', type: 'search', placeholder: '搜索字段...',
      'aria-label': '搜索字段', value: st.fieldSearch ?? '',
      onInput: (ev: Event) => { st.fieldSearch = (ev.target as HTMLInputElement).value },
      onChange: () => ctx.repaint(),
    }),
    h('div', { class: 'tree-container' }, matched.flatMap(group => {
      const collapsed = st.collapsedGroups.has(group.key) && !keyword
      const header = group.key ? h('div', {
        class: `field-group-header${group.isList ? ' is-list' : ''}`,
        onClick: () => {
          collapsed ? st.collapsedGroups.delete(group.key) : st.collapsedGroups.add(group.key)
          ctx.repaint()
        },
      }, [
        h('span', { class: 'expand-icon', text: collapsed ? '▶' : '▼' }),
        h('span', { class: 'node-icon', text: group.isList ? '📋' : '📁' }),
        h('span', { class: 'group-label', text: group.label, 'data-tip': group.label }),
      ]) : ''
      const rows = collapsed ? [] : group.fields.map(field => h('div', {
        class: 'field-row',
        draggable: true,
        'data-tip': `${field.fieldLabel} (${field.fieldKey}) · 单击复制字段名 · 拖动中按住 Ctrl（Mac 为 ⌘）切换为插入字段名`,
        style: { paddingLeft: `${group.key ? 22 : 8}px` },
        onDragstart: (ev: Event) => {
          const dt = (ev as DragEvent).dataTransfer
          dt?.setData('fieldKey', field.fieldKey)
          // 与 canvas FieldTreePanel 同口径：宽效果集，macOS 的 ⌘ 重算不能被会话拒绝
          if (dt) dt.effectAllowed = 'all'
        },
        // 单击复制字段中文名（对齐 canvas FieldTreePanel 的 onCopyField，Gitee #IKRIZM）
        onClick: () => {
          copyTextToClipboard(field.fieldLabel || field.fieldKey).then((ok) => {
            if (!ok) return
            st.copiedFieldKey = field.fieldKey
            ctx.repaint()
            setTimeout(() => {
              if (st.copiedFieldKey !== field.fieldKey) return
              st.copiedFieldKey = ''
              ctx.repaint()
            }, 1200)
          })
        },
      }, [
        h('span', { class: 'node-icon', text: '📄' }),
        h('span', { class: 'node-meta' }, [
          h('span', { class: 'node-label', text: field.fieldLabel }),
          h('span', { class: 'node-key', text: `(${field.fieldKey})` }),
        ]),
        st.copiedFieldKey === field.fieldKey ? h('span', { class: 'copy-hint', text: '已复制' }) : '',
      ].filter(Boolean)))
      return [header, h('div', {}, rows.filter(Boolean))].filter(Boolean)
    })),
    matched.length === 0 ? h('p', { class: 'pd-empty', text: '暂无字段' }) : '',
  ].filter(Boolean))
}

function layersPane(ctx: ShellCtx) {
  const s = ctx.store
  const layers = [...(s.elements as RuntimeElement[])].sort((a, b) => (b.options.zIndex ?? 0) - (a.options.zIndex ?? 0))
  const selected = s.elements.filter(e => s.selectedIds.has(e.id))
  const canGroup = selected.length >= 2
  const canUngroup = selected.some(e => !!(e.options as { groupId?: string }).groupId)
  const zoneTag = (el: RuntimeElement) => el.zone === 'header' ? '页眉' : el.zone === 'footer' ? '页脚' : ''
  return h('div', { class: 'layer-panel' }, [
    h('div', { class: 'panel-title', text: '图层' }),
    ...layers.map(layer => {
      // 统一注册表：内置 / 自定义覆盖 / core 插件项共用同一条解析路径，未注册回落 Shapes
      const icon = getElementLayerIcon(layer.printElementType.type)
      return h('div', {
        class: `layer-item${s.selectedIds.has(layer.id) ? ' active' : ''}`,
        onClick: (ev: Event) => s.selectElement(layer.id, (ev as MouseEvent).ctrlKey || (ev as MouseEvent).metaKey),
      }, [
        h('span', { class: 'layer-icon', 'data-icon': icon ?? 'Shapes', html: iconMarkup(icon, 12) }),
        h('span', { class: 'layer-name', text: layer.options.title || layer.printElementType.title || layer.printElementType.type }),
        zoneTag(layer) ? h('span', { class: 'layer-zone', text: zoneTag(layer) }) : '',
        h('span', { class: 'layer-zindex', text: `z:${layer.options.zIndex ?? 0}` }),
      ].filter(Boolean))
    }),
    layers.length ? h('div', { class: 'layer-actions' }, [
      ...([['top', '置顶', 'ArrowUpToLine'], ['up', '上移', 'ArrowUp'], ['down', '下移', 'ArrowDown'], ['bottom', '置底', 'ArrowDownToLine']] as const).map(([dir, title, icon]) =>
        h('button', {
          type: 'button', class: 'pd-button small', title,
          html: iconSvg(icon, 14),
          onClick: () => ctx.fire('move-layer', dir),
        })),
    ]) : '',
    (canGroup || canUngroup) ? h('div', { class: 'layer-actions' }, [
      canGroup ? h('button', {
        type: 'button', class: 'pd-button small', title: '组合 (Ctrl+G)',
        html: iconSvg('Group', 14), onClick: () => ctx.fire('group'),
      }) : '',
      canUngroup ? h('button', {
        type: 'button', class: 'pd-button small', title: '取消组合 (Ctrl+Shift+G)',
        html: iconSvg('Ungroup', 14), onClick: () => ctx.fire('ungroup'),
      }) : '',
    ].filter(Boolean)) : '',
  ].filter(Boolean))
}

export function renderPageTabs(ctx: ShellCtx) {
  const s = ctx.store
  const st = ctx.state
  const multi = s.pages.length > 1
  const activeName = s.pages[s.activePageIndex]?.name || `页面 ${s.activePageIndex + 1}`
  const tiling = s.tilingEnabled
  return h('div', { class: 'page-tabs' }, [
    h('div', { class: 'page-tabs-list' }, s.pages.map((p, i) => {
      if (st.renamingPage === i) {
        return h('input', {
          class: 'page-tab-rename',
          dataset: { test: 'page-rename-input' },
          value: st.renameText ?? '',
          onInput: (ev: Event) => { st.renameText = (ev.target as HTMLInputElement).value },
          onBlur: () => commitRename(),
          onKeydown: (ev: Event) => {
            const k = ev as KeyboardEvent
            if (k.key === 'Enter') { commitRename(); return }
            if (k.key === 'Escape') { st.renamingPage = null; ctx.repaint() }
          },
        })
      }
      return h('button', {
        type: 'button',
        class: `page-tab${i === s.activePageIndex ? ' active' : ''}`,
        dataset: { tip: p.name ? `${p.name}（双击重命名）` : '双击重命名' },
        text: p.name || `页面 ${i + 1}`,
        onClick: () => s.switchPage(i),
        onDblclick: () => { st.renamingPage = i; st.renameText = p.name ?? ''; ctx.repaint() },
      })
    })),
    h('div', { class: 'page-tabs-actions' }, [
      h('button', {
        type: 'button', dataset: { test: 'add-page', tip: tiling ? '拼版模板仅允许一个设计页面' : '新增页面（在当前页后追加空白页）' },
        disabled: tiling, text: '＋', onClick: () => ctx.fire('add-page'),
      }),
      h('button', {
        type: 'button', dataset: { test: 'duplicate-page', tip: tiling ? '拼版模板仅允许一个设计页面' : `复制当前页「${activeName}」` },
        disabled: tiling, text: '⧉', onClick: () => ctx.fire('duplicate-page'),
      }),
      h('button', {
        type: 'button', dataset: { test: 'delete-page', tip: multi ? `删除当前页「${activeName}」` : '仅多页面模板可删除页面' },
        disabled: !multi, text: '✕', onClick: () => ctx.fire('delete-page'),
      }),
      h('button', {
        type: 'button', dataset: { test: 'move-left', tip: `前移「${activeName}」` },
        disabled: s.activePageIndex <= 0, text: '←', onClick: () => ctx.fire('move-page', -1),
      }),
      h('button', {
        type: 'button', dataset: { test: 'move-right', tip: `后移「${activeName}」` },
        disabled: s.activePageIndex >= s.pages.length - 1, text: '→', onClick: () => ctx.fire('move-page', 1),
      }),
    ]),
  ])

  function commitRename() {
    const name = (st.renameText ?? '').trim()
    if (st.renamingPage !== null && name) s.renamePage(st.renamingPage, name)
    st.renamingPage = null
    ctx.repaint()
  }
}

export function renderStatusBar(ctx: ShellCtx) {
  const s = ctx.store
  const t = s.templateData
  // 与 canvas 的 paperLabel 同口径：预设名（含尺寸）+ 方向 + 实际长宽 + 出纸旋转提示
  const dim = getPaperDimensions(t)
  const orient = t.orientation === 'landscape' ? '横向' : '纵向'
  const name = PAPER_PRESETS[t.paperSize]?.label ?? t.paperSize
  const rot = t.outputRotation
  const paper = `${name} ${orient} ${Math.round(dim.width)}×${Math.round(dim.height)}mm${rot ? `（旋转${rot}°）` : ''}`
  return h('div', { class: 'status-bar' }, [
    // canvas 的坐标位是 v-if，无坐标时不占位：这里用 display 同步隐藏
    h('span', { class: 'status-item coord', dataset: { coord: '' }, style: { display: 'none' } }),
    h('span', { class: 'status-item', text: `缩放 ${s.scale}%` }),
    h('span', {
      class: 'status-item',
      text: `元素 ${s.elements.length}${s.selectedIds.size ? ` (选中 ${s.selectedIds.size})` : ''}`,
    }),
    h('span', { class: `status-dirty${s.dirty ? ' on' : ''}` }, [
      h('span', { class: 'dirty-dot' }),
      s.dirty ? '未保存' : '已保存',
    ]),
    h('span', { class: 'status-item status-paper', text: paper }),
  ])
}
