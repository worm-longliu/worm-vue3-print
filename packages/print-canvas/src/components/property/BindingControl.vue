<template>
  <div class="pd-field"><span class="pd-label">{{ descriptor.label }}</span>
    <input :value="modelValue" class="pd-input"
      :placeholder="descriptor.placeholder || '输入内容，支持 {字段} 表达式'"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @dblclick="openEditor" />
  </div>
  <ExpressionEditor
    v-model="editorVisible"
    :fields="fields"
    :expression="modelValue"
    @update:expression="(v: string) => emit('update:modelValue', v)"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { BindingDescriptor, PrintBusinessField } from '@worm-vue3-print/core/designer'
import ExpressionEditor from '../ExpressionEditor.vue'

const props = defineProps<{
  descriptor: BindingDescriptor
  modelValue: string
  fields?: PrintBusinessField[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const editorVisible = ref(false)

function openEditor() {
  editorVisible.value = true
}
</script>

<style scoped>
.binding-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>