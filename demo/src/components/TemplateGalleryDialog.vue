<template>
  <Teleport to="body">
    <div v-if="open" class="gallery-mask" @click.self="$emit('close')">
      <div class="gallery-panel">
        <div class="gallery-head">
          <span class="gallery-title">选择示例模板</span>
          <span class="gallery-subtitle">{{ samples.length }} 个示例 · 全部使用静态数据</span>
          <button type="button" class="gallery-close" @click="$emit('close')">×</button>
        </div>

        <div class="gallery-tabs">
          <button
            v-for="g in groups"
            :key="g"
            type="button"
            class="gallery-tab"
            :class="{ on: activeGroup === g }"
            @click="activeGroup = g"
          >
            {{ g }}<span class="gallery-tab-count">{{ countOf(g) }}</span>
          </button>
        </div>

        <div class="gallery-body">
          <div
            v-for="s in visibleSamples"
            :key="s.id"
            class="sample-card"
            :class="{ selected: selectedId === s.id, current: s.id === currentId }"
            @click="selectedId = s.id"
            @dblclick="onConfirm"
          >
            <SampleThumb :template="s.template" :data="s.data" />
            <div class="sample-meta">
              <div class="sample-name">
                {{ s.name }}
                <span v-if="s.id === currentId" class="sample-flag">当前</span>
                <span v-if="s.template.tiling?.enabled" class="sample-flag tiling">拼版</span>
              </div>
              <div class="sample-paper">{{ s.paper }}</div>
              <div class="sample-desc">{{ s.desc }}</div>
            </div>
          </div>
        </div>

        <div class="gallery-foot">
          <span class="gallery-tip">选中后将覆盖当前画布内容（可撤销）</span>
          <div class="gallery-actions">
            <button type="button" class="gallery-btn ghost" @click="$emit('close')">取消</button>
            <button type="button" class="gallery-btn" :disabled="!selectedId" @click="onConfirm">使用该模板</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SampleThumb from './SampleThumb.vue'
import { listSamples } from '../samples'
import type { SampleGroup, SampleTemplate } from '../samples'

const props = defineProps<{
  open: boolean
  /** 当前画布已加载的示例 id（用于卡片上的「当前」标记） */
  currentId?: string
}>()

const emit = defineEmits<{
  select: [sample: SampleTemplate]
  close: []
}>()

type Tab = SampleGroup | '全部'
const groups: Tab[] = ['全部', '单据', '标签', '小票']

const activeGroup = ref<Tab>('全部')
const selectedId = ref<string>('')

const samples = listSamples()
const visibleSamples = computed(() => listSamples(activeGroup.value))

function countOf(g: Tab): number {
  return listSamples(g).length
}

// 每次打开：默认选中当前示例（或第一个），避免「确定」按钮空态
watch(() => props.open, (v) => {
  if (!v) return
  activeGroup.value = '全部'
  selectedId.value = props.currentId || samples[0]?.id || ''
})

function onConfirm() {
  const s = samples.find(x => x.id === selectedId.value)
  if (!s) return
  emit('select', s)
}
</script>

<style scoped>
.gallery-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 60, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.gallery-panel {
  width: min(920px, 94vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 26px 60px rgba(23, 32, 60, 0.28);
  overflow: hidden;
}
.gallery-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecf2;
}
.gallery-title {
  font-size: 15px;
  font-weight: 600;
  color: #2a2e37;
}
.gallery-subtitle {
  font-size: 12px;
  color: #8b909c;
}
.gallery-close {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #8b909c;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.gallery-close:hover {
  background: #f2f4f8;
  color: #2a2e37;
}
.gallery-tabs {
  display: flex;
  gap: 8px;
  padding: 10px 16px 0;
}
.gallery-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  border: 1px solid #d9dde6;
  border-radius: 999px;
  background: #ffffff;
  color: #5a667f;
  font-size: 13px;
  cursor: pointer;
}
.gallery-tab.on {
  border-color: #165dff;
  background: #eef3ff;
  color: #165dff;
  font-weight: 600;
}
.gallery-tab-count {
  font-size: 11px;
  color: #98a0b0;
}
.gallery-tab.on .gallery-tab-count {
  color: #165dff;
}
.gallery-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
  gap: 12px;
  padding: 14px 16px;
}
.sample-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e3e7ef;
  border-radius: 6px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sample-card:hover {
  border-color: #a9c2ff;
}
.sample-card.selected {
  border-color: #165dff;
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.12);
}
.sample-meta {
  min-width: 0;
  flex: 1;
}
.sample-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #2a2e37;
}
.sample-flag {
  padding: 1px 6px;
  border-radius: 3px;
  background: #eef3ff;
  color: #165dff;
  font-size: 11px;
  font-weight: 400;
}
.sample-flag.tiling {
  background: #fff3e8;
  color: #d97706;
}
.sample-paper {
  margin-top: 3px;
  font-size: 11px;
  color: #7a839a;
}
.sample-desc {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.5;
  color: #5a667f;
}
.gallery-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid #e9ecf2;
}
.gallery-tip {
  font-size: 12px;
  color: #8b909c;
}
.gallery-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.gallery-btn {
  padding: 6px 18px;
  border: none;
  border-radius: 6px;
  background: #165dff;
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
}
.gallery-btn:disabled {
  background: #c6d2ea;
  cursor: not-allowed;
}
.gallery-btn.ghost {
  background: #f4f6fa;
  color: #2a2e37;
  border: 1px solid #d9dde6;
}
</style>
