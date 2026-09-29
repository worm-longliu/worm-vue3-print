// 属性台：DOM 对齐 canvas 的 PropertyPanel.vue + property/*Group.vue
// （.property-panel / .prop-head / .pd-tabs.prop-tabs / .property-content /
//  .property-group>.group-header>.group-icon|.group-title|.expand-icon / .group-content /
//  .property-search>input.pd-input / .font-select>.font-select-input+.font-select-list /
//  .pd-form / .position-grid / .margin-grid / .pd-field>.pd-label / .pd-divider / .pd-empty）。
// 搜索门控（filteredGroups / matchedKeys / searching）见 shell/property-search.ts，口径同 canvas。
import { PAPER_PRESETS, isContinuousPaperSize, resolveElementTextFit } from '@worm-vue3-print/core/designer'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import { colorTrigger, divider, field, radioGroup, stepper } from './controls'
import { designBackgroundSection, tilingSection } from './page-extras'
import { bindingGroup } from './binding'
import { renderFontSelect } from './font-select'
import { gateItem, renderPropertySearch } from './property-search'
import { group } from './prop-group'
import { paginationGroup, tableCellGroup, tableRowGroup, tableSettingsGroup } from './table-props'
import { watermarkSection } from './watermark'
import type { ShellCtx } from './controls'

/** 数字属性行：label + 步进框（undefined 透传给 stepper → 留空显示占位，与 canvas 的 v-model 未设置态一致） */
function numField(_ctx: ShellCtx, label: string, value: number | undefined, onCommit: (v: number) => void,
  opts: { min?: number; max?: number; step?: number } = {}) {
  return field(label, stepper({ value, ...opts, onCommit }))
}

/** 下拉属性行 */
/** 下拉属性行（导出仅供单测断言未设置态，包公开入口不导出） */
export function selectField(_ctx: ShellCtx, label: string, value: string, options: { value: string; label: string }[], onCommit: (v: string) => void) {
  // canvas 的字体粗细用 v-model：值匹配不到选项时 selectedIndex 变 -1，下拉框显示空白。
  // 这里必须建真节点才能复现该语义（h() 只是描述，选中态要按赋值顺序生效）。
  const select = document.createElement('select')
  select.className = 'pd-select'
  select.addEventListener('change', () => onCommit(select.value))
  for (const o of options) {
    const opt = document.createElement('option')
    opt.value = o.value
    opt.textContent = o.label
    select.appendChild(opt)
  }
  select.value = value
  // 与 Vue 的 v-model 同动作：匹配不到选项时显式置 -1，不依赖各引擎对 `value=` 赋空的处理
  if (!options.some(o => o.value === value)) select.selectedIndex = -1
  return field(label, select)
}

function switchField(_ctx: ShellCtx, label: string, checked: boolean, onCommit: (v: boolean) => void) {
  // 派生样式把 .pd-switch 定义在 input 本体上（appearance:none + ::after 滑块），
  // 用 label 包一层会让开关样式失效，故与 canvas 一致直接给 input 挂类
  return field(label, h('input', {
    type: 'checkbox', class: 'pd-switch', checked,
    onChange: (ev: Event) => onCommit((ev.target as HTMLInputElement).checked),
  }))
}

