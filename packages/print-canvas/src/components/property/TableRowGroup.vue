<!-- 表格行属性分组：行类型/行高/每页重复（小计行按页重复） -->
<template>
  <PropertyGroup title="行属性" icon="Grid" default-expanded group-key="table-row">
    <form class="pd-form" @submit.prevent>
      <div class="pd-field"><span class="pd-label">行类型</span>
        <select :value="row.type" class="pd-select" style="width: 100%" @change="onTypeChange(($event.target as HTMLSelectElement).value as TableRowType)">
          <option value="header">标题行</option>
          <option value="data">数据行</option>
          <option value="subtotal">小计行（每页小计）</option>
          <option value="summary">汇总行</option>
        </select>
      </div>
      <div class="pd-field"><span class="pd-label">行高 (mm)</span>
        <input :value="row.height" type="number" class="pd-input"
          :min="3"
          :max="100"
          :step="0.5"
          style="width: 100%" @input="onHeightChange(($event.target as HTMLInputElement).valueAsNumber)" />
      </div>
      <div class="pd-field" v-if="row.type === 'header'"><span class="pd-label">每页顶部重复</span>
        <input :checked="row.repeatOnPage ?? false" type="checkbox" class="pd-switch" @input="onRepeatChange(!!($event.target as HTMLInputElement).checked)" />
      </div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue'
import type { RuntimeElement, TableSelection, TableRowType } from '../../types'
import { setRowType, syncTableElementSize } from '../../utils/table-matrix'
import { TABLE_EDIT_KEY } from '../../composables/useTableSelection'
import PropertyGroup from './PropertyGroup.vue'

const props = defineProps<{ element: RuntimeElement; selection: TableSelection }>()
const ctx = inject(TABLE_EDIT_KEY)!

const row = computed(() => props.element.options.tableRows![props.selection.r1]!)

function onTypeChange(t: TableRowType) {
  const err = setRowType(
    props.element.options.tableRows!,
    props.selection.r1,
    t,
  )
  if (err) {
    alert(err)
    return
  }
  ctx.recordHistory()
}

function onHeightChange(v: number | undefined) {
  if (v === undefined) return
  row.value.height = v
  syncTableElementSize(props.element.options)
  ctx.recordHistory()
}

function onRepeatChange(v: boolean) {
  row.value.repeatOnPage = v
  ctx.recordHistory()
}
</script>
