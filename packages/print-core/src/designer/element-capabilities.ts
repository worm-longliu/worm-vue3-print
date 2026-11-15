// @worm-vue3-print/core/designer — 元素能力位注册表
//
// 把散落在 zone-layout / rotation / text-fit / element-border / binding-registry /
// element-factory 六处的「按元素类型硬编码」收敛成一张表。内置类型在模块加载时以
// 基线形式预注册，第三方插件通过 registerElementCapabilities 或 ElementPluginKind.capabilities
// 声明自己的能力位，与内置走完全相同的查询路径；同 type 后注册者覆盖，注销句柄只撤销自己那版。
//
// 设计约束：
// - 纯 TS，不依赖 Vue / DOM / 渲染库；服务端、浏览器、设计器、MCP 加载的是同一份口径。
// - 注册表挂 globalThis 固定 Symbol，避免 monorepo 多打包副本造成「注册在这份、查表在那份」。
// - 所有消费点必须提供 fallback：未注册类型按历史默认行为处理，保证存量模板零回归。
// - 能力位是「语义声明」，不是 UI 实现；画布/属性台由 plugin-kit + common 的 UI 注册表消费。

import type { ElementOptions, TextFit } from './types.js'
import type { BindingDescriptor } from './types.js'
import { createDefaultTable } from './utils/table-matrix.js'

/** 单个元素类型可声明的能力位；全部可选，未声明由消费点按历史默认回落 */
export interface ElementCapabilities {
  /** 允许放入页眉/页脚区（原 ZONE_ALLOWED_TYPES） */
  zoneAllowed?: boolean
  /** v1 忽略元素级旋转（原 ROTATION_EXCLUDED_TYPES） */
  rotationExcluded?: boolean
  /** 码类任意角度受 CODE_ROTATION_MIN_DPI 门槛约束（原 barcode/qrcode 硬编码） */
  codeRotationDpiGated?: boolean
  /** 未显式配置 textFit 时的默认形式（原 ELEMENT_DEFAULT_FIT） */
  defaultTextFit?: TextFit
  /** 是否参与元素级边框；false = 自身 border 画本体或走单元格边框（原 SELF_BORDER_TYPES） */
  acceptsElementBorder?: boolean
  /** formatter 绑定声明（原 ELEMENT_BINDING_REGISTRY） */
  bindings?: readonly BindingDescriptor[]
  /** 出厂默认选项的增量部分；createDefaultOptions 负责合并 left/top/width/height 基础盒 */
  defaultOptions?: () => Partial<ElementOptions>
  /** 屏蔽类型：素材台无入口，导入模板时剥离（原 BLOCKED_ELEMENT_TYPES） */
  blocked?: boolean
  /** 图层名 / AI 草稿标题（原 typeMetaMap） */
  title?: string
  /** 扩展类型是否固定高度、禁 autoHeight（与 ElementPluginKind.fixedHeight 同义） */
  fixedHeight?: boolean
}

/** 解析视图：始终带 type，能力位按「基线 → 后注册覆盖」合并后的结果 */
export interface ResolvedElementCapabilities extends ElementCapabilities {
  type: string
}

const REGISTRY_KEY = Symbol.for('worm-vue3-print.element-capabilities.v1')

interface Entry {
  caps: ElementCapabilities
  /** 注册序号，用于稳定遍历与后注册覆盖 */
  seq: number
}

interface RegistryState {
  entries: Map<string, Entry>
  nextSeq: number
  bootstrapped: boolean
}

type GlobalHost = { [key: symbol]: RegistryState | undefined }
const host = globalThis as unknown as GlobalHost

function state(): RegistryState {
  const existing = host[REGISTRY_KEY]
  if (existing) return existing
  const created: RegistryState = { entries: new Map(), nextSeq: 0, bootstrapped: false }
  host[REGISTRY_KEY] = created
  bootstrap(created)
  return created
}

