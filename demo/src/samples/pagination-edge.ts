// demo/src/samples/pagination-edge.ts
// 分页极限示例：5 页 A4 纵向，每页固化一类分页引擎极限场景，用于回归「组合同页/跟随移页/预算边界」。
// P1 末页组合贴表格片底部（换页流式光标回归）；P2 组超剩余预算整组移页；
// P3 50mm 超高明细行 × 跨页重复表头；P4 并排堆叠簇并集扣高 + 贴满 275mm 预算线；
// P5 keepWithNext 绑定对差 1mm 必须整体移页。对应引擎侧断言见 print-core pagination-engine.edge.test.ts。
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import type { SampleTemplate } from './types'
import rawTemplate from '../template-pagination-edge.json'

const FIELDS: PrintBusinessField[] = [
  { id: 'pe-1', fieldKey: 'items', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 1 },
  { id: 'pe-2', fieldKey: 'items.seq', fieldLabel: '序号', fieldType: 'number', sortOrder: 2 },
  { id: 'pe-3', fieldKey: 'items.name', fieldLabel: '品名', fieldType: 'string', sortOrder: 3 },
  { id: 'pe-4', fieldKey: 'items.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 4 },
  { id: 'pe-5', fieldKey: 'items.price', fieldLabel: '单价', fieldType: 'number', sortOrder: 5 },
  { id: 'pe-6', fieldKey: 'items.amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 6 },
]

const NAMES = [
  '无线蓝牙耳机 Pro 黑色', '316 不锈钢保温杯 500ml', 'A4 牛皮纸档案盒', '机械键盘 87 键 红轴',
  '移动电源 20000mAh', '纯棉四件套 1.8m', 'LED 护眼台灯', '不锈钢锅铲套装',
  '智能手环 第 7 代', '帆布单肩包 大容量', '陶瓷马克杯 400ml', 'Type-C 数据线 2m', '折叠雨伞 全自动',
]

const DATA = {
  items: NAMES.map((name, i) => ({
    seq: i + 1,
    name,
    qty: (i % 5) + 1,
    price: +(19.9 + i * 23.45).toFixed(2),
    amount: +((19.9 + i * 23.45) * ((i % 5) + 1)).toFixed(2),
  })),
}

export const PAGINATION_EDGE_SAMPLE: SampleTemplate = {
  id: 'pagination-edge',
  name: '分页极限测试',
  group: '单据',
  desc: '5 页各验一类分页极限：组合整组同页/超预算移页、超高行×重复表头、堆叠簇并集扣高、keepWithNext 绑定对整体移页',
  paper: 'A4 纵向 × 5 页',
  fields: FIELDS,
  data: DATA,
  template: rawTemplate as unknown as TemplateData,
}
