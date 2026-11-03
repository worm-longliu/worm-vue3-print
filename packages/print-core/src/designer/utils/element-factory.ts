// web/src/components/print/utils/element-factory.ts
import type { RuntimeElement, ElementType, ElementOptions } from '../types.js'
import { createDefaultTable } from './table-matrix.js'

/**
 * 已屏蔽的元素类型：占位实现（设计态能画、出纸永远空盒），不允许从素材台新建，
 * 导入模板时一律剥离。类型联合与渲染分支保留，恢复只需把该类型从这里移出并放回素材台。
 */
export const BLOCKED_ELEMENT_TYPES: readonly ElementType[] = ['html']

export function isBlockedElementType(type?: string | null): boolean {
  return !!type && (BLOCKED_ELEMENT_TYPES as readonly string[]).includes(type)
}

/**
 * 找出模板里出现封禁元素类型的位置：覆盖多页 wrapper 与单页
 * elements / header.elements / footer.elements 三个区，路径可直接给 AI 定位。
 * AI 写回（print_apply_open_template 与宿主 demo）的共用门禁，不属于渲染端兜底。
 */
export function findBlockedElementPaths(template: unknown): string[] {
  const paths: string[] = []
  const scanElements = (elements: unknown, prefix: string) => {
    if (!Array.isArray(elements)) return
    elements.forEach((el, i) => {
      const holder = (el ?? {}) as { type?: unknown; printElementType?: { type?: unknown } }
      const typeStr = typeof holder.type === 'string'
        ? holder.type
        : typeof holder.printElementType?.type === 'string' ? holder.printElementType.type : undefined
      if (isBlockedElementType(typeStr)) paths.push(`${prefix}[${i}].type`)
    })
  }
  const scanPage = (page: unknown, prefix: string) => {
    if (!page || typeof page !== 'object') return
    // 单页时 prefix 为空字符串：段名直接作路径根，避免 .elements[0] 这类前导点
    const root = (sec: string): string => (prefix ? `${prefix}.${sec}` : sec)
    const p = page as { elements?: unknown; header?: { elements?: unknown }; footer?: { elements?: unknown } }
    scanElements(p.elements, root('elements'))
    scanElements(p.header?.elements, root('header.elements'))
    scanElements(p.footer?.elements, root('footer.elements'))
  }
  const isMultiPage = !!template && typeof template === 'object' && Array.isArray((template as { pages?: unknown }).pages)
  if (isMultiPage) {
    const pages = (template as { pages: unknown[] }).pages
    pages.forEach((page, i) => scanPage(page, `pages[${i}]`))
  } else {
    scanPage(template, '')
  }
  return paths
}

export function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultOptions(type: ElementType): ElementOptions {
  // pt → mm：20/50/120/20 → 7/17.6/42.3/7.1
  // 不预置 fontFamily：未手工配置字体时交还 CSS 继承，由渲染端系统默认字体承接
  const base: ElementOptions = {
    left: 7, top: 17.6, width: 42.3, height: 7.1,
  }

  switch (type) {
    case 'text':
      return { ...base, formatter: '文本', fontSize: 12, textAlign: 'left', height: 5.3 }
    case 'image':
      return { ...base, width: 28.2, height: 28.2, fit: 'contain' }
    case 'longText':
      return { ...base, width: 141.1, height: 28.2, fontSize: 12, lineHeight: 18 }
    case 'table': {
      const { rows, colWidths } = createDefaultTable()
      const totalW = colWidths.reduce((s, w) => s + w, 0)
      const totalH = rows.reduce((s, r) => s + r.height, 0)
      return {
        ...base, width: totalW, height: totalH,   // 表格尺寸由列宽/行高(mm)派生，与渲染端一致
        tableMode: 'dynamic',
        tableRows: rows,
        tableColWidths: colWidths,
        tableDefaultFontSize: 10,
        tableDefaultColor: '#333333',
        tableDefaultPadding: 1,
        fields: [],
        tablePagination: { enabled: true },
      }
    }
    case 'flowList':
      // 每行列数与行高都必须由作者指定（不自动算列数）；跨列默认关，打开后上限钳到列数。
      // 容器布局缺省 fixed：新拖入也不自动分页，动态模式由作者显式开启。
      return {
        ...base, width: 141.1, height: 21.2, fontSize: 12, formatter: '{name} {spec}',
        flowColumns: 4, flowRowHeight: 8, flowGapX: 4,
        flowAutoSpan: false, flowMaxSpan: 2,
        flowLayoutMode: 'fixed', flowPaddingTop: 0, flowPaddingRight: 0,
        flowPaddingBottom: 0, flowPaddingLeft: 0,
      }
    case 'hline':
      return { ...base, width: 70.6, height: 1.8, borderWidth: 0.75 }
    case 'vline':
      return { ...base, width: 1.8, height: 35.3, borderWidth: 0.75 }
    case 'rect':
      return { ...base, width: 28.2, height: 28.2, borderWidth: 1, borderColor: '#333' }
    case 'oval':
      return { ...base, width: 28.2, height: 28.2, borderWidth: 1, borderColor: '#333' }
    case 'barcode':
      return { ...base, width: 56.4, height: 14.1, title: '条形码', barcodeType: 'code128', testData: '12345678' }
    case 'qrcode':
      return { ...base, width: 28.2, height: 28.2, title: '二维码', testData: 'qrcode' }
    case 'html':
      return { ...base, width: 28.2, height: 28.2 }
    default:
      return base
  }
}

export function createRuntimeElement(type: ElementType, options?: Partial<ElementOptions>): RuntimeElement {
  const typeMetaMap: Record<ElementType, { title: string }> = {
    text: { title: '文本' },
    image: { title: '图片' },
    longText: { title: '长文' },
    table: { title: '表格' },
    flowList: { title: '流式列表' },
    hline: { title: '横线' },
    vline: { title: '竖线' },
    rect: { title: '矩形' },
    oval: { title: '椭圆' },
    barcode: { title: '条形码' },
    qrcode: { title: '二维码' },
    html: { title: 'HTML' },
    pageNumber: { title: '页码' },
  }

  return {
    id: generateId(),
    options: { ...createDefaultOptions(type), ...options },
    printElementType: { type, title: typeMetaMap[type]?.title || type },
  }
}
