import type { ElementOptions } from '@worm-vue3-print/core/designer'
import type { OptionKind, OptionMeta } from './units.js'

type Meta = OptionMeta
type OptionKey = keyof ElementOptions

/**
 * 组声明 helper。返回类型必须是 `{ [P in K]: Meta }` 这样的映射类型：
 * 若退回 `Record<string, Meta>`，展开后字面键被抹平，全键必填检查会把所有组里的键都报成缺失。
 */
function groupOf<K extends OptionKey>(
  kind: OptionKind,
  keys: readonly K[],
  extra: Partial<Meta> = {},
): { [P in K]: Meta } {
  return Object.fromEntries(keys.map(k => [k, { kind, ...extra }])) as { [P in K]: Meta }
}

const mm = <K extends OptionKey>(...k: K[]) => groupOf('mm', k)
const pt = <K extends OptionKey>(...k: K[]) => groupOf('pt', k)
const count = <K extends OptionKey>(...k: K[]) => groupOf('count', k)
const flag = <K extends OptionKey>(...k: K[]) => groupOf('bool', k)
const text = <K extends OptionKey>(...k: K[]) => groupOf('text', k)
const color = <K extends OptionKey>(...k: K[]) => groupOf('color', k)
const obj = <K extends OptionKey>(...k: K[]) => groupOf('object', k)

/**
 * `Record<keyof ElementOptions, Meta>` 是必填映射：core 新增 option 键而这里漏登记，
 * `tsc` 直接红（漂移闸门）。反向漂移（工厂实际产出的键没登记）由 spec 用 core
 * `createDefaultOptions` 逐类型反查兜住。
 */
export const OPTION_META: Record<OptionKey, Meta> = {
  // 几何（mm）
  ...mm('left', 'top', 'width', 'height'),
  ...mm('barHeight', 'maxWidth', 'maxHeight', 'flowRowHeight', 'flowGapX'),
  ...mm('flowPaddingTop', 'flowPaddingRight', 'flowPaddingBottom', 'flowPaddingLeft'),
  ...mm('tableDefaultPadding'),
  ...mm('contentPaddingLeft', 'contentPaddingTop', 'contentPaddingRight', 'contentPaddingBottom'),
  // 字号行距（pt）
  ...pt('fontSize', 'lineHeight', 'letterSpacing', 'shrinkMinFontSize', 'borderWidth'),
  ...pt('tableDefaultFontSize'),
  // 无量纲整数
  ...count('barWidth', 'barQuietZone', 'qrQuietZone', 'flowColumns', 'flowMaxSpan'),
  ...flag('wordWrap', 'keepLineBreaks', 'fixed', 'locked', 'visible', 'hideTitle', 'draggable', 'flowAutoSpan'),
  ...text('testData', 'fontFamily', 'fontWeight', 'borderStyle', 'textDecoration', 'textType',
    'barcodeType', 'barAutoWidth', 'src', 'objectPosition', 'axis', 'groupId', 'dataSource',
    'formatter', 'styler', 'rowStyler', 'tableDefaultFontFamily', 'tableDefaultColor'),
  ...color('color', 'backgroundColor', 'borderColor'),
  ...obj('borders', 'pagination', 'tablePagination', 'tableRows', 'tableColWidths'),
  flowLayoutMode: { kind: 'enum', enum: ['fixed', 'dynamic'] },
  textAlign: { kind: 'enum', enum: ['left', 'center', 'right', 'justify'] },
  verticalAlign: { kind: 'enum', enum: ['top', 'middle', 'bottom'] },
  textFit: { kind: 'enum', enum: ['clip', 'shrink', 'autoHeight'] },
  fit: { kind: 'enum', enum: ['contain', 'cover', 'fill', 'none', 'scale-down'] },
  qrCodeLevel: { kind: 'enum', enum: ['L', 'M', 'Q', 'H'] },
  // types.ts:335 起 printerDpi 是 number（常见 203/300/600），不是字符串枚举：
  // 声明成枚举会把在用的真实模板判成非法（已由 skills/ 与 demo/ 的模板回归测试夹住）
  printerDpi: { kind: 'count', min: 1 },
  rotate: { kind: 'count', min: 0, max: 360 },
  zIndex: { kind: 'count' },
  longTextIndent: { kind: 'count', min: 0 },
  fitScale: { kind: 'count', min: 100, max: 400 },
  tableMode: { kind: 'enum', enum: ['dynamic', 'static'], deprecated: true },
  title: { kind: 'text', deprecated: true },
  fields: { kind: 'object', deprecated: true },
}

export const OPTION_KEYS = Object.keys(OPTION_META) as OptionKey[]

export const DEPRECATED_OPTION_KEYS: readonly string[] = OPTION_KEYS.filter(
  k => OPTION_META[k].deprecated,
)
