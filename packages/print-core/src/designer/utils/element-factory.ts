// web/src/components/print/utils/element-factory.ts
import type { RuntimeElement, ElementType, ElementOptions } from '../types.js'
import { createDefaultTable } from './table-matrix.js'

export function generateId(): string {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultOptions(type: ElementType): ElementOptions {
  // pt → mm：20/50/120/20 → 7/17.6/42.3/7.1
  const base: ElementOptions = { left: 7, top: 17.6, width: 42.3, height: 7.1 }

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
