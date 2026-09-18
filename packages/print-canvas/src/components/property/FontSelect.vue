<template>
  <div class="font-select">
    <select
      :value="modelValue ?? ''"
      class="pd-select"
      style="width: 100%"
      @change="onChange(($event.target as HTMLSelectElement).value)"
    >
      <option value="">{{ placeholder }}</option>
      <option v-if="unknownFamily" :value="unknownFamily">{{ unknownFamily }}（未知）</option>
      <option v-for="candidate in catalog.fonts" :key="candidate.family" :value="candidate.family">
        {{ fontOptionLabel(candidate) }}
      </option>
    </select>
    <div v-if="missingHint" class="font-select-hint warn">{{ missingHint }}</div>
    <div v-if="hint" class="font-select-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { findFontCandidate, fontOptionLabel, useInjectedFontCatalog } from '../../composables/useFontCatalog'

const props = withDefaults(defineProps<{
  /** 当前族名；undefined 表示未设置，走全局兜底字体栈 */
  modelValue?: string
  /** 空值项文案 */
  placeholder?: string
}>(), {
  placeholder: '默认',
})

const emit = defineEmits<{ 'update:model-value': [value: string | undefined] }>()

const catalog = useInjectedFontCatalog()

/**
 * 模板当前值不在任何清单内时（如导入了使用未上报字体的模板）必须补一项，
 * 否则原生 select 找不到匹配项会错位成空选中，设计者会误以为字体丢失。
 */
const unknownFamily = computed(() => {
  const current = props.modelValue?.trim()
  if (!current) return ''
  return findFontCandidate(catalog.value, current) ? '' : current
})

/** 仅在清单异常时给出提示；两端均正常时不占位 */
const hint = computed(() => {
  const { server, client } = catalog.value.available
  if (!server && !client) return '字体清单不可用'
  if (!client) return '桌面客户端未连接，本机字体未知'
  if (!server) return '服务端字体清单不可用'
  return ''
})

/**
 * 当前字体在某个「已成功上报」的出图端不存在。
 * 未上报的端不参与判定——拿不到清单不等于没有这个字体。
 */
const missingHint = computed(() => {
  const current = props.modelValue?.trim()
  if (!current) return ''
  const sources = (['server', 'client'] as const).filter(s => catalog.value.available[s])
  if (!sources.length) return ''
  const candidate = findFontCandidate(catalog.value, current)
  const missing = sources.filter(s => !candidate?.sources.includes(s))
  if (!missing.length) return ''
  const labels = missing.map(s => (s === 'server' ? '服务端' : '本机'))
  return `${labels.join('、')}无此字体，出图将回退到默认字体`
})

function onChange(value: string): void {
  emit('update:model-value', value || undefined)
}
</script>

<style scoped>
.font-select-hint {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pd-text-muted, #8b909c);
}
.font-select-hint.warn {
  color: var(--pd-accent-secondary, #f56c6c);
}
</style>