function elementPane(ctx: ShellCtx, el: RuntimeElement) {
  const s = ctx.store
  const o = el.options
  const type = el.printElementType.type
  const patch = (p: Record<string, unknown>) => s.updateElement(el.id, p as never)
  const isText = type === 'text' || type === 'longText'
  const isCode = type === 'barcode' || type === 'qrcode'
  const isTable = type === 'table'
  /** 单元格选中态：单元格位置与宽高由行高/列宽控制，「位置与尺寸」分组让位（canvas isTableCellSelected） */
  const cellSelected = isTable && s.tableSelection?.elementId === el.id

  const rows: unknown[] = []
  if (!cellSelected) {
    rows.push(group(ctx, 'position-size', '位置与尺寸', 'Location', [
      h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
        h('div', { class: 'position-grid' }, [
          gateItem(ctx, 'ps-left', numField(ctx, 'X', o.left, v => patch({ left: v }), { min: 0 })),
          gateItem(ctx, 'ps-top', numField(ctx, 'Y', o.top, v => patch({ top: v }), { min: 0 })),
          gateItem(ctx, 'ps-width', numField(ctx, 'W', o.width, v => patch({ width: v }), { min: 4 })),
          gateItem(ctx, 'ps-height', numField(ctx, 'H', o.height, v => patch({ height: v }), { min: 4 })),
        ]),
      ]),
    ]))
  }

  // canvas 的 AppearanceGroup 恒渲染：非文本元素出空态提示，表格元素只留空 form（分组标题仍在）
  rows.push(group(ctx, 'appearance', '外观', 'Brush', [
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, isText ? [
      gateItem(ctx, 'ap-font-family', field('字体', renderFontSelect({
        id: 'prop-font',
        state: ctx.state,
        fonts: ctx.host.fonts,
        value: typeof o.fontFamily === 'string' ? o.fontFamily : undefined,
        placeholder: '默认',
        onChange: v => patch({ fontFamily: v }),
      }))),
      gateItem(ctx, 'ap-font-size', numField(ctx, '字体大小', o.fontSize, v => patch({ fontSize: v }), { min: 8, max: 72 })),
      gateItem(ctx, 'ap-font-weight', selectField(ctx, '字体粗细', String(o.fontWeight ?? ''), [
        { value: 'normal', label: '正常' }, { value: 'bold', label: '粗体' },
        { value: 'bolder', label: '更粗' }, { value: 'lighter', label: '细体' },
      ], v => patch({ fontWeight: v }))),
      gateItem(ctx, 'ap-align', field('对齐', radioGroup('ta', [
        { value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' },
      ], o.textAlign || 'left', v => patch({ textAlign: v })))),
      gateItem(ctx, 'ap-vertical-align', field('垂直对齐', radioGroup('va', [
        { value: 'top', label: '顶' }, { value: 'middle', label: '中' }, { value: 'bottom', label: '底' },
      ], o.verticalAlign || 'top', v => patch({ verticalAlign: v })))),
      h('div', { class: 'color-row' }, [
        gateItem(ctx, 'ap-color', field('颜色', colorTrigger(o.color, v => patch({ color: v }), '字体颜色'))),
        gateItem(ctx, 'ap-bg-color', field('背景色', colorTrigger(o.backgroundColor, v => patch({ backgroundColor: v }), '背景颜色'))),
      ]),
      gateItem(ctx, 'ap-line-height', numField(ctx, '行高', o.lineHeight, v => patch({ lineHeight: v || undefined }), { min: 0, max: 100 })),
      gateItem(ctx, 'ap-letter-spacing', numField(ctx, '字间距', o.letterSpacing, v => patch({ letterSpacing: v || undefined }), { min: 0, max: 20, step: 0.5 })),
      gateItem(ctx, 'ap-text-fit', selectField(ctx, '文字溢出', resolveElementTextFit(type, o), [
        { value: 'clip', label: '截断' }, { value: 'shrink', label: '自动缩小' },
        { value: 'autoHeight', label: '自适应行高' },
      ], v => patch({ textFit: v }))),
      o.textFit === 'shrink' ? gateItem(ctx, 'ap-shrink-min', field('最小字号 (pt)', stepper({
        value: o.shrinkMinFontSize, min: 1, max: 72, step: 0.5, placeholder: '默认 6',
        onCommit: v => patch({ shrinkMinFontSize: v || undefined }),
      }))) : '',
      gateItem(ctx, 'ap-word-wrap', switchField(ctx, '自动换行', o.wordWrap !== false, v => patch({ wordWrap: v ? undefined : false }))),
    ] : [
      isTable ? '' : h('p', { class: 'pd-empty', text: '当前元素不支持外观设置' }),
    ].filter(Boolean)),
  ]))

  if (isCode) {
    const isBarcode = type === 'barcode'
    // 码制归一化大写（存量模板可能是小写 code128，不归一化下拉框匹配不到选项）
    const barcodeType = String(o.barcodeType || 'CODE128').toUpperCase()
    const dpi = o.printerDpi ? String(o.printerDpi) : ''
    rows.push(group(ctx, 'code', '条码设置', 'Postcard', [
      h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
        isBarcode ? [
          gateItem(ctx, 'cd-type', selectField(ctx, '码制', barcodeType, [
            { value: 'CODE128', label: 'CODE128（通用）' }, { value: 'EAN13', label: 'EAN13（商品码）' },
            { value: 'EAN8', label: 'EAN8' }, { value: 'UPC', label: 'UPC' },
            { value: 'CODE39', label: 'CODE39' }, { value: 'ITF14', label: 'ITF14' },
          ], v => patch({ barcodeType: v === 'CODE128' ? undefined : v }))),
          gateItem(ctx, 'cd-dpi', selectField(ctx, '打印机分辨率', dpi, [
            { value: '', label: '不指定（按条宽渲染）' }, { value: '203', label: '203 dpi（8 点/mm）' },
            { value: '300', label: '300 dpi（11.8 点/mm）' }, { value: '600', label: '600 dpi（23.6 点/mm）' },
          ], v => patch({ printerDpi: Number(v) > 0 ? Number(v) : undefined }))),
          gateItem(ctx, 'cd-dpi', h('p', {
            class: 'pd-hint',
            text: '填写后条宽吸附到整数打印点（消除出纸「条宽忽宽忽窄」）：条码先按条宽渲染，可用宽度够就原样落纸，不够才整体等比缩小',
          })),
          gateItem(ctx, 'cd-bar-width', numField(ctx, '条宽（倍率）', o.barWidth ?? 2, v => patch({ barWidth: v }), { min: 2, max: 4, step: 0.5 })),
          gateItem(ctx, 'cd-bar-width', h('p', {
            class: 'pd-hint',
            text: dpi
              ? '已设置打印机分辨率：条宽会被吸附到最近的整数打印点（DPI 优先于毫米值），元素框放不下时整体等比缩小'
              : '热敏/针式打印建议 3 及以上：决定条码的落纸尺寸，条越粗出纸后条宽越稳定',
          })),
          gateItem(ctx, 'cd-show-text', switchField(ctx, '显示文本', o.hideTitle !== true, v => patch({ hideTitle: v ? undefined : true }))),
          gateItem(ctx, 'cd-font-size', field('文本字号（相对条高，条高为 30）', stepper({
            value: o.fontSize, min: 5, max: 24, placeholder: '默认 10',
            onCommit: v => patch({ fontSize: v || undefined }),
          }))),
        ] : gateItem(ctx, 'cd-ec-level', selectField(ctx, '纠错级别', String(o.qrCodeLevel ?? 'M'), [
          { value: 'L', label: 'L（最低，容量大）' }, { value: 'M', label: 'M（推荐）' },
          { value: 'Q', label: 'Q' }, { value: 'H', label: 'H（最高）' },
        ], v => patch({ qrCodeLevel: v }))),
        divider('自定义设置'),
        isBarcode ? h('p', {
          class: 'pd-hint',
          text: '条码尺寸由「条宽」与「打印机分辨率」结算：宽度足够时按条宽原样落纸，不足时整体等比缩小；拉伸会把条宽变成非整数，故条形码不提供缩放模式，可用「最大宽高」限制上限',
        }) : '',
        !isBarcode ? gateItem(ctx, 'cd-fit', selectField(ctx, '缩放模式', String(o.fit || 'contain'), [
          { value: 'contain', label: '包含（保持比例）' }, { value: 'cover', label: '覆盖（保持比例）' },
          { value: 'fill', label: '拉伸填满' }, { value: 'none', label: '原始尺寸' },
          { value: 'scale-down', label: '缩小（保持比例）' },
        ], v => patch({ fit: v || undefined }))) : '',
        gateItem(ctx, 'cd-max-width', field('最大宽度 (mm)', stepper({
          value: o.maxWidth, min: 1, max: 200, placeholder: '默认',
          onCommit: v => patch({ maxWidth: v || undefined }),
        }))),
        gateItem(ctx, 'cd-max-height', field('最大高度 (mm)', stepper({
          value: o.maxHeight, min: 1, max: 200, placeholder: '默认',
          onCommit: v => patch({ maxHeight: v || undefined }),
        }))),
      ].flat().filter(Boolean)),
    ]))
  }

  rows.push(bindingGroup(ctx, el))

  if (cellSelected) {
    rows.push(tableRowGroup(ctx, el))
    rows.push(tableCellGroup(ctx, el))
  }
  if (isTable) {
    rows.push(tableSettingsGroup(ctx, el))
  }

  rows.push(group(ctx, 'border-bg', '边框与背景', 'Picture', [
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
      h('div', { class: 'border-row' }, [
        gateItem(ctx, 'bb-border-width', numField(ctx, '边框宽度', o.borderWidth, v => patch({ borderWidth: v }), { min: 0, max: 20, step: 0.25 })),
        gateItem(ctx, 'bb-border-color', field('边框颜色', colorTrigger(o.borderColor, v => patch({ borderColor: v }), '边框颜色'))),
      ]),
      gateItem(ctx, 'bb-bg-color', field('背景色', colorTrigger(o.backgroundColor, v => patch({ backgroundColor: v }), '背景颜色'))),
    ]),
  ]))

  rows.push(paginationGroup(ctx, el))

  rows.push(group(ctx, 'advanced', '高级设置', 'Setting', [
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
      h('div', { class: 'advanced-row' }, [
        gateItem(ctx, 'ad-locked', switchField(ctx, '锁定', !!o.locked, v => patch({ locked: v }))),
        gateItem(ctx, 'ad-fixed', switchField(ctx, '每页重复', !!o.fixed, v => patch({ fixed: v }))),
      ]),
      gateItem(ctx, 'ad-z-index', numField(ctx, '层级', o.zIndex, v => patch({ zIndex: v }), { min: 0, max: 999 })),
      gateItem(ctx, 'ad-delete', h('div', { class: 'pd-field' }, [
        h('button', {
          type: 'button', class: 'pd-button danger', text: '删除元素',
          onClick: () => s.deleteSelected(),
        }),
      ])),
    ]),
  ], false))

  return h('div', { class: 'property-content' }, rows)
}

