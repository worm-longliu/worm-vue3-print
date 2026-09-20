// demo/src/samples/element-helper.ts
// 示例模板的元素/表格行构造函数：手写模板 JSON 太啰嗦，这里按最小必要字段收口。
import type {
  ElementOptions,
  ElementType,
  PrintElementData,
  TableCell,
  TableRow,
  TableRowType,
} from '@worm-vue3-print/canvas'

/** 元素类型 → 属性面板标题（与打印端 typeMetaMap 一致） */
const TYPE_TITLES: Record<ElementType, string> = {
  text: '文本',
  image: '图片',
  longText: '长文',
  table: '表格',
  hline: '横线',
  vline: '竖线',
  rect: '矩形',
  oval: '椭圆',
  barcode: '条形码',
  qrcode: '二维码',
  html: 'HTML',
  pageNumber: '页码',
}

/** 单元格简写：字符串即表达式，对象则可补充对齐/字号等 */
export type CellInput = string | (Partial<TableCell> & { formatter?: string })

/**
 * 创建元素工厂：同一模板内 id 唯一（前缀 + 自增序号）。
 * 每个示例文件各建一个工厂，前缀不同即可避免跨模板 id 撞车。
 */
export function createElementFactory(prefix: string) {
  let seq = 0

  function el(type: ElementType, options: ElementOptions): PrintElementData {
    seq += 1
    return {
      id: `${prefix}-${seq}`,
      type,
      options,
      printElementType: { type, title: TYPE_TITLES[type] },
    }
  }

  /** 表格行：cells 长度即列数，须与 tableColWidths 一致 */
  function row(
    type: TableRowType,
    height: number,
    cells: CellInput[],
    extra: Partial<Pick<TableRow, 'repeatOnPage'>> = {},
  ): TableRow {
    seq += 1
    const rid = `${prefix}-${seq}`
    return {
      id: `row-${rid}`,
      type,
      height,
      ...extra,
      cells: cells.map((c, i) =>
        typeof c === 'string'
          ? { id: `cell-${rid}-${i + 1}`, formatter: c }
          : { id: `cell-${rid}-${i + 1}`, ...c },
      ),
    }
  }

  return { el, row }
}
