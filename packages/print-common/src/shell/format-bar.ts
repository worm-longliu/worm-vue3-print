// 格式工具栏区段：DOM 对齐 canvas 的 FormatToolbar.vue
// （.format-toolbar > .ft-group > .ft-btn / .ft-font>.font-select>input.font-select-input+ul.font-select-list
//   （候选项 li.font-select-option.is-active/.is-muted，见 shell/font-select.ts）/ .ft-size /
//  .ft-color-btn>.ft-glyph / .ft-align-panel>.ft-align-row>.ft-cell-btn / .ft-border-panel>.ft-border-grid /
//  .ft-style-row / .ft-border-style-row>.ft-edge-label / .ft-line-width）。
// 逻辑全部走 core/format.ts（从 useFormatToolbar + useFormatPainter 移植），本文件只负责呈现与派发。
import { h } from '../core/h'
import { iconSvg } from '../core/icons'
import type { VerticalAlign } from '@worm-vue3-print/core/designer'
import { colorTrigger, dropdown, field, stepper } from './controls'
import type { ShellCtx } from './controls'
import { renderFontSelect } from './font-select'
import { MIXED } from '../core/format'
import type { FormatToolbar } from '../core/format'

type FormatCtx = ShellCtx & { format: FormatToolbar }

const LINE_STYLES = [
  { key: 'solid', label: '实线', preview: '1.5px solid currentColor' },
  { key: 'dashed', label: '虚线', preview: '1.5px dashed currentColor' },
  { key: 'dotted', label: '点线', preview: '1.5px dotted currentColor' },
  { key: 'double', label: '双线', preview: '3px double currentColor' },
]

const ALIGN_ICON: Record<string, string> = {
  left: 'TextAlignStart', center: 'TextAlignCenter', right: 'TextAlignEnd',
}

/** 边框格子按钮：内联 18×18 示意 SVG，与 canvas 逐格同形 */
function borderCell(test: string, tip: string, shape: string, onClick: () => void, opts: { on?: boolean; disabled?: boolean } = {}) {
  return h('button', {
    type: 'button',
    class: `ft-cell-btn${opts.on ? ' on' : ''}`,
    dataset: { test, tip },
    disabled: !!opts.disabled,
    onClick,
    html: `<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">${shape}</svg>`,
  })
}

const RECT_FAINT = '<rect class="g-faint" x="2.5" y="2.5" width="13" height="13" />'
const RECT_SOLID = '<rect class="g-solid" x="2.5" y="2.5" width="13" height="13" fill="none" />'