function pagePane(ctx: ShellCtx) {
  const s = ctx.store
  const t = s.templateData
  const patch = (p: Record<string, unknown>) => s.updateTemplateData(p as never)
  const groups: { group: string; items: { key: string; label: string }[] }[] = []
  for (const [key, preset] of Object.entries(PAPER_PRESETS)) {
    const name = preset.group ?? '其他'
    let bucket = groups.find(g => g.group === name)
    if (!bucket) { bucket = { group: name, items: [] }; groups.push(bucket) }
    bucket.items.push({ key, label: preset.label ?? key })
  }
  const custom = !PAPER_PRESETS[t.paperSize]
  const continuous = isContinuousPaperSize(t.paperSize)

  return h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
    divider('纸张设置'),
    field('纸张尺寸', h('select', {
      class: 'pd-select',
      style: { width: '100%' },
      onChange: (ev: Event) => patch({ paperSize: (ev.target as HTMLSelectElement).value }),
    }, [
      ...groups.map(g => h('optgroup', { label: g.group },
        g.items.map(i => h('option', { value: i.key, text: i.label, selected: t.paperSize === i.key })))),
      h('option', { value: 'CUSTOM', text: '自定义宽高', selected: custom }),
    ])),
    (continuous || custom) ? field(continuous ? '纸宽 (mm)' : '自定义宽高 (mm)', h('div', { class: 'custom-size-grid' }, [
      stepper({ value: Number(t.customWidth ?? 0), min: 25, max: 2000, onCommit: v => patch({ customWidth: v }) }),
      ...(custom ? [h('span', { class: 'custom-size-x', text: '×' }),
        stepper({ value: Number(t.customHeight ?? 0), min: 25, max: 2000, onCommit: v => patch({ customHeight: v }) })] : []),
    ])) : '',
    !continuous ? field('纸张方向', radioGroup('ori', [
      { value: 'portrait', label: '纵向' }, { value: 'landscape', label: '横向' },
    ], t.orientation === 'landscape' ? 'landscape' : 'portrait', v => patch({ orientation: v })),
      '切换即交换纸张长宽（设计稿内容随之铺在该尺寸上）') : '',
    // canvas：连续纸或已启用拼版时隐藏内容旋转（拼版有自己的铺排几何）
    !continuous && !t.tiling?.enabled ? field('内容旋转角度', radioGroup('rot', [
      { value: '0', label: '0°' }, { value: '90', label: '90°' },
      { value: '180', label: '180°' }, { value: '270', label: '270°' },
    ], String(t.outputRotation ?? 0), v => patch({ outputRotation: Number(v) }), true),
      '整页内容旋转对应角度出纸；90°/270° 时纸张长宽互换以贴合内容，内容不变形不裁切；0° 为不旋转（默认）') : '',
    field('页面背景色', h('div', { class: 'page-bg-row' }, [
      colorTrigger(t.pageBackground, v => patch({ pageBackground: v }), '页面背景色', 'page-bg-picker'),
      h('button', {
        type: 'button', class: 'pd-reset', title: '恢复为默认白色', text: '默认',
        onClick: () => patch({ pageBackground: undefined }),
      }),
    ])),
    designBackgroundSection(ctx),
    s.pages.length > 1 ? '' : tilingSection(ctx),
    divider('页边距 (mm)'),
    h('div', { class: 'margin-grid' }, [
      numField(ctx, '上', t.margins.top, v => patch({ margins: { ...t.margins, top: v } }), { min: 0, max: 50 }),
      numField(ctx, '下', t.margins.bottom, v => patch({ margins: { ...t.margins, bottom: v } }), { min: 0, max: 100 }),
      numField(ctx, '左', t.margins.left, v => patch({ margins: { ...t.margins, left: v } }), { min: 0, max: 50 }),
      numField(ctx, '右', t.margins.right, v => patch({ margins: { ...t.margins, right: v } }), { min: 0, max: 50 }),
    ]),
    divider('三区高度 (mm)'),
    numField(ctx, '页眉高度', t.header.height ?? 10, v => patch({ header: { ...t.header, height: v } }), { min: 0, max: 100, step: 0.1 }),
    numField(ctx, '页脚高度', t.footer.height ?? 10, v => patch({ footer: { ...t.footer, height: v } }), { min: 0, max: 100, step: 0.1 }),
    numField(ctx, '首页叠加高度', t.firstPageOverlay.height ?? 0, v => patch({ firstPageOverlay: { ...t.firstPageOverlay, height: v } }), { min: 0, max: 200 }),
    watermarkSection(ctx),
  ].filter(Boolean))
}

