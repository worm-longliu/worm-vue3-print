// demo 业务字典：加载模板 106977040967000141（采购收货单 / purchase_receipt）
import type { PrintBusinessField } from '@worm-vue3-print/canvas'

/** 模板 ID（宿主持久化记录的主键，与设计器核心无关） */
export const TEMPLATE_ID = '106977040967000141'

/**
 * 采购收货单业务字段（来自 sys_print_business_field，宿主查询后传入设计器）。
 * fieldKey 为打印数据中的完整路径：
 * - 主表字段：supplier.* / receiver.* / order.*
 * - 明细列表：容器记录 goods（fieldType='list'，作为表格数据源）+ 明细列 goods.*
 * 无点且作为其它字段前缀的记录为分组容器（如 supplier），仅用于字段树分组展示。
 */
export const PURCHASE_RECEIPT_FIELDS: PrintBusinessField[] = [
  // 供应商信息
  { id: '1', fieldKey: 'supplier', fieldLabel: '供应商信息', fieldType: 'string', sortOrder: 1 },
  { id: '2', fieldKey: 'supplier.name', fieldLabel: '供应商名称', fieldType: 'string', sortOrder: 2 },
  { id: '3', fieldKey: 'supplier.phone', fieldLabel: '供应商电话', fieldType: 'string', sortOrder: 3 },
  { id: '4', fieldKey: 'supplier.address', fieldLabel: '供应商地址', fieldType: 'string', sortOrder: 4 },
  // 收货信息
  { id: '5', fieldKey: 'receiver', fieldLabel: '收货信息', fieldType: 'string', sortOrder: 5 },
  { id: '6', fieldKey: 'receiver.name', fieldLabel: '收货人', fieldType: 'string', sortOrder: 6 },
  { id: '7', fieldKey: 'receiver.phone', fieldLabel: '收货电话', fieldType: 'string', sortOrder: 7 },
  { id: '8', fieldKey: 'receiver.address', fieldLabel: '收货地址', fieldType: 'string', sortOrder: 8 },
  // 订单信息
  { id: '9', fieldKey: 'order', fieldLabel: '订单信息', fieldType: 'string', sortOrder: 9 },
  { id: '10', fieldKey: 'order.no', fieldLabel: '订单编号', fieldType: 'string', sortOrder: 10 },
  { id: '11', fieldKey: 'order.date', fieldLabel: '订单日期', fieldType: 'date', sortOrder: 11 },
  { id: '12', fieldKey: 'order.total', fieldLabel: '订单金额', fieldType: 'number', sortOrder: 12 },
  // 商品明细（列表容器 + 明细列）
  { id: '13', fieldKey: 'goods', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 13 },
  { id: '14', fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 14 },
  { id: '15', fieldKey: 'goods.spec', fieldLabel: '规格', fieldType: 'string', sortOrder: 15 },
  { id: '16', fieldKey: 'goods.unit', fieldLabel: '单位', fieldType: 'string', sortOrder: 16 },
  { id: '17', fieldKey: 'goods.qty', fieldLabel: '数量', fieldType: 'number', sortOrder: 17 },
  { id: '18', fieldKey: 'goods.price', fieldLabel: '单价', fieldType: 'number', sortOrder: 18 },
  { id: '19', fieldKey: 'goods.amount', fieldLabel: '金额', fieldType: 'number', sortOrder: 19 },
  { id: '20', fieldKey: 'goods.remark', fieldLabel: '备注', fieldType: 'string', sortOrder: 20 },
]
