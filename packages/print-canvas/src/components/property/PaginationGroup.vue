<template>
  <PropertyGroup title="分页配置" icon="Document" group-key="pagination">
    <form class="pd-form" @submit.prevent>
      <!-- 表格元素分页配置 -->
      <template v-if="isTable">
        <div class="pd-field" v-show="showItem('pg-enabled')"><span class="pd-label">启用分页</span>
          <input type="checkbox" class="pd-switch" :checked="tablePaginationEnabled" @change="onTablePaginationChange(($event.target as HTMLInputElement).checked)" />
        </div>
      </template>
      <!-- 非表格元素分页配置 -->
      <template v-else>
        <div class="pd-field" v-show="showItem('pg-pageable')"><span class="pd-label">参与分页</span>
          <input type="checkbox" class="pd-switch" :checked="paginationPageable" @change="onPageableChange(($event.target as HTMLInputElement).checked)" />
        </div>
        <div class="pd-field" v-show="showItem('pg-keep-with-next')"><span class="pd-label">与下元素同页</span>
          <input type="checkbox" class="pd-switch" :checked="paginationKeepWithNext" @change="onKeepWithNextChange(($event.target as HTMLInputElement).checked)" />
        </div>
      </template>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '../../types'
import PropertyGroup from './PropertyGroup.vue'

const props = defineProps<{
  element: RuntimeElement
  matchedKeys?: Set<string>
  searching?: boolean
}>()

const isTable = computed(() => props.element.printElementType.type === 'table')

// 表格分页
const tablePaginationEnabled = computed({
  get: () => props.element.options.tablePagination?.enabled ?? true,
  set: () => { /* 由 change 处理 */ },
})

function onTablePaginationChange(checked: boolean) {
  props.element.options.tablePagination = {
    enabled: checked,
  }
}

// 非表格分页
const paginationPageable = computed({
  get: () => props.element.options.pagination?.pageable ?? true,
  set: () => { /* 由 change 处理 */ },
})

const paginationKeepWithNext = computed({
  get: () => props.element.options.pagination?.keepWithNext ?? false,
  set: () => { /* 由 change 处理 */ },
})

function onPageableChange(checked: boolean) {
  props.element.options.pagination = {
    pageable: checked,
    keepWithNext: paginationKeepWithNext.value,
  }
}

function onKeepWithNextChange(checked: boolean) {
  props.element.options.pagination = {
    pageable: paginationPageable.value,
    keepWithNext: checked,
  }
}

function showItem(key: string): boolean {
  if (!props.searching) return true
  return props.matchedKeys?.has(key) ?? true
}
</script>
