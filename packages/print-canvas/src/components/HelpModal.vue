<template>
  <Teleport to="body">
    <Transition name="help-modal">
      <div
        v-if="visible"
        class="help-modal-overlay"
        @click.self="$emit('close')"
      >
        <div class="help-modal">
          <div class="help-modal-header">
            <div class="help-modal-title-wrap">
              <h2 class="help-modal-title">帮助文档</h2>
              <span class="help-modal-project">worm-vue3-print</span>
            </div>
            <button
              class="help-modal-close"
              title="关闭"
              @click="$emit('close')"
            >
              ×
            </button>
          </div>
          
          <div class="help-modal-body">
            <div class="help-modal-sidebar">
              <button
                v-for="section in sections"
                :key="section.id"
                :class="['help-tab', { active: activeTab === section.id }]"
                @click="switchTab(section.id)"
              >
                {{ section.title }}
              </button>
            </div>
            
            <div class="help-modal-content">
              <div
                class="help-content"
                v-html="currentContent"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { helpSections } from '../help-content'

const props = withDefaults(defineProps<{
  visible: boolean
  initialTab?: string
}>(), {
  initialTab: 'getting-started'
})

const emit = defineEmits<{
  close: []
  'update:tab': [tab: string]
}>()

const sections = helpSections
const activeTab = ref(props.initialTab)

const STORAGE_KEY = 'worm-print-help-tab'
onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && sections.some(s => s.id === saved)) {
    activeTab.value = saved
  }
})

watch(() => props.visible, (v) => {
  if (v) {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && sections.some(s => s.id === saved)) {
      activeTab.value = saved
    }
  }
})

function switchTab(tabId: string) {
  activeTab.value = tabId
  localStorage.setItem(STORAGE_KEY, tabId)
  emit('update:tab', tabId)
}

const currentContent = computed(() => {
  const section = sections.find(s => s.id === activeTab.value)
  return section?.content || ''
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.help-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.help-modal {
  width: 800px;
  max-width: 90vw;
  height: 600px;
  max-height: 85vh;
  background: var(--pd-surface, #ffffff);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.help-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--pd-border, #d9dde6);
}

.help-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--pd-text, #2a2e37);
}

.help-modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.help-modal-project {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--pd-accent-soft, rgba(22, 93, 255, 0.09));
  color: var(--pd-accent, #165DFF);
  font-size: 12px;
  font-weight: 500;
}

.help-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s;
}

.help-modal-close:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
  color: var(--pd-text, #2a2e37);
}

.help-modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.help-modal-sidebar {
  width: 160px;
  padding: 12px;
  border-right: 1px solid var(--pd-border, #d9dde6);
  background: var(--pd-field-bg, #f4f6fa);
  overflow-y: auto;
}

.help-tab {
  display: block;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--pd-text, #2a2e37);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.help-tab:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
}

.help-tab.active {
  background: var(--pd-accent-soft, rgba(22, 93, 255, 0.09));
  color: var(--pd-accent, #165DFF);
  font-weight: 500;
}

.help-modal-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.help-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--pd-text, #2a2e37);
}

.help-content :deep(h2) {
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
  font-size: 18px;
  font-weight: 600;
}

.help-content :deep(h3) {
  margin: 20px 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.help-content :deep(p) {
  margin: 0 0 12px;
}

.help-content :deep(ul),
.help-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.help-content :deep(li) {
  margin-bottom: 4px;
}

.help-content :deep(code) {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--pd-field-bg, #f4f6fa);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
}

.help-content :deep(pre) {
  margin: 0 0 12px;
  padding: 12px;
  border-radius: 4px;
  background: var(--pd-field-bg, #f4f6fa);
  overflow-x: auto;
}

.help-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.help-content :deep(table) {
  width: 100%;
  margin: 0 0 12px;
  border-collapse: collapse;
}

.help-content :deep(th),
.help-content :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--pd-border, #d9dde6);
  text-align: left;
}

.help-content :deep(th) {
  background: var(--pd-field-bg, #f4f6fa);
  font-weight: 600;
}

.help-content :deep(blockquote) {
  margin: 0 0 12px;
  padding: 12px 16px;
  border-left: 3px solid var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, 0.09));
}

.help-modal-enter-active,
.help-modal-leave-active {
  transition: opacity 0.2s ease;
}

.help-modal-enter-active .help-modal,
.help-modal-leave-active .help-modal {
  transition: transform 0.2s ease;
}

.help-modal-enter-from,
.help-modal-leave-to {
  opacity: 0;
}

.help-modal-enter-from .help-modal,
.help-modal-leave-to .help-modal {
  transform: scale(0.95);
}
</style>
