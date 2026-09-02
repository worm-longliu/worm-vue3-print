// web/src/components/print/utils/field-tree-config.ts
// 打印模板字段树静态配置定义

/** 字段树节点 */
export interface FieldTreeNode {
  id: string
  fieldKey: string
  fieldLabel: string
  fieldType: 'string' | 'number' | 'date' | 'list'
  parentId: string | null
  isList: boolean
  children: FieldTreeNode[]
  demoValue?: any
}

/** 按业务类型获取字段树 */
export function getFieldTree(businessType: string): FieldTreeNode[] {
  return FIELD_TREE_CONFIG[businessType] ?? []
}

/** 获取指定业务类型的列表类型节点（用于表格数据源选择） */
export function getListFields(businessType: string): FieldTreeNode[] {
  const walk = (nodes: FieldTreeNode[]): FieldTreeNode[] => {
    const result: FieldTreeNode[] = []
    for (const n of nodes) {
      if (n.isList) result.push(n)
      result.push(...walk(n.children))
    }
    return result
  }
  return walk(FIELD_TREE_CONFIG[businessType] ?? [])
}

/** 将字段树展平为列表（用于下拉选择器） */
export function flattenFieldTree(nodes: FieldTreeNode[], prefix = ''): { label: string; value: string }[] {
  const result: { label: string; value: string }[] = []
  for (const n of nodes) {
    if (n.isList) {
      // 列表容器本身不可选，但需递归处理子节点
      result.push(...flattenFieldTree(n.children, prefix))
      continue
    }
    const label = prefix ? `${prefix}.${n.fieldLabel}` : n.fieldLabel
    result.push({ label, value: n.fieldKey })
    result.push(...flattenFieldTree(n.children, prefix))
  }
  return result
}

export const FIELD_TREE_CONFIG: Record<string, FieldTreeNode[]> = {
  purchase_receipt: [
    {
      id: 'supplier', fieldKey: 'supplier', fieldLabel: '供应商信息',
      fieldType: 'string', parentId: null, isList: false, children: [
        { id: 'supplier.name', fieldKey: 'supplier.name', fieldLabel: '供应商名称', fieldType: 'string', parentId: 'supplier', isList: false, children: [] },
        { id: 'supplier.phone', fieldKey: 'supplier.phone', fieldLabel: '供应商电话', fieldType: 'string', parentId: 'supplier', isList: false, children: [] },
        { id: 'supplier.address', fieldKey: 'supplier.address', fieldLabel: '供应商地址', fieldType: 'string', parentId: 'supplier', isList: false, children: [] },
      ],
    },
    {
      id: 'receiver', fieldKey: 'receiver', fieldLabel: '收货信息',
      fieldType: 'string', parentId: null, isList: false, children: [
        { id: 'receiver.name', fieldKey: 'receiver.name', fieldLabel: '收货人', fieldType: 'string', parentId: 'receiver', isList: false, children: [] },
        { id: 'receiver.phone', fieldKey: 'receiver.phone', fieldLabel: '收货电话', fieldType: 'string', parentId: 'receiver', isList: false, children: [] },
        { id: 'receiver.address', fieldKey: 'receiver.address', fieldLabel: '收货地址', fieldType: 'string', parentId: 'receiver', isList: false, children: [] },
      ],
    },
    {
      id: 'order', fieldKey: 'order', fieldLabel: '订单信息',
      fieldType: 'string', parentId: null, isList: false, children: [
        { id: 'order.no', fieldKey: 'order.no', fieldLabel: '订单编号', fieldType: 'string', parentId: 'order', isList: false, children: [] },
        { id: 'order.date', fieldKey: 'order.date', fieldLabel: '订单日期', fieldType: 'date', parentId: 'order', isList: false, children: [] },
        { id: 'order.total', fieldKey: 'order.total', fieldLabel: '订单金额', fieldType: 'number', parentId: 'order', isList: false, children: [] },
      ],
    },
    {
      id: 'goods', fieldKey: 'goods', fieldLabel: '商品明细',
      fieldType: 'list', parentId: null, isList: true, children: [
        { id: 'goods.name', fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', parentId: 'goods', isList: false, children: [] },
        { id: 'goods.spec', fieldKey: 'goods.spec', fieldLabel: '规格', fieldType: 'string', parentId: 'goods', isList: false, children: [] },
        { id: 'goods.unit', fieldKey: 'goods.unit', fieldLabel: '单位', fieldType: 'string', parentId: 'goods', isList: false, children: [] },
        { id: 'goods.qty', fieldKey: 'goods.qty', fieldLabel: '数量', fieldType: 'number', parentId: 'goods', isList: false, children: [] },
        { id: 'goods.price', fieldKey: 'goods.price', fieldLabel: '单价', fieldType: 'number', parentId: 'goods', isList: false, children: [] },
        { id: 'goods.amount', fieldKey: 'goods.amount', fieldLabel: '金额', fieldType: 'number', parentId: 'goods', isList: false, children: [] },
        { id: 'goods.remark', fieldKey: 'goods.remark', fieldLabel: '备注', fieldType: 'string', parentId: 'goods', isList: false, children: [] },
      ],
    },
  ],
}