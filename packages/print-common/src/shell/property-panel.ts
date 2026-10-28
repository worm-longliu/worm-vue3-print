// 属性台：DOM 对齐 canvas 的 PropertyPanel.vue + property/*Group.vue
// （.property-panel / .prop-head / .pd-tabs.prop-tabs / .property-content /
//  .property-group>.group-header>.group-icon|.group-title|.expand-icon / .group-content /
//  .property-search>input.pd-input / .font-select>.font-select-input+.font-select-list /
//  .pd-form / .position-grid / .margin-grid / .pd-field>.pd-label / .pd-divider / .pd-empty）。
// 搜索门控（filteredGroups / matchedKeys / searching）见 shell/property-search.ts，口径同 canvas。
import {
  PAPER_PRESETS, isContinuousPaperSize, resolveElementTextFit, propertyTip, IMAGE_FIT_OPTIONS,
  resolveDesignImageSrc, barcodeBarWidthRecommendText, normalizeRotationAngle,
  acceptsElementBorder, applyElementBorderPreset, elementBorderEdgeVisible, effectiveElementBorderSpec,
  resolveElementBorderDisplay, setElementBorderEdgeVisible, setElementBorderField, BORDER_LINE_STYLES,
  ELEMENT_BORDER_APPLY_HINT,
  resolveFlowColumns, resolveFlowGapX, resolveFlowMaxSpan, resolveFlowRowHeight, suggestFlowColumns,
  resolveCellGroupMode,
} from '@worm-vue3-print/core/designer'
import { computeMaxColumns } from '@worm-vue3-print/core'
import type { BorderPreset, ElementBorderFieldKey, ElementBorderSide, ElementOptions, RuntimeElement } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import type { El } from '../core/h'
import { colorTrigger, divider, field, fieldHelp, radioGroup, resetButton, stepper } from './controls'
import { createDefaultOptions, propertyDefault } from '@worm-vue3-print/core/designer'
import { isRotationExcludedType, isFreeAngleEditable, CODE_OBLIQUE_NOTE, collectFollowMemberIds } from '@worm-vue3-print/core/designer'
import { designBackgroundSection, tilingSection } from './page-extras'
import { bindingGroup } from './binding'
import { renderFontSelect } from './font-select'
import { gateItem, renderPropertySearch } from './property-search'
import { cropAnchorField } from './crop-anchor'
import { group } from './prop-group'
import { paginationGroup, tableCellGroup, tableRowGroup, tableSettingsGroup } from './table-props'
import { watermarkSection } from './watermark'
import type { ShellCtx } from './controls'

/** 数字属性行：label + 步进框（undefined 透传给 stepper → 留空显示占位，与 canvas 的 v-model 未设置态一致） */
function numField(_ctx: ShellCtx, label: string, value: number | undefined, onCommit: (v: number) => void,
  opts: { min?: number; max?: number; step?: number; placeholder?: string } = {}, reset?: El) {
  return field(label, stepper({ value, ...opts, onCommit }), undefined, reset)
}

/** 下拉属性行 */
/** 下拉属性行（导出仅供单测断言未设置态，包公开入口不导出） */
export function selectField(_ctx: ShellCtx, label: string, value: string, options: { value: string; label: string }[], onCommit: (v: string) => void, tip?: string, reset?: El) {
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
  return tip ? fieldHelp(label, select, tip, reset) : field(label, select, undefined, reset)
}

function switchField(_ctx: ShellCtx, label: string, checked: boolean, onCommit: (v: boolean) => void, reset?: El) {
  // 派生样式把 .pd-switch 定义在 input 本体上（appearance:none + ::after 滑块），
  // 用 label 包一层会让开关样式失效，故与 canvas 一致直接给 input 挂类
  return field(label, h('input', {
    type: 'checkbox', class: 'pd-switch', checked,
    onChange: (ev: Event) => onCommit((ev.target as HTMLInputElement).checked),
  }), undefined, reset)
}

