<template>
  <div class="design-background-config">
    <h3 class="pd-divider">设计背景</h3>
    <p class="design-background-tip">仅设计器显示，用于套打定位，不会出现在预览和打印中</p>

    <template v-if="modelValue?.src">
      <div class="design-background-path" :title="modelValue.src">{{ modelValue.src }}</div>
      <div class="design-background-actions">
        <button type="button" class="pd-button small rotate-btn" @click="onRotate">
          旋转（{{ rotation }}°）
        </button>
        <button type="button" class="pd-button small remove-btn" @click="onRemove">移除</button>
      </div>
    </template>

    <label v-else class="pd-button small upload-label" :class="{ disabled: uploadDisabled }">
      {{ uploading ? '上传中...' : '上传背景图' }}
      <input
        class="visually-hidden"
        type="file"
        accept="image/*"
        :disabled="uploadDisabled"
        @change="onFileChange"
      >
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { DesignBackground } from '@worm-vue3-print/core/designer'
import { UPLOAD_DESIGN_BACKGROUND_KEY } from '../../composables/useHostAdapter'

const props = defineProps<{ modelValue?: DesignBackground }>()
const emit = defineEmits<{ 'update:modelValue': [value: DesignBackground | undefined] }>()

const uploading = ref(false)
const uploadDesignBackground = inject(UPLOAD_DESIGN_BACKGROUND_KEY, computed(() => undefined))
const uploadDisabled = computed(() => uploading.value || !uploadDesignBackground.value)

const rotation = computed(() => props.modelValue?.rotation ?? 0)

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    alert('仅支持上传图片文件')
    input.value = ''
    return
  }
  if (!uploadDesignBackground.value) {
    alert('设计背景上传能力未配置')
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const src = await uploadDesignBackground.value(file)
    if (src) {
      emit('update:modelValue', { src, rotation: 0 })
    } else {
      alert('设计背景上传失败')
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : '设计背景上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function onRotate() {
  if (!props.modelValue?.src) return
  const next = ((rotation.value + 90) % 360) as DesignBackground['rotation']
  emit('update:modelValue', { src: props.modelValue.src, rotation: next })
}

function onRemove() {
  emit('update:modelValue', undefined)
}
</script>

<style scoped>
.design-background-config {
  padding: 0 4px;
}
.design-background-tip {
  margin: 2px 0 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pd-text-muted, #909399);
}
.design-background-path {
  margin-bottom: 6px;
  padding: 4px 6px;
  font-size: 11px;
  color: var(--pd-text-regular, #606266);
  background: var(--pd-fill-light, #f5f7fa);
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.design-background-actions {
  display: flex;
  gap: 6px;
}
.upload-label {
  cursor: pointer;
}
.upload-label.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
