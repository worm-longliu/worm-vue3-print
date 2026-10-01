// 顶部工具栏：DOM 类名逐一对齐 print-canvas 的 DesignerToolbar.vue
// （.designer-toolbar / .tb-group / .tb-mark / .tb-title / .tb-btn.tb-icon / .tb-zoom /
//  .tb-spacer / .tb-menu / .tb-menu-label / .tb-menu-grid / .tb-menu-row / .btn-primary|secondary）。
import { h } from '../core/h'
import { dropdown, tbIconBtn } from './controls'
import type { ShellCtx } from './controls'

export function renderToolbar(ctx: ShellCtx, formatSection: unknown) {
  const s = ctx.store
  const hasSelection = s.selectedIds.size > 0
  const hasMulti = s.selectedIds.size > 1
  const el = s.selectedElement
  const clipboardDisabled = !hasSelection

  // canvas 的标题恒为「编辑模板/新建模板」，不跟随模板名（模板名只在页签与导出里出现）
  const title = ctx.isEdit ? '编辑模板' : '新建模板'

  const arrangePanel = [
    h('div', { class: 'tb-menu', dataset: { test: 'arrange-panel' } }, [
      h('div', { class: 'tb-menu-label', text: '对齐 / 分布' }),
      h('div', { class: 'tb-menu-grid' }, [
        tbIconBtn(ctx, 'AlignStartVertical', 'align', { arg: 'left', tip: '左对齐', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignEndVertical', 'align', { arg: 'right', tip: '右对齐', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignStartHorizontal', 'align', { arg: 'top', tip: '顶对齐', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignEndHorizontal', 'align', { arg: 'bottom', tip: '底对齐', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignCenterVertical', 'align', { arg: 'vertical', tip: '水平居中', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignCenterHorizontal', 'align', { arg: 'horizontal', tip: '垂直居中', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignHorizontalSpaceBetween', 'align', { arg: 'distributeHor', tip: '水平分布', disabled: !hasMulti }),
        tbIconBtn(ctx, 'AlignVerticalSpaceBetween', 'align', { arg: 'distributeVer', tip: '垂直分布', disabled: !hasMulti }),
      ]),
      h('div', { class: 'tb-menu-label', text: '层级' }),
      h('div', { class: 'tb-menu-grid' }, [
        tbIconBtn(ctx, 'ArrowUpToLine', 'move-layer', { arg: 'top', tip: '置顶', disabled: !hasSelection }),
        tbIconBtn(ctx, 'ArrowUp', 'move-layer', { arg: 'up', tip: '上移一层', disabled: !hasSelection }),
        tbIconBtn(ctx, 'ArrowDown', 'move-layer', { arg: 'down', tip: '下移一层', disabled: !hasSelection }),
        tbIconBtn(ctx, 'ArrowDownToLine', 'move-layer', { arg: 'bottom', tip: '置底', disabled: !hasSelection }),
      ]),
      h('div', { class: 'tb-menu-label', text: '组合' }),
      h('div', { class: 'tb-menu-grid' }, [
        tbIconBtn(ctx, 'Group', 'group', { tip: '组合 (Ctrl+G)', disabled: !hasMulti }),
        tbIconBtn(ctx, 'Ungroup', 'ungroup', { tip: '取消组合 (Ctrl+Shift+G)', disabled: !(el as { options?: { groupId?: string } })?.options?.groupId }),
      ]),
    ]),
  ]

  const viewPanel = [
    h('div', { class: 'tb-menu tb-menu-rows', dataset: { test: 'view-panel' } }, [
      menuRow('标尺', s.showRuler, 'toggle-ruler', '显示/隐藏标尺'),
      menuRow('网格', s.showGrid, 'toggle-grid', '显示/隐藏网格背景'),
      menuRow('虚框', s.showTableGhostBorder, 'toggle-table-ghost-border', '显示/隐藏无边框表格的虚拟虚线'),
      menuRow('吸附', s.snapToGrid, 'toggle-snap', '开启/关闭元素吸附到网格'),
    ]),
  ]

  function menuRow(label: string, on: boolean, action: string, tip: string) {
    return h('button', {
      type: 'button',
      class: `tb-btn tb-menu-row${on ? ' on' : ''}`,
      dataset: { tip },
      onClick: () => ctx.fire(action),
    }, [h('span', { class: 'dot' }), label])
  }

  return h('div', { class: 'designer-toolbar' }, [
    h('div', { class: 'tb-group' }, [
      h('span', {
        class: 'tb-mark',
        'aria-hidden': 'true',
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5" /><line x1="8.5" y1="8.5" x2="15.5" y2="8.5" /><line x1="8.5" y1="12.5" x2="15.5" y2="12.5" /><line x1="8.5" y1="16.5" x2="12.5" y2="16.5" /></svg>',
      }),
      h('div', { class: 'tb-title' }, [
        h('span', { class: 'tb-title-name', text: title }),
        h('span', { class: 'tb-title-sub', text: '打印模板设计器' }),
      ]),
    ]),
    h('div', { class: 'tb-group' }, [
      tbIconBtn(ctx, 'Undo2', 'undo', { tip: '撤销', disabled: !s.canUndo }),
      tbIconBtn(ctx, 'Redo2', 'redo', { tip: '重做', disabled: !s.canRedo }),
    ]),
    formatSection,
    h('div', { class: 'tb-group' }, [
      dropdown(ctx, 'arrange', { icon: 'Layers', text: '排列', tip: '排列', testId: 'arrange-dd' }, arrangePanel),
      dropdown(ctx, 'view', { icon: 'Eye', text: '视图', tip: '视图', testId: 'view-dd' }, viewPanel),
    ]),
    h('div', { class: 'tb-group' }, [
      tbIconBtn(ctx, 'Maximize', 'fit-window', { tip: '适应窗口' }),
      tbIconBtn(ctx, 'ZoomOut', 'zoom', { arg: -10, tip: '缩小' }),
      h('span', { class: 'tb-zoom', text: `${s.scale}%` }),
      tbIconBtn(ctx, 'ZoomIn', 'zoom', { arg: 10, tip: '放大' }),
    ]),
    h('div', { class: 'tb-group' }, [
      tbIconBtn(ctx, 'Copy', 'copy', {
        tip: clipboardDisabled ? '复制 (Ctrl+C)，需选中元素' : '复制 (Ctrl+C)',
        disabled: clipboardDisabled, test: 'copy',
      }),
      tbIconBtn(ctx, 'ClipboardPaste', 'paste', {
        tip: clipboardDisabled ? '粘贴 (Ctrl+V)，需选中元素'
          : !s.hasClipboard ? '粘贴 (Ctrl+V)，剪贴板为空' : '粘贴 (Ctrl+V)',
        disabled: clipboardDisabled || !s.hasClipboard, test: 'paste',
      }),
      tbIconBtn(ctx, 'Trash2', 'delete', {
        tip: clipboardDisabled ? '删除 (Delete)，需选中元素' : '删除 (Delete)',
        disabled: clipboardDisabled, danger: true, test: 'delete',
      }),
    ]),
    h('div', { class: 'tb-spacer' }),
    ctx.showHelp ? h('div', { class: 'tb-group' }, [
      h('button', {
        type: 'button', class: 'help-button', title: '帮助文档',
        onClick: () => ctx.fire('help'),
      }, [h('span', { class: 'help-icon', text: '?' })]),
    ]) : '',
    h('div', { class: 'tb-group' }, [
      h('button', {
        type: 'button', class: 'btn-secondary', dataset: { tip: '预览模板打印效果' },
        text: '预览', onClick: () => ctx.fire('preview'),
      }),
      h('button', {
        type: 'button', class: 'btn-primary', dataset: { tip: '保存模板' },
        text: '保存', onClick: () => ctx.fire('save'),
      }),
    ]),
  ].filter(Boolean) as never)
}