export function renderFormatBar(ctx: FormatCtx) {
  const f = ctx.format
  const values = f.values
  const fontDisabled = !f.fontEditable
  const decoDisabled = fontDisabled || f.context === 'cells'
  const borderDisabled = f.context === 'none'
  const isCells = f.context === 'cells'
  // canvas 口径：非刷取态下，无选中 / 单元格上下文 / 多选都禁用（capturable 只保证「恰好一个元素」）
  const painterDisabled = !f.painterActive
    && (f.context === 'none' || f.context === 'cells' || !f.painterCapturable)
  const painterTip = f.painterActive ? '退出格式刷（Esc）'
    : f.context === 'cells' ? '格式刷（表格单元格暂不支持）'
      : f.context === 'none' ? '格式刷（需选中元素）'
        : !f.painterCapturable ? '格式刷（请仅选中一个源元素）'
          : '格式刷：单击刷一次，双击连续刷'
  const fontTipBase = (base: string) => fontDisabled ? `${base}（需选中文本元素）` : base

  const borderPanel = [
    h('div', { class: 'ft-border-panel', dataset: { test: 'border-panel' } }, [
      h('div', { class: 'ft-border-grid' }, [
        borderCell('preset-none', '无边框', `${RECT_FAINT}<line class="g-solid" x1="4" y1="14" x2="14" y2="4" />`, () => f.applyBorderPreset('none')),
        borderCell('preset-all', '所有边框', `${RECT_SOLID}<line class="g-solid" x1="9" y1="3" x2="9" y2="15" /><line class="g-solid" x1="3" y1="9" x2="15" y2="9" />`, () => f.applyBorderPreset('all')),
        borderCell('preset-outer', '外侧边框', RECT_SOLID, () => f.applyBorderPreset('outer')),
        borderCell('preset-inner', isCells ? '内部边框' : '内部边框（仅表格单元格可用）',
          `${RECT_FAINT}<line class="g-solid" x1="9" y1="3" x2="9" y2="15" /><line class="g-solid" x1="3" y1="9" x2="15" y2="9" />`,
          () => f.applyBorderPreset('inner'), { disabled: !isCells }),
        borderCell('edge-top', '上边框', `${RECT_FAINT}<line class="g-solid" x1="2" y1="3" x2="16" y2="3" />`, () => f.applyEdge('top'), { on: f.edgeOn('top') }),
        borderCell('edge-bottom', '下边框', `${RECT_FAINT}<line class="g-solid" x1="2" y1="15" x2="16" y2="15" />`, () => f.applyEdge('bottom'), { on: f.edgeOn('bottom') }),
        borderCell('edge-left', '左边框', `${RECT_FAINT}<line class="g-solid" x1="3" y1="2" x2="3" y2="16" />`, () => f.applyEdge('left'), { on: f.edgeOn('left') }),
        borderCell('edge-right', '右边框', `${RECT_FAINT}<line class="g-solid" x1="15" y1="2" x2="15" y2="16" />`, () => f.applyEdge('right'), { on: f.edgeOn('right') }),
      ]),
      h('div', { class: 'ft-style-row' }, LINE_STYLES.map(s => h('button', {
        type: 'button',
        class: `ft-style-btn${f.borderStyle === s.key ? ' on' : ''}`,
        dataset: { test: `style-${s.key}`, tip: s.label },
        // 线型/粗细/颜色只暂存为「待应用规格」，点击预设或单边才落盘（与 canvas 口径一致）
        onClick: () => { f.borderStyle = s.key as typeof f.borderStyle; ctx.repaint() },
      }, [h('span', { class: 'ft-style-line', style: { borderTop: s.preview } })]))),
      h('div', { class: 'ft-border-style-row' }, [
        h('span', { class: 'ft-edge-label', text: '粗细' }),
        h('div', { class: 'ft-line-width' }, [stepper({
          value: f.borderWidth, min: 0.25, max: 5, step: 0.25,
          onCommit: v => { f.borderWidth = v; ctx.repaint() },
        })]),
      ]),
      h('div', { class: 'ft-border-style-row' }, [
        h('span', { class: 'ft-edge-label', text: '颜色' }),
        colorTrigger(f.borderColor, v => { f.borderColor = v; ctx.repaint() }, '边框颜色'),
      ]),
    ]),
  ]

  const alignPanel = [
    h('div', { class: 'ft-align-panel', dataset: { test: 'align-panel' } }, [
      h('div', { class: 'ft-align-row' }, [
        ['left', '左对齐', 'TextAlignStart'], ['center', '水平居中', 'TextAlignCenter'], ['right', '右对齐', 'TextAlignEnd'],
      ].map(([v, tip, icon]) => h('button', {
        type: 'button',
        class: `ft-cell-btn${values.textAlign === v ? ' on' : ''}`,
        dataset: { test: `align-${v}`, tip },
        disabled: fontDisabled,
        onClick: () => f.applyStyle({ textAlign: v as never }),
        html: iconSvg(icon),
      }))),
      h('div', { class: 'ft-align-row' }, [
        ['top', '顶端对齐', 'ArrowUpToLine'], ['middle', '垂直居中', 'ChevronsUpDown'], ['bottom', '底端对齐', 'ArrowDownToLine'],
      ].map(([v, tip, icon]) => h('button', {
        type: 'button',
        class: `ft-cell-btn${values.verticalAlign === v ? ' on' : ''}`,
        dataset: { test: `valign-${v}`, tip },
        disabled: fontDisabled,
        onClick: () => f.applyStyle({ verticalAlign: v as VerticalAlign }),
        html: iconSvg(icon),
      }))),
    ]),
  ]

  return h('div', { class: 'format-toolbar' }, [
    h('div', { class: 'ft-group' }, [
      h('button', {
        type: 'button',
        class: `ft-btn${f.painterActive ? ' on' : ''}`,
        dataset: { test: 'format-painter', tip: painterTip },
        disabled: painterDisabled,
        // canvas：刷取中再点为退出；双击序列 click→click→dblclick，末次直接锁定捕获
        onClick: () => {
          if (f.painterActive) f.cancelPainter()
          else f.pickPainterSource(false)
          ctx.repaint()
        },
        onDblclick: () => { f.pickPainterSource(true); ctx.repaint() },
        html: iconSvg('Paintbrush'),
      }),
    ]),
    h('div', { class: 'ft-group' }, [
      h('div', { class: 'ft-font' }, [renderFontSelect({
        id: 'ft-font',
        state: ctx.state,
        fonts: ctx.host.fonts,
        // canvas：混选时输入框留空、占位显示「混合」
        value: typeof values.fontFamily === 'string' ? values.fontFamily : undefined,
        placeholder: values.fontFamily === MIXED ? '混合' : '默认',
        disabled: fontDisabled,
        onChange: v => f.applyStyle({ fontFamily: v }),
      })]),
      h('div', { class: 'ft-size', dataset: { test: 'font-size' } }, [
        stepper({
          value: typeof values.fontSize === 'number' ? values.fontSize : undefined,
          min: 5, max: 72,
          disabled: fontDisabled,
          placeholder: values.fontSize === MIXED ? '混合' : '默认',
          onCommit: v => f.applyStyle({ fontSize: v }),
        }),
      ]),
    ]),
    h('div', { class: 'ft-group' }, [
      ...([
        ['bold', 'Bold', '加粗', () => f.toggleBold()],
        ['underline', 'Underline', '下划线', () => f.toggleUnderline()],
        ['strike', 'Strikethrough', '删除线', () => f.toggleStrike()],
      ] as const).map(([test, icon, base, run]) => h('button', {
        type: 'button',
        class: `ft-btn${values[test] === true ? ' on' : ''}`,
        dataset: { test, tip: fontTipBase(base) },
        disabled: test === 'bold' ? fontDisabled : decoDisabled,
        onClick: run,
        html: iconSvg(icon),
      })),
    ]),
    h('div', { class: 'ft-group' }, [
      h('span', {
        class: `ft-color-btn${fontDisabled ? ' dim' : ''}`,
        title: `字体颜色${fontDisabled ? '（需选中或混选文本元素）' : ''}`,
      }, [colorTrigger(typeof values.color === 'string' ? values.color : undefined, v => f.applyStyle({ color: v })), h('span', { class: 'ft-glyph', text: 'A' })]),
      h('span', { class: `ft-color-btn${borderDisabled ? ' dim' : ''}`, title: '背景色' }, [
        colorTrigger(typeof values.backgroundColor === 'string' ? values.backgroundColor : undefined, v => f.applyStyle({ backgroundColor: v })),
        h('span', { class: 'ft-glyph', html: iconSvg('PaintBucket', 14) }),
      ]),
    ]),
    h('div', { class: 'ft-group' }, [
      dropdown(ctx, 'align', {
        icon: ALIGN_ICON[String(values.textAlign)] ?? 'TextAlignStart',
        text: '对齐',
        textClass: 'ft-btn-text',
        tip: fontDisabled ? '对齐（需选中文本元素或单元格）' : '对齐',
        disabled: fontDisabled,
        testId: 'align-dd',
      }, alignPanel),
    ]),
    h('div', { class: 'ft-group' }, [
      dropdown(ctx, 'border', {
        icon: 'Grid3x3',
        text: '边框',
        textClass: 'ft-btn-text',
        tip: borderDisabled ? '边框（需选中元素）' : '边框',
        disabled: borderDisabled,
        testId: 'border',
      }, borderPanel),
    ]),
  ])
}

/** 供状态栏/属性面板复用的排版行（保持与 canvas 同类名） */
export { field as formatField }