const BASE_BOX: Readonly<Pick<ElementOptions, 'left' | 'top' | 'width' | 'height'>> = {
  // pt → mm：20/50/120/20 → 7/17.6/42.3/7.1
  // 不预置 fontFamily：未手工配置字体时交还 CSS 继承，由渲染端系统默认字体承接
  left: 7, top: 17.6, width: 42.3, height: 7.1,
}

/** 内置类型能力基线：逐项对齐改造前六处硬编码，任何取值变化都会影响存量出纸 */
export const BUILTIN_ELEMENT_CAPABILITIES: Readonly<Record<string, ElementCapabilities>> = Object.freeze({
  text: {
    zoneAllowed: true,
    defaultTextFit: 'clip',
    bindings: [{ targetPath: 'options.formatter', label: '内容', dataSource: 'main' }],
    defaultOptions: (): Partial<ElementOptions> => ({ formatter: '文本', fontSize: 12, textAlign: 'left', height: 5.3 }),
    title: '文本',
  },
  longText: {
    defaultTextFit: 'autoHeight',
    bindings: [
      { targetPath: 'options.formatter', label: '内容', dataSource: 'main' },
      { targetPath: 'options.styler', label: '样式', dataSource: 'main' },
    ],
    defaultOptions: (): Partial<ElementOptions> => ({ width: 141.1, height: 28.2, fontSize: 12, lineHeight: 18 }),
    title: '长文',
  },
  barcode: {
    zoneAllowed: true,
    codeRotationDpiGated: true,
    bindings: [{ targetPath: 'options.formatter', label: '内容', dataSource: 'main' }],
    defaultOptions: (): Partial<ElementOptions> => ({ width: 56.4, height: 14.1, title: '条形码', barcodeType: 'code128', testData: '12345678' }),
    title: '条形码',
  },
  qrcode: {
    zoneAllowed: true,
    codeRotationDpiGated: true,
    bindings: [{ targetPath: 'options.formatter', label: '内容', dataSource: 'main' }],
    defaultOptions: (): Partial<ElementOptions> => ({ width: 28.2, height: 28.2, title: '二维码', testData: 'qrcode' }),
    title: '二维码',
  },
  image: {
    zoneAllowed: true,
    bindings: [{
      targetPath: 'options.src', label: '内容', dataSource: 'main',
      placeholder: '输入图片路径，支持 /docfiles/... 相对路径、绝对 URL 或 {字段} 表达式',
    }],
    defaultOptions: (): Partial<ElementOptions> => ({ width: 28.2, height: 28.2, fit: 'contain' }),
    title: '图片',
  },
  table: {
    rotationExcluded: true,
    acceptsElementBorder: false,
    bindings: [],
    defaultOptions: (): Partial<ElementOptions> => {
      const { rows, colWidths } = createDefaultTable()
      const totalW = colWidths.reduce((s, w) => s + w, 0)
      const totalH = rows.reduce((s, r) => s + r.height, 0)
      return {
        width: totalW, height: totalH,
        tableMode: 'dynamic',
        tableRows: rows,
        tableColWidths: colWidths,
        tableDefaultFontSize: 10,
        tableDefaultColor: '#333333',
        tableDefaultPadding: 1,
        fields: [],
        tablePagination: { enabled: true },
      } as Partial<ElementOptions>
    },
    title: '表格',
  },
  flowList: {
    rotationExcluded: true,
    defaultTextFit: 'clip',
    bindings: [{
      targetPath: 'options.formatter', label: '单元模板', dataSource: 'main',
      placeholder: '{drugs.name} {drugs.spec}',
    }],
    defaultOptions: (): Partial<ElementOptions> => ({
      // 每行列数与行高都必须由作者指定（不自动算列数）；跨列默认关，打开后上限钳到列数。
      // 容器布局缺省 fixed：新拖入也不自动分页，动态模式由作者显式开启。
      width: 141.1, height: 21.2, fontSize: 12, formatter: '{name} {spec}',
      flowColumns: 4, flowRowHeight: 8, flowGapX: 4,
      flowAutoSpan: false, flowMaxSpan: 2,
      flowLayoutMode: 'fixed', flowPaddingTop: 0, flowPaddingRight: 0,
      flowPaddingBottom: 0, flowPaddingLeft: 0,
    } as Partial<ElementOptions>),
    title: '流式列表',
  },
  hline: {
    zoneAllowed: true,
    acceptsElementBorder: false,
    defaultOptions: (): Partial<ElementOptions> => ({ width: 70.6, height: 1.8, borderWidth: 0.75 }),
    title: '横线',
  },
  vline: {
    zoneAllowed: true,
    acceptsElementBorder: false,
    defaultOptions: (): Partial<ElementOptions> => ({ width: 1.8, height: 35.3, borderWidth: 0.75 }),
    title: '竖线',
  },
  rect: {
    zoneAllowed: true,
    acceptsElementBorder: false,
    defaultOptions: (): Partial<ElementOptions> => ({ width: 28.2, height: 28.2, borderWidth: 1, borderColor: '#333' }),
    title: '矩形',
  },
  oval: {
    zoneAllowed: true,
    acceptsElementBorder: false,
    defaultOptions: (): Partial<ElementOptions> => ({ width: 28.2, height: 28.2, borderWidth: 1, borderColor: '#333' }),
    title: '椭圆',
  },
  html: {
    blocked: true,
    defaultOptions: (): Partial<ElementOptions> => ({ width: 28.2, height: 28.2 }),
    title: 'HTML',
  },
  pageNumber: {
    title: '页码',
  },
})