/** 元素边框入口：档位、边位与文案与 canvas 的 BorderBgGroup.vue 逐项一致 */
const ELEMENT_BORDER_PRESETS: { value: BorderPreset; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'outer', label: '外侧' },
  { value: 'inner', label: '内部' }, { value: 'none', label: '无' },
]

const ELEMENT_BORDER_EDGES: { value: ElementBorderSide; label: string }[] = [
  { value: 'top', label: '上' }, { value: 'right', label: '右' },
  { value: 'bottom', label: '下' }, { value: 'left', label: '左' },
]

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
  /** 多选单元格：只做批量设置，不回显单格配置——「内容」绑定组按 r1,c1 单格读写，整组让位给单元格台 */
  const multiCellSelected = cellSelected
    && resolveCellGroupMode(el.options.tableRows ?? [], s.tableSelection!).mode === 'multi'

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

  /** 落点派生自该元素类型的出厂值：未预置的键 ⇒ undefined ⇒ 写回即删键；预置了字面值的键
   *  （text 的 fontSize、longText 的 lineHeight、image 的 fit）⇒ 写回字面值。一条规则覆盖两种
   *  相反的正确行为。reset 一律挂在外层 field/fieldHelp 上，不挂进 radioGroup 等控件构造参数。 */
  const FACTORY = createDefaultOptions(type) as Record<string, any>
  const reset = (key: string, rk: string): El => {
    const d = propertyDefault(rk)
    return resetButton({
      target: o as Record<string, any>, base: FACTORY, propKey: key,
      tipValue: d?.value, tipUnit: d?.unit,
      write: () => patch({ [key]: FACTORY[key] } as never),
    })
  }

  // canvas 的 AppearanceGroup 恒渲染：非文本元素出空态提示，表格元素只留空 form（分组标题仍在）
  /** 元素级旋转行（判据一律取 core 单点，画布所见必须等于出纸）：
   *  排除类型与表格跟随区成员都不出行（契约四）；码类无 ≥385dpi 承诺时自由角度置灰、
   *  只留 90° 步进（契约五，出纸端同门槛会把斜角吸附成直角）；
   *  数值输入复用 stepper（± 按钮由 .pd-rotate-stepper 派生样式藏掉），两侧为 90° 步进按钮；
   *  0 与未设同义（写 undefined 删键），归一口径与画布一致 */
  const rotateCurrent = typeof o.rotate === 'number' && Number.isFinite(o.rotate) && o.rotate !== 0
    ? normalizeRotationAngle(o.rotate)
    : undefined
  const rotateCommit = (v: number | undefined): void =>
    patch({ rotate: v === undefined || v === 0 ? undefined : normalizeRotationAngle(v) })
  const angleEditable = isFreeAngleEditable(type, o)
  const rotateBlocked = isRotationExcludedType(type)
    || collectFollowMemberIds(s.elements).has(el.id)
  const rotateRow = rotateBlocked ? '' : gateItem(ctx, 'ap-rotate', fieldHelp('旋转 (°)',
    h('div', { class: 'pd-rotate-row' }, [
      h('button', {
        type: 'button', class: 'pd-rotate-btn',
        title: '逆时针 90°', 'aria-label': '逆时针旋转 90 度', text: '↺',
        onClick: () => rotateCommit((rotateCurrent ?? 0) - 90),
      }),
      h('div', { class: 'pd-rotate-stepper' }, [stepper({
        value: rotateCurrent, min: 0, max: 359, placeholder: '0', disabled: !angleEditable,
        onCommit: v => rotateCommit(v),
      })]),
      h('button', {
        type: 'button', class: 'pd-rotate-btn',
        title: '顺时针 90°', 'aria-label': '顺时针旋转 90 度', text: '↻',
        onClick: () => rotateCommit((rotateCurrent ?? 0) + 90),
      }),
    ]),
    propertyTip('ap-rotate'), reset('rotate', 'ap-rotate')))
  /** 置灰原因常驻说明（与 canvas 的 .pd-rotate-note 同文案，出自 core 单点常量） */
  const rotateNote = rotateBlocked || angleEditable
    ? ''
    : h('p', { class: 'pd-hint pd-rotate-note', text: CODE_OBLIQUE_NOTE })

  rows.push(group(ctx, 'appearance', '外观', 'Brush', [
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, isText ? [
      gateItem(ctx, 'ap-font-family', field('字体', renderFontSelect({
        id: 'prop-font',
        state: ctx.state,
        fonts: ctx.host.fonts,
        value: typeof o.fontFamily === 'string' ? o.fontFamily : undefined,
        placeholder: '默认',
        onChange: v => patch({ fontFamily: v }),
      }), undefined, reset('fontFamily', 'ap-font-family'))),
      gateItem(ctx, 'ap-font-size', numField(ctx, '字体大小', o.fontSize, v => patch({ fontSize: v }), { min: 8, max: 72 }, reset('fontSize', 'ap-font-size'))),
      gateItem(ctx, 'ap-font-weight', selectField(ctx, '字体粗细', String(o.fontWeight ?? ''), [
        { value: 'normal', label: '正常' }, { value: 'bold', label: '粗体' },
        { value: 'bolder', label: '更粗' }, { value: 'lighter', label: '细体' },
      ], v => patch({ fontWeight: v }), undefined, reset('fontWeight', 'ap-font-weight'))),
      gateItem(ctx, 'ap-align', field('对齐', radioGroup('ta', [
        { value: 'left', label: '左' }, { value: 'center', label: '中' }, { value: 'right', label: '右' }, { value: 'justify', label: '两端' },
      ], o.textAlign || 'left', v => patch({ textAlign: v })), undefined, reset('textAlign', 'ap-align'))),
      gateItem(ctx, 'ap-vertical-align', field('垂直对齐', radioGroup('va', [
        { value: 'top', label: '顶' }, { value: 'middle', label: '中' }, { value: 'bottom', label: '底' },
      ], o.verticalAlign || 'top', v => patch({ verticalAlign: v })), undefined, reset('verticalAlign', 'ap-vertical-align'))),
      h('div', { class: 'color-row' }, [
        gateItem(ctx, 'ap-color', field('颜色', colorTrigger(o.color, v => patch({ color: v }), '字体颜色'), undefined, reset('color', 'ap-color'))),
        gateItem(ctx, 'ap-bg-color', field('背景色', colorTrigger(o.backgroundColor, v => patch({ backgroundColor: v }), '背景颜色'), undefined, reset('backgroundColor', 'ap-bg-color'))),
      ]),
      gateItem(ctx, 'ap-line-height', numField(ctx, '行高', o.lineHeight, v => patch({ lineHeight: v || undefined }), { min: 0, max: 100 }, reset('lineHeight', 'ap-line-height'))),
      gateItem(ctx, 'ap-letter-spacing', numField(ctx, '字间距', o.letterSpacing, v => patch({ letterSpacing: v || undefined }), { min: 0, max: 20, step: 0.5 }, reset('letterSpacing', 'ap-letter-spacing'))),
      gateItem(ctx, 'ap-text-fit', selectField(ctx, '文字溢出', resolveElementTextFit(type, o), [
        { value: 'clip', label: '截断' }, { value: 'shrink', label: '自动缩小' },
        { value: 'autoHeight', label: '自适应行高' },
      ], v => patch({ textFit: v }), undefined, reset('textFit', 'ap-text-fit'))),
      o.textFit === 'shrink' ? gateItem(ctx, 'ap-shrink-min', field('最小字号 (pt)', stepper({
        value: o.shrinkMinFontSize, min: 1, max: 72, step: 0.5, placeholder: '默认 6',
        onCommit: v => patch({ shrinkMinFontSize: v || undefined }),
      }), undefined, reset('shrinkMinFontSize', 'ap-shrink-min'))) : '',
      type === 'longText' ? gateItem(ctx, 'ap-long-text-indent', fieldHelp('首行缩进 (字符)', stepper({ value: o.longTextIndent, min: 0, max: 10, placeholder: '默认 0', onCommit: v => patch({ longTextIndent: v || undefined }) }), propertyTip('ap-long-text-indent'), reset('longTextIndent', 'ap-long-text-indent'))) : '',
      gateItem(ctx, 'ap-word-wrap', switchField(ctx, '自动换行', o.wordWrap !== false, v => patch({ wordWrap: v ? undefined : false }), reset('wordWrap', 'ap-word-wrap'))),
      gateItem(ctx, 'ap-keep-line-breaks', switchField(ctx, '保留换行符', o.keepLineBreaks === true, v => patch({ keepLineBreaks: v ? true : undefined }), reset('keepLineBreaks', 'ap-keep-line-breaks'))),
      rotateRow,
      rotateNote,
    ] : [
      // 平铺条件项：不能在这里套数组，common 的 h() 不摊平嵌套子节点（会让 paint 递归抛 TypeError）
      type === 'image' ? gateItem(ctx, 'ap-img-fit', selectField(ctx, '缩放模式', String(o.fit ?? 'contain'), IMAGE_FIT_OPTIONS,
        v => patch({ fit: v }), propertyTip('ap-img-fit'), reset('fit', 'ap-img-fit'))) : '',
      // 只有剪裁档有「被裁掉的那条边」可挪，其余档不出这一行（与 canvas AppearanceGroup、两端单元格台同一门禁）
      type === 'image' && o.fit === 'cover' ? gateItem(ctx, 'ap-img-object-position', cropAnchorField(ctx, {
        fieldKey: 'ap-img-object-position', label: '裁剪锚点', src: resolveDesignImageSrc(o.src as string),
        widthMm: Number(o.width) || 0, heightMm: Number(o.height) || 0, fit: o.fit as string | undefined,
        scale: o.fitScale as number | undefined,
        value: o.objectPosition === undefined ? undefined : String(o.objectPosition),
        onCommit: v => patch({ objectPosition: v }),
        onScaleCommit: v => patch({ fitScale: v }),
        resetAnchor: reset('objectPosition', 'ap-img-object-position'),
        resetScale: reset('fitScale', 'ap-img-fit-scale'),
      })) : '',
      rotateRow,
      rotateNote,
      // 旋转行已覆盖全部可旋转的非文本类型，空态只剩不支持旋转的 flowList（表格走上方空 form）
      type === 'flowList' ? h('p', { class: 'pd-empty', text: '当前元素不支持外观设置' }) : '',
    ].filter(Boolean)),
  ]))

  if (isCode) {
    const isBarcode = type === 'barcode'
    // 码制归一化大写（存量模板可能是小写 code128，不归一化下拉框匹配不到选项）
    const barcodeType = String(o.barcodeType || 'CODE128').toUpperCase()
    const dpi = o.printerDpi ? String(o.printerDpi) : ''
    /** 条宽推荐段：只在填了分辨率时出现，只给参考不回写值（与画布元素台共用 core 文案） */
    const barWidthRec = barcodeBarWidthRecommendText(o.printerDpi, o.barWidth)
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
          ], v => patch({ printerDpi: Number(v) > 0 ? Number(v) : undefined }), undefined, reset('printerDpi', 'cd-dpi'))),
          gateItem(ctx, 'cd-dpi', h('p', {
            class: 'pd-hint',
            text: '填写后条宽吸附到整数打印点（消除出纸「条宽忽宽忽窄」）：条码先按条宽渲染，可用宽度够就原样落纸，不够才整体等比缩小',
          })),
          gateItem(ctx, 'cd-bar-width', numField(ctx, '条宽（倍率）', o.barWidth ?? 2, v => patch({ barWidth: v }), { min: 2, max: 8, step: 0.5 }, reset('barWidth', 'cd-bar-width'))),
          gateItem(ctx, 'cd-bar-width', h('p', {
            class: 'pd-hint',
            text: (dpi
              ? '已设置打印机分辨率：条宽会被吸附到最近的整数打印点（DPI 优先于毫米值），元素框放不下时整体等比缩小'
              : '热敏/针式打印建议 3 及以上：决定条码的落纸尺寸，条越粗出纸后条宽越稳定') + (barWidthRec ? `。${barWidthRec}` : ''),
          })),
          gateItem(ctx, 'cd-bar-quiet-zone', fieldHelp('静区 (模块)', stepper({
            value: o.barQuietZone, min: 0, max: 20, placeholder: '默认 10',
            onCommit: v => patch({ barQuietZone: v }),
          }), propertyTip('cd-bar-quiet-zone'), reset('barQuietZone', 'cd-bar-quiet-zone'))),
          gateItem(ctx, 'cd-bar-height', fieldHelp('条高 (mm)', stepper({
            value: o.barHeight, min: 1, max: 100, placeholder: '默认 30 模块',
            onCommit: v => patch({ barHeight: v ?? undefined }),
          }), propertyTip('cd-bar-height'), reset('barHeight', 'cd-bar-height'))),
          gateItem(ctx, 'cd-show-text', switchField(ctx, '显示文本', o.hideTitle !== true, v => patch({ hideTitle: v ? undefined : true }), reset('hideTitle', 'cd-show-text'))),
          gateItem(ctx, 'cd-font-size', field('文本字号（相对条高，条高为 30）', stepper({
            value: o.fontSize, min: 5, max: 24, placeholder: '默认 10',
            onCommit: v => patch({ fontSize: v || undefined }),
          }), undefined, reset('fontSize', 'cd-font-size'))),
        ] : [
          gateItem(ctx, 'cd-ec-level', selectField(ctx, '纠错级别', String(o.qrCodeLevel ?? 'M'), [
            { value: 'L', label: 'L（最低，容量大）' }, { value: 'M', label: 'M（推荐）' },
            { value: 'Q', label: 'Q' }, { value: 'H', label: 'H（最高）' },
          ], v => patch({ qrCodeLevel: v }), undefined, reset('qrCodeLevel', 'cd-ec-level'))),
          gateItem(ctx, 'cd-quiet-zone', fieldHelp('静区 (模块)', stepper({
            value: o.qrQuietZone, min: 0, max: 8, placeholder: '默认 0',
            onCommit: v => patch({ qrQuietZone: v }),
          }), propertyTip('cd-quiet-zone'), reset('qrQuietZone', 'cd-quiet-zone'))),
        ],
        divider('自定义设置'),
        isBarcode ? h('p', {
          class: 'pd-hint',
          text: '条码尺寸由「条宽」与「打印机分辨率」结算：宽度足够时按条宽原样落纸，不足时整体等比缩小；拉伸会把条宽变成非整数，故条形码不提供缩放模式，可用「最大宽高」限制上限。要放大条码：先加条宽倍率，再收窄静区（左右白边会换成条宽），必要时关掉显示文本以让出文本区高度',
        }) : '',
        !isBarcode ? gateItem(ctx, 'cd-fit', selectField(ctx, '缩放模式', String(o.fit || 'contain'), IMAGE_FIT_OPTIONS,
          v => patch({ fit: v || undefined }), undefined, reset('fit', 'cd-fit'))) : '',
        gateItem(ctx, 'cd-max-width', field('最大宽度 (mm)', stepper({
          value: o.maxWidth, min: 1, max: 200, placeholder: '默认',
          onCommit: v => patch({ maxWidth: v || undefined }),
        }), undefined, reset('maxWidth', 'cd-max-width'))),
        gateItem(ctx, 'cd-max-height', field('最大高度 (mm)', stepper({
          value: o.maxHeight, min: 1, max: 200, placeholder: '默认',
          onCommit: v => patch({ maxHeight: v || undefined }),
        }), undefined, reset('maxHeight', 'cd-max-height'))),
      ].flat().filter(Boolean)),
    ]))
  }

  if (!multiCellSelected) rows.push(bindingGroup(ctx, el))

  if (cellSelected) {
    rows.push(tableRowGroup(ctx, el))
    rows.push(tableCellGroup(ctx, el))
  }
  if (isTable) {
    rows.push(tableSettingsGroup(ctx, el))
  }
  // 流式列表：列数与行高必须指定、跨列默认关、放不下只提示不写值（与 canvas FlowListGroup 逐项一致）
  if (type === 'flowList') {
    const cols = resolveFlowColumns(o.flowColumns)
    const rowH = resolveFlowRowHeight(o.flowRowHeight)
    const gap = resolveFlowGapX(o.flowGapX)
    const maxSpan = resolveFlowMaxSpan(o.flowMaxSpan, cols)
    const fitCols = suggestFlowColumns(o.width ?? 0, gap, o.fontSize ?? 12)
    // 分组键与 canvas FlowListGroup 的 group-key 同串，两侧折叠偏好才互通
    rows.push(group(ctx, 'flowList', '流式列表', 'Grid3x3', [
      h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
        gateItem(ctx, 'fl-columns', fieldHelp('每行列数', stepper({
          value: cols, min: 1, max: 12,
          onCommit: v => patch({
            flowColumns: resolveFlowColumns(v),
            flowMaxSpan: resolveFlowMaxSpan(o.flowMaxSpan, resolveFlowColumns(v)),
          }),
        }), propertyTip('fl-columns'))),
        gateItem(ctx, 'fl-row-height', fieldHelp('行高 (mm)', stepper({
          value: rowH, min: 3, max: 100, step: 0.5,
          onCommit: v => patch({ flowRowHeight: resolveFlowRowHeight(v) }),
        }), propertyTip('fl-row-height'))),
        gateItem(ctx, 'fl-gap-x', fieldHelp('单元横向间距 (mm)', stepper({
          value: gap, min: 0, max: 50, step: 0.5,
          onCommit: v => patch({ flowGapX: resolveFlowGapX(v) }),
        }), propertyTip('fl-gap-x'))),
        // 关开关不动 flowMaxSpan：与 canvas onAutoSpanChange 同口径，只开时补钳一次
        gateItem(ctx, 'fl-auto-span', switchField(ctx, '内容过长时跨列', o.flowAutoSpan === true, v => {
          patch(v ? { flowAutoSpan: v, flowMaxSpan: maxSpan } : { flowAutoSpan: v })
        })),
        o.flowAutoSpan === true ? gateItem(ctx, 'fl-max-span', fieldHelp('最多跨几列', stepper({
          value: maxSpan, min: 1, max: cols,
          onCommit: v => patch({ flowMaxSpan: resolveFlowMaxSpan(v, cols) }),
        }), propertyTip('fl-max-span'))) : '',
        cols > fitCols ? h('p', {
          class: 'pd-hint',
          text: `按当前字号与框宽，${cols} 列偏挤（可放约 ${fitCols} 列）。数值保持不变，出纸按 ${cols} 列排。`,
        }) : '',
        // 单元模板与列表源不在本分组：模板写在「内容」分组的一条完整表达式里（{drugs.name} {drugs.spec}），
        // 列表源由表达式里出现的数组字段检出（core detectFlowListKey），与出纸同一口径
      ].flat().filter(Boolean)),
    ]))
  }

  /** 整圈四字段副本：预设与单边都在副本上改，再经 updateElement 收口（历史与重绘同一条路） */
  const borderFields = (): Pick<ElementOptions, 'borderWidth' | 'borderStyle' | 'borderColor' | 'borders'> => ({
    borderWidth: o.borderWidth, borderStyle: o.borderStyle, borderColor: o.borderColor, borders: o.borders,
  })
  const applyBorderPresetTo = (preset: BorderPreset) => {
    const next = borderFields()
    applyElementBorderPreset(next, preset, effectiveElementBorderSpec(next))
    patch(next)
  }
  /** 勾/撤单边：整圈生效时撤一边会把其余三边展开成分边（否则整圈照样盖住那条边） */
  const toggleBorderEdge = (side: ElementBorderSide) => {
    const next = borderFields()
    setElementBorderEdgeVisible(next, side, !elementBorderEdgeVisible(next, side))
    patch(next)
  }

  /** 三行显示「当前生效规格」（方案 B）：mixed／未设都留空，宽度与线型用「混合」占位说破各边不一 */
  const borderDisplay = resolveElementBorderDisplay(o)
  const styleMixed = borderDisplay.style === 'mixed'
  const displayWidth = typeof borderDisplay.width === 'number' ? borderDisplay.width : undefined
  const displayStyle = styleMixed || borderDisplay.style === undefined ? '' : borderDisplay.style
  const displayColor = typeof borderDisplay.color === 'string' ? borderDisplay.color : undefined
  const patchBorderField = (key: ElementBorderFieldKey, value: number | string | undefined) => {
    const next = borderFields()
    setElementBorderField(next, key, value)
    patch(next)
  }
  const styleOptions = styleMixed
    ? [{ value: '', label: '混合' }, ...BORDER_LINE_STYLES]
    : [...BORDER_LINE_STYLES]

  rows.push(group(ctx, 'border-bg', '边框与背景', 'Picture', [
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
      gateItem(ctx, 'bb-border-style', selectField(ctx, '线型', displayStyle, styleOptions,
        v => patchBorderField('borderStyle', v))),
      h('div', { class: 'border-row' }, [
        gateItem(ctx, 'bb-border-width', numField(ctx, '边框宽度', displayWidth,
          v => patchBorderField('borderWidth', v),
          { min: 0, max: 20, step: 0.25, placeholder: borderDisplay.width === 'mixed' ? '混合' : undefined },
          reset('borderWidth', 'bb-border-width'))),
        gateItem(ctx, 'bb-border-color', field('边框颜色', colorTrigger(displayColor, v => patchBorderField('borderColor', v), '边框颜色'), undefined, reset('borderColor', 'bb-border-color'))),
      ]),
      // rect/oval/hline/vline/table 用 border 画自身本体，写分边不出效果（与出纸 resolveElementBorder 同一排除表）
      ...(acceptsElementBorder(type) ? [
        h('div', { class: 'pd-button-group border-presets' }, ELEMENT_BORDER_PRESETS.map(p => h('button', {
          type: 'button', class: 'pd-button small', text: p.label, disabled: p.value === 'inner',
          onClick: () => applyBorderPresetTo(p.value),
        }))),
        h('div', { class: 'pd-checkbox-group' }, ELEMENT_BORDER_EDGES.map(edge => h('label', { class: 'pd-checkbox' }, [
          h('input', {
            type: 'checkbox', checked: elementBorderEdgeVisible(o, edge.value),
            onChange: () => toggleBorderEdge(edge.value),
          }),
          h('span', { text: edge.label }),
        ]))),
        h('p', { class: 'pd-hint', text: ELEMENT_BORDER_APPLY_HINT }),
      ] : []),
      gateItem(ctx, 'bb-bg-color', field('背景色', colorTrigger(o.backgroundColor, v => patch({ backgroundColor: v }), '背景颜色'), undefined, reset('backgroundColor', 'bb-bg-color'))),
    ]),
  ]))

  rows.push(paginationGroup(ctx, el))

  rows.push(group(ctx, 'advanced', '高级设置', 'Setting', [
    h('form', { class: 'pd-form', onSubmit: (ev: Event) => ev.preventDefault() }, [
      h('div', { class: 'advanced-row' }, [
        gateItem(ctx, 'ad-locked', switchField(ctx, '锁定', !!o.locked, v => patch({ locked: v }), reset('locked', 'ad-locked'))),
        gateItem(ctx, 'ad-fixed', switchField(ctx, '每页重复', !!o.fixed, v => patch({ fixed: v }), reset('fixed', 'ad-fixed'))),
      ]),
      gateItem(ctx, 'ad-z-index', numField(ctx, '层级', o.zIndex, v => patch({ zIndex: v }), { min: 0, max: 999 }, reset('zIndex', 'ad-z-index'))),
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
  // 拼版启用且每格占位宽高互换性变化（0/180 ↔ 90/270）时，列数自动铺满新档位上限（与 canvas 同口径）；
  // 同档位内切换占位不变，不重排——作者手动改小的列数得以保留
  const patchOutputRotation = (v: number) => {
    const tiling = t.tiling
    const swapped = (r: unknown) => r === 90 || r === 270
    if (tiling?.enabled && swapped(v) !== swapped(t.outputRotation)) {
      const maxColumns = computeMaxColumns({ ...t, outputRotation: v } as never)
      patch({ outputRotation: v, tiling: { ...tiling, columns: Math.max(maxColumns, 1) } })
      return
    }
    patch({ outputRotation: v })
  }
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
    // canvas：连续纸隐藏内容旋转（无旋转概念）；拼版启用时按每格内容旋转
    !continuous ? field('内容旋转角度', radioGroup('rot', [
      { value: '0', label: '0°' }, { value: '90', label: '90°' },
      { value: '180', label: '180°' }, { value: '270', label: '270°' },
    ], String(t.outputRotation ?? 0), v => patchOutputRotation(Number(v)), true),
      t.tiling?.enabled
        ? '拼版时每个标签的内容按该角度旋转；90°/270° 时每格占位宽高互换，列数自动铺满新档位上限，行数按互换后重算；0° 为不旋转（默认）'
        : '整页内容旋转对应角度出纸；90°/270° 时纸张长宽互换以贴合内容，内容不变形不裁切；0° 为不旋转（默认）') : '',
    field('页面背景色', h('div', { class: 'page-bg-row' }, [
      colorTrigger(t.pageBackground, v => patch({ pageBackground: v }), '页面背景色', 'page-bg-picker'),
    ]), undefined, resetButton({
      target: t as Record<string, any>, base: { pageBackground: undefined } as Record<string, any>,
      propKey: 'pageBackground', write: () => patch({ pageBackground: undefined }),
    })),
    designBackgroundSection(ctx),
    s.pages.length > 1 ? '' : tilingSection(ctx),
    divider('页边距 (mm)'),
    h('div', { class: 'margin-grid' }, [
      numField(ctx, '上', t.margins.top, v => patch({ margins: { ...t.margins, top: v } }), { min: 0, max: 50 }),
      numField(ctx, '下', t.margins.bottom, v => patch({ margins: { ...t.margins, bottom: v } }), { min: 0, max: 100 }),
      numField(ctx, '左', t.margins.left, v => patch({ margins: { ...t.margins, left: v } }), { min: 0, max: 50 }),
      numField(ctx, '右', t.margins.right, v => patch({ margins: { ...t.margins, right: v } }), { min: 0, max: 50 }),
    ]),
    divider('页眉/页脚高度 (mm)'),
    numField(ctx, '页眉高度', t.header.height ?? 10, v => patch({ header: { ...t.header, height: v } }), { min: 0, max: 100, step: 0.1 }),
    numField(ctx, '页脚高度', t.footer.height ?? 10, v => patch({ footer: { ...t.footer, height: v } }), { min: 0, max: 100, step: 0.1 }),
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
