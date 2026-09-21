<template>
  <Teleport to="body">
    <div v-if="open" class="custom-mask" @click.self="emit('close')">
      <div class="custom-panel">
        <div class="custom-head">
          <span class="custom-title">自定义字段与数据</span>
          <span class="custom-close" @click="emit('close')">×</span>
        </div>

        <div class="custom-body">
          <section class="custom-section">
            <div class="section-head">
              <span class="section-label">字段 fields</span>
              <span class="section-hint">业务字段数组，每项含 fieldKey / fieldLabel / fieldType / sortOrder</span>
            </div>
            <textarea
              v-model="fieldsText"
              class="custom-editor"
              spellcheck="false"
              @keydown.tab.prevent="onFieldsTab"
            ></textarea>
            <p v-if="fieldsError" class="custom-error">{{ fieldsError }}</p>
          </section>

          <section class="custom-section">
            <div class="section-head">
              <span class="section-label">数据 data</span>
              <span class="section-hint">打印数据对象，结构与字段 fieldKey 对应</span>
            </div>
            <textarea
              v-model="dataText"
              class="custom-editor"
              spellcheck="false"
              @keydown.tab.prevent="onDataTab"
            ></textarea>
            <p v-if="dataError" class="custom-error">{{ dataError }}</p>
          </section>
        </div>

        <div class="custom-foot">
          <button type="button" class="custom-btn ghost" @click="onFormat">格式化</button>
          <div class="custom-foot-right">
            <button type="button" class="custom-btn ghost" @click="emit('close')">取消</button>
            <button type="button" class="custom-btn" @click="onApply">应用</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { Ref } from 'vue'
import type { PrintBusinessField } from '@worm-vue3-print/canvas'

const props = defineProps<{
  open: boolean
  /** 当前字段树（打开弹窗时作为默认值快照） */
  fields: PrintBusinessField[]
  /** 当前打印数据（单份对象；打开弹窗时作为默认值快照） */
  data: Record<string, unknown>
}>()

const emit = defineEmits<{
  apply: [payload: { fields: PrintBusinessField[]; data: Record<string, unknown> }]
  close: []
}>()

const fieldsText = ref('')
const dataText = ref('')
const fieldsError = ref('')
const dataError = ref('')

/** Tab 键在光标处插入两个空格，避免焦点跳出编辑框 */
function insertIndent(model: Ref<string>, event: KeyboardEvent) {
  const el = event.target as HTMLTextAreaElement
  const start = el.selectionStart
  const end = el.selectionEnd
  model.value = `${model.value.slice(0, start)}  ${model.value.slice(end)}`
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + 2
  })
}

function onFieldsTab(event: KeyboardEvent) {
  insertIndent(fieldsText, event)
}

function onDataTab(event: KeyboardEvent) {
  insertIndent(dataText, event)
}

/** 解析字段数组 */
function parseFields(): PrintBusinessField[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(fieldsText.value)
  } catch (err) {
    fieldsError.value = `字段 JSON 解析失败：${err instanceof Error ? err.message : '语法错误'}`
    return null
  }
  if (!Array.isArray(parsed)) {
    fieldsError.value = '字段必须是数组，结构为 [ { "fieldKey": "...", "fieldLabel": "..." } ]'
    return null
  }
  const invalidIndex = parsed.findIndex(
    f => !f || typeof f !== 'object'
      || typeof (f as PrintBusinessField).fieldKey !== 'string'
      || typeof (f as PrintBusinessField).fieldLabel !== 'string',
  )
  if (invalidIndex >= 0) {
    fieldsError.value = `fields[${invalidIndex}] 缺少 fieldKey / fieldLabel 字段`
    return null
  }
  return parsed as PrintBusinessField[]
}

/** 解析数据对象 */
function parseData(): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(dataText.value)
  } catch (err) {
    dataError.value = `数据 JSON 解析失败：${err instanceof Error ? err.message : '语法错误'}`
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    dataError.value = '数据必须是对象，结构为 { "fieldKey": 值 }'
    return null
  }
  return parsed as Record<string, unknown>
}

function onFormat() {
  const fields = parseFields()
  if (fields) {
    fieldsText.value = JSON.stringify(fields, null, 2)
    fieldsError.value = ''
  }
  const data = parseData()
  if (data) {
    dataText.value = JSON.stringify(data, null, 2)
    dataError.value = ''
  }
}

function onApply() {
  const fields = parseFields()
  const data = parseData()
  if (!fields || !data) return
  fieldsText.value = JSON.stringify(fields, null, 2)
  dataText.value = JSON.stringify(data, null, 2)
  fieldsError.value = ''
  dataError.value = ''
  emit('apply', { fields, data })
}

// 每次打开：以当前字段与数据分别重置两个编辑区；取消期间的临时修改不留存
watch(
  () => props.open,
  open => {
    if (!open) return
    fieldsText.value = JSON.stringify(props.fields, null, 2)
    dataText.value = JSON.stringify(props.data, null, 2)
    fieldsError.value = ''
    dataError.value = ''
  },
)
</script>

<style scoped>
.custom-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 60, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.custom-panel {
  width: min(720px, 94vw);
  height: min(84vh, 760px);
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 26px 60px rgba(23, 32, 60, 0.28);
  overflow: hidden;
}
.custom-head {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecf2;
  flex-shrink: 0;
}
.custom-title {
  font-size: 15px;
  font-weight: 600;
  color: #2a2e37;
}
.custom-close {
  margin-left: auto;
  width: 26px;
  height: 26px;
  line-height: 24px;
  text-align: center;
  border-radius: 6px;
  font-size: 18px;
  color: #8b909c;
  cursor: pointer;
  user-select: none;
}
.custom-close:hover {
  background: #f4f6fa;
  color: #2a2e37;
}
.custom-body {
  flex: 1;
  min-height: 0;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.custom-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}
.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #2a2e37;
}
.section-hint {
  font-size: 11px;
  color: #9aa1af;
}
.custom-editor {
  flex: 1;
  min-height: 0;
  padding: 10px 12px;
  border: 1px solid #d9dde6;
  border-radius: 6px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #2a2e37;
  background: #fbfcfe;
  resize: none;
  outline: none;
  tab-size: 2;
}
.custom-editor:focus {
  border-color: #165dff;
  background: #fff;
}
.custom-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #dc2626;
}
.custom-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid #e9ecf2;
  flex-shrink: 0;
}
.custom-foot-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.custom-btn {
  padding: 6px 18px;
  border: 1px solid #165dff;
  border-radius: 6px;
  background: #165dff;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.custom-btn:hover {
  background: #0e4fd8;
}
.custom-btn.ghost {
  background: #f4f6fa;
  color: #2a2e37;
  border: 1px solid #d9dde6;
}
.custom-btn.ghost:hover {
  background: #e9ecf2;
}
</style>