function bootstrap(s: RegistryState): void {
  if (s.bootstrapped) return
  s.bootstrapped = true
  for (const [type, caps] of Object.entries(BUILTIN_ELEMENT_CAPABILITIES)) {
    if (s.entries.has(type)) continue
    s.entries.set(type, { caps, seq: s.nextSeq++ })
  }
}

/**
 * 注册（或覆盖）一个元素类型的能力位。返回注销句柄，只撤销「自己这一版」占用的类型，
 * 不会误删后来覆盖它的新声明；撤销内置类型会回落到 BUILTIN 基线而不是消失。
 */
export function registerElementCapabilities(type: string, caps: ElementCapabilities): () => void {
  if (!type || typeof type !== 'string') throw new Error('registerElementCapabilities: type 必须是非空字符串')
  if (!caps || typeof caps !== 'object') throw new Error('registerElementCapabilities: caps 必须是对象')
  const s = state()
  const seq = s.nextSeq++
  s.entries.set(type, { caps, seq })
  return () => {
    const current = state().entries.get(type)
    if (current?.caps !== caps) return
    const builtin = BUILTIN_ELEMENT_CAPABILITIES[type]
    if (builtin) state().entries.set(type, { caps: builtin, seq })
    else state().entries.delete(type)
  }
}

/** 合并后的能力位视图；未注册类型返回仅带 type 的空视图（消费点各自回落历史默认） */
export function getElementCapabilities(type?: string | null): ResolvedElementCapabilities {
  if (!type) return { type: '' }
  return { ...(state().entries.get(type)?.caps ?? {}), type }
}

/** 当前注册态里的全部类型（内置 + 插件，按注册顺序） */
export function getElementCapabilityTypes(): string[] {
  return [...state().entries.entries()]
    .sort((a, b) => a[1].seq - b[1].seq)
    .map(([type]) => type)
}

/** 清空为内置基线（仅供单测隔离使用） */
export function resetElementCapabilities(): void {
  const s = state()
  s.entries.clear()
  s.nextSeq = 0
  // 必须重置标志，否则 bootstrap 的幂等守卫会让清空后的注册表永久丢失内置基线
  s.bootstrapped = false
  bootstrap(s)
}

/** 基础盒：createDefaultOptions 与能力表共用，保证「出厂默认」只有一个出口 */
export function getElementBaseBox(): Pick<ElementOptions, 'left' | 'top' | 'width' | 'height'> {
  return { ...BASE_BOX }
}