export function renderPropertyPanel(ctx: ShellCtx) {
  const s = ctx.store
  const st = ctx.state
  const el = s.selectedElement
  if (st.propCollapsed) {
    return h('div', { class: 'property-panel collapsed' }, [
      h('div', { class: 'prop-collapsed' }, [
        h('button', {
          type: 'button', class: 'pc-btn', title: '展开属性台', text: '«',
          onClick: () => { st.propCollapsed = false; ctx.repaint() },
        }),
        ...([['element', '元素属性', '▦'], ['page', '页面属性', '▤']] as const).map(([tab, title, glyph]) =>
          h('button', {
            type: 'button', class: `pc-btn${st.propTab === tab ? ' on' : ''}`, title, text: glyph,
            onClick: () => { st.propTab = tab; st.propCollapsed = false; ctx.repaint() },
          })),
      ]),
    ])
  }
  const tab = el ? st.propTab : 'page'
  return h('div', { class: 'property-panel' }, [
    h('div', { class: 'prop-head' }, [
      h('span', { class: 'prop-title', text: '属性台' }),
      h('button', {
        type: 'button', class: 'collapse-btn', title: '收起属性台', text: '»',
        onClick: () => { st.propCollapsed = true; ctx.repaint() },
      }),
    ]),
    h('div', { class: 'pd-tabs prop-tabs' }, [
      h('div', { class: 'pd-tab-bar', role: 'tablist' }, [
        h('button', {
          type: 'button', class: `pd-tab${tab === 'element' ? ' active' : ''}`,
          text: '元素属性', onClick: () => { st.propTab = 'element'; ctx.repaint() },
        }),
        h('button', {
          type: 'button', class: `pd-tab${tab === 'page' ? ' active' : ''}`,
          text: '页面属性', onClick: () => { st.propTab = 'page'; ctx.repaint() },
        }),
      ]),
      // 两个页签同 canvas 的 v-show：节点常驻，切换只切 display
      h('div', {
        class: 'pd-tab-pane', role: 'tabpanel',
        style: tab === 'element' ? '' : { display: 'none' },
      }, el
        // canvas：元素页签内先渲染 PropertySearch，再是 .property-content 分组们
        ? [renderPropertySearch(ctx), elementPane(ctx, el)]
        : [h('p', { class: 'pd-empty', text: '请在画布中选择一个元素' })]),
      h('div', {
        class: 'pd-tab-pane', role: 'tabpanel',
        style: tab === 'page' ? '' : { display: 'none' },
      }, [pagePane(ctx)]),
    ]),
  ])
}
