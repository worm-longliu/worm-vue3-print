<template>
  <div class="property-group" :class="{ 'is-expanded': isExpanded }">
    <div class="group-header" @click="toggle">
      <span class="group-icon">{{ iconChar }}</span>
      <span class="group-title">{{ title }}</span>
      <span class="expand-icon">{{ isExpanded ? '▾' : '▸' }}</span>
    </div>
    <div v-show="isExpanded" class="group-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  title: string
  icon: string
  defaultExpanded?: boolean
  groupKey: string
}>()

const isExpanded = ref(props.defaultExpanded ?? true)

const iconMap: Record<string, string> = {
  Document: '≡',
  Brush: '◧',
  Setting: '⚙',
}
const iconChar = iconMap[props.icon] || '•'

function toggle() {
  isExpanded.value = !isExpanded.value
  saveState()
}

function saveState() {
  const key = `property-group-${props.groupKey}`
  try {
    localStorage.setItem(key, String(isExpanded.value))
  } catch {
    // 隐私模式或存储满，忽略持久化失败
  }
}

function loadState() {
  const key = `property-group-${props.groupKey}`
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null) {
      isExpanded.value = saved === 'true'
    }
  } catch {
    // 读取失败保持默认展开状态
  }
}

onMounted(() => {
  loadState()
})
</script>

<style scoped>
.property-group {
  border: 1px solid var(--pd-border-soft, #e9ecf2);
  border-radius: 8px;
  margin-bottom: 10px;
  background: var(--pd-surface, #ffffff);
  overflow: hidden;
  transition: border-color .14s ease, box-shadow .14s ease;
}
.property-group:last-child {
  margin-bottom: 2px;
}
.property-group.is-expanded {
  border-color: var(--pd-border-soft, #e9ecf2);
}
.group-header {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--pd-field-bg, #f4f6fa);
  transition: background .14s ease;
}
.group-header:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.property-group.is-expanded .group-header {
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
}
.group-icon {
  margin-right: 8px;
  color: var(--pd-accent, #165DFF);
}
.group-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--pd-text, #2a2e37);
  letter-spacing: .3px;
}
.expand-icon {
  color: var(--pd-text-muted, #8b909c);
  font-size: 10px;
}
.group-content {
  padding: 10px 12px 12px;
  background: var(--pd-surface, #ffffff);
}
</style>