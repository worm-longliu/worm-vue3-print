<!-- 表格右键菜单：行列增删/合并拆分/行类型切换 -->
<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="table-ctx-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @mousedown.stop
    >
      <div class="menu-item" @click="emitAction('insert-row-above')">在上方插入行</div>
      <div class="menu-item" @click="emitAction('insert-row-below')">在下方插入行</div>
      <div
        class="menu-item"
        :class="{ disabled: !canDeleteRow }"
        @click="canDeleteRow && emitAction('delete-row')"
      >
        删除行
      </div>
      <div class="menu-divider" />
      <div class="menu-item" @click="emitAction('insert-col-left')">在左侧插入列</div>
      <div class="menu-item" @click="emitAction('insert-col-right')">在右侧插入列</div>
      <div
        class="menu-item"
        :class="{ disabled: !canDeleteCol }"
        @click="canDeleteCol && emitAction('delete-col')"
      >
        删除列
      </div>
      <div class="menu-divider" />
      <div
        class="menu-item"
        :class="{ disabled: !!mergeDisabledReason }"
        :title="mergeDisabledReason || ''"
        @click="!mergeDisabledReason && emitAction('merge')"
      >
        合并单元格
      </div>
      <div
        class="menu-item"
        :class="{ disabled: !canSplit }"
        @click="canSplit && emitAction('split')"
      >
        拆分单元格
      </div>
      <div class="menu-divider" />
      <div class="menu-group-title">行类型</div>
      <div
        v-for="t in ROW_TYPES"
        :key="t.value"
        class="menu-item"
        :class="{ disabled: !!rowTypeDisabledReason(t.value), active: currentRowType === t.value }"
        :title="rowTypeDisabledReason(t.value) || ''"
        @click="!rowTypeDisabledReason(t.value) && emitAction('set-row-type', t.value)"
      >
        {{ t.label }}
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { TableRowType } from '../../types'

const ROW_TYPES: { value: TableRowType; label: string }[] = [
  { value: 'header', label: '标题行' },
  { value: 'data', label: '数据行' },
  { value: 'subtotal', label: '小计行' },
  { value: 'summary', label: '汇总行' },
]

defineProps<{
  visible: boolean
  x: number
  y: number
  canDeleteRow: boolean
  canDeleteCol: boolean
  mergeDisabledReason: string | null
  canSplit: boolean
  currentRowType: TableRowType | null
  rowTypeDisabledReason: (t: TableRowType) => string | null
}>()

const emit = defineEmits<{ action: [name: string, payload?: string] }>()

function emitAction(name: string, payload?: string) {
  emit('action', name, payload)
}
</script>

<style scoped>
.table-ctx-menu {
  position: fixed;
  z-index: 3000;
  min-width: 140px;
  padding: 4px 0;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  font-size: 13px;
}
.menu-item {
  padding: 5px 14px;
  cursor: pointer;
  color: #333;
}
.menu-item:hover {
  background: #f5f7fa;
}
.menu-item.disabled {
  color: #c0c4cc;
  cursor: not-allowed;
}
.menu-item.active {
  color: #165DFF;
}
.menu-divider {
  height: 1px;
  margin: 4px 0;
  background: #ebeef5;
}
.menu-group-title {
  padding: 4px 14px;
  font-size: 12px;
  color: #909399;
}
</style>
