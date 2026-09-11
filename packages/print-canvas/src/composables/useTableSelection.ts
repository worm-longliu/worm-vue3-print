// 表格单元格选区跨组件共享契约：PrintDesigner provide，TableElement/PropertyPanel inject
import type { InjectionKey, Ref } from 'vue'
import type { TableSelection } from '@worm-vue3-print/core/designer'

export interface TableEditContext {
  tableSelection: Ref<TableSelection | null>
  setTableSelection: (s: TableSelection | null) => void
  recordHistory: () => void
  /** 页面打印范围宽度（mm）= 纸宽 - 左右边距，表格总列宽不得超过 */
  maxTableWidth: Ref<number>
}

export const TABLE_EDIT_KEY: InjectionKey<TableEditContext> = Symbol('table-edit')
