// 左栏素材台 / 页签栏 / 状态栏：DOM 类名对齐 canvas 的
// LeftPanel.vue、FieldTreePanel.vue、LayerPanel.vue、PageTabs.vue、StatusBar.vue。
import { PAPER_PRESETS, getPaperDimensions, groupFields } from '@worm-vue3-print/core/designer'
import type { ElementType, PrintBusinessField, RuntimeElement } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import { iconSvg } from '../core/icons'
import type { ShellCtx } from './controls'

/** 元素库：与 canvas LeftPanel.elementTypes 同序、同图标字符 */
export const ELEMENT_TYPES: { type: ElementType; label: string; icon: string }[] = [
  { type: 'text', label: '文本', icon: 'Ｔ' },
  { type: 'barcode', label: '条形码', icon: '▍▍' },
  { type: 'qrcode', label: '二维码', icon: '▦' },
  { type: 'image', label: '图片', icon: '▧' },
  { type: 'table', label: '表格', icon: '⊞' },
  { type: 'longText', label: '长文', icon: '¶' },
  { type: 'hline', label: '横线', icon: '―' },
  { type: 'vline', label: '竖线', icon: '│' },
  { type: 'rect', label: '矩形', icon: '▭' },
  { type: 'oval', label: '椭圆', icon: '◯' },
  { type: 'html', label: 'HTML', icon: '<>' },
]

const LAYER_ICON: Record<string, string> = {
  text: 'T', longText: '¶', table: '⊞', image: '🖼', barcode: '≡', qrcode: '▣',
  hline: '—', vline: '|', rect: '□', oval: '○', html: '<>',
}

export function renderLeftPanel(ctx: ShellCtx) {
  const st = ctx.state
  if (st.leftCollapsed) {
    return h('div', { class: 'left-panel collapsed' }, [
      h('div', { class: 'left-collapsed' }, [
        collapseBtn('»', '展开素材台', () => { st.leftCollapsed = false; ctx.repaint() }),
        ...([['elements', '元素', '▦'], ['fields', '字段', '⊛'], ['layers', '图层', '≡']] as const).map(([tab, title, glyph]) =>
          h('button', {
            type: 'button', class: `lc-btn${st.leftTab === tab ? ' on' : ''}`, title,
            text: glyph,
            onClick: () => { st.leftTab = tab; st.leftCollapsed = false; ctx.repaint() },
          })),
      ]),
    ])
  }

  // canvas 的三个页签都是 `v-show`（节点常驻、只切 display），这里同构：
  // 只渲染当前页签会让隐藏 DOM 签名与 canvas 不一致，也会让页签切换时的首帧布局测量落空
  const tabPane = (tab: string, children: unknown[]) => h('div', {
    class: 'pd-tab-pane', role: 'tabpanel',
    style: st.leftTab === tab ? '' : { display: 'none' },
  }, children)

  return h('div', { class: 'left-panel' }, [
    h('div', { class: 'left-head' }, [
      h('span', { class: 'left-title', text: '素材台' }),
      collapseBtn('«', '收起素材台', () => { st.leftCollapsed = true; ctx.repaint() }),
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
      tabPane('elements', elementsPane()),
      tabPane('fields', [fieldsPane(ctx)]),
      tabPane('layers', [layersPane(ctx)]),
    ]),
  ])
}

function collapseBtn(text: string, title: string, onClick: () => void) {
  return h('button', { type: 'button', class: 'collapse-btn', title, text, onClick })
}

function elementsPane(): unknown[] {
  return [
    h('div', { class: 'panel-title', text: '拖拽元素到画布' }),
    ...ELEMENT_TYPES.map(item => h('div', {
      class: 'material-card',
      draggable: true,
      dataset: { test: `material-${item.type}` },
      onDragstart: (ev: Event) => (ev as DragEvent).dataTransfer?.setData('elementType', item.type),
    }, [
      h('span', { class: 'material-icon', text: item.icon }),
      h('span', { class: 'material-label', text: item.label }),
    ])),
  ]
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
        h('span', { class: 'group-label', text: group.label }),
      ]) : ''
      const rows = collapsed ? [] : group.fields.map(field => h('div', {
        class: 'field-row',
        draggable: true,
        style: { paddingLeft: `${group.key ? 22 : 8}px` },
        onDragstart: (ev: Event) => {
          (ev as DragEvent).dataTransfer?.setData('fieldKey', field.fieldKey)
        },
      }, [
        h('span', { class: 'node-icon', text: '📄' }),
        h('span', { class: 'node-label', text: field.fieldLabel }),
        h('span', { class: 'node-key', text: `(${field.fieldKey})` }),
      ]))
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
    ...layers.map(layer => h('div', {
      class: `layer-item${s.selectedIds.has(layer.id) ? ' active' : ''}`,
      onClick: (ev: Event) => s.selectElement(layer.id, (ev as MouseEvent).ctrlKey || (ev as MouseEvent).metaKey),
    }, [
      h('span', { class: 'layer-icon', text: LAYER_ICON[layer.printElementType.type] || '?' }),
      h('span', { class: 'layer-name', text: layer.options.title || layer.printElementType.title || layer.printElementType.type }),
      zoneTag(layer) ? h('span', { class: 'layer-zone', text: zoneTag(layer) }) : '',
      h('span', { class: 'layer-zindex', text: `z:${layer.options.zIndex ?? 0}` }),
    ].filter(Boolean))),
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
