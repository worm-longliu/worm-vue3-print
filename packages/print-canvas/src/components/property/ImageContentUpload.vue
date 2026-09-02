<template>
  <div class="image-content-upload">
    <label class="pd-button small upload-label" :class="{ disabled: uploadDisabled }">
      <svg class="pd-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3l4 4h-3v7h-2V7H8zm-7 12h14v5H5Z" /></svg>
      {{ uploading ? '上传中...' : '上传图片' }}
      <input
        class="visually-hidden"
        type="file"
        accept="image/*"
        :disabled="uploadDisabled"
        @change="handleFileChange"
      >
    </label>
    <p class="upload-tip">支持 jpg/png/gif/bmp/webp/svg 等图片，上传后填入相对路径</p>
  </div>
</template>

<script setup lang="ts">
import { ref, inject, computed } from 'vue'
import { UPLOAD_IMAGE_KEY } from '../../composables/useHostAdapter'

const props = defineProps<{ disabled?: boolean }>()

const emit = defineEmits<{ success: [url: string] }>()

const uploading = ref(false)
// 宿主注入的图片上传适配器；未注入时上传不可用
const uploadImage = inject(UPLOAD_IMAGE_KEY, computed(() => undefined))
const uploadDisabled = computed(() => props.disabled || uploading.value || !uploadImage.value)

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    alert('仅支持上传图片文件')
    input.value = ''
    return
  }
  if (!uploadImage.value) {
    alert('图片上传能力未配置')
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const url = await uploadImage.value(file)
    if (url) {
      emit('success', url)
    } else {
      alert('图片上传失败')
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : '图片上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<style scoped>
.image-content-upload {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-top: 4px;
}
.upload-label {
  cursor: pointer;
}
.upload-label.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.upload-tip {
  margin: 0;
  font-size: 11px;
  color: var(--pd-text-muted, #909399);
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
