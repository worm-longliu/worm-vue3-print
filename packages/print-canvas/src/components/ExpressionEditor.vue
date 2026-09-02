<template>
  <div v-if="visible" class="pd-dialog-overlay" @keydown.esc="visible = false">
  <section class="pd-dialog pd-dialog-large" role="dialog" aria-modal="true" aria-labelledby="expression-editor-title">
    <header class="pd-dialog-header">
      <strong id="expression-editor-title">编辑表达式</strong>
      <button type="button" class="pd-close" aria-label="关闭" @click="visible = false">×</button>
    </header>
    <div class="expression-editor">
      <!-- 左侧导航栏 -->
      <div class="ee-nav">
        <div class="ee-nav-title">类型</div>
        <div class="ee-nav-tabs">
          <div
            class="ee-nav-tab"
            :class="{ active: activeTab === 'field' }"
            @click="activeTab = 'field'"
          >
            📁 字段
          </div>
          <div
            class="ee-nav-tab"
            :class="{ active: activeTab === 'variable' }"
            @click="activeTab = 'variable'"
          >
            🔧 变量
          </div>
          <div
            class="ee-nav-tab"
            :class="{ active: activeTab === 'function' }"
            @click="activeTab = 'function'"
          >
            ⚡ 函数
          </div>
        </div>
      </div>

      <!-- 中间内容区 -->
      <div class="ee-content">
        <div class="ee-content-search">
          <input class="pd-input" v-model="searchText"
            :placeholder="searchPlaceholder" />
        </div>
        <div class="ee-content-list">
          <!-- 字段列表（按 fieldKey 首段分组：supplier.*/receiver.*/goods.* 等） -->
          <template v-if="activeTab === 'field'">
            <template v-for="group in filteredGroups" :key="group.key || '_top'">
              <div v-if="group.key" class="ee-field-group" :class="{ 'is-list': group.isList }">
                <span class="ee-field-group-icon">{{ group.isList ? '📋' : '📁' }}</span>
                <span>{{ group.label }}</span>
              </div>
              <div
                v-for="field in group.fields"
                :key="field.fieldKey"
                class="ee-list-item ee-field-item"
                :style="{ paddingLeft: group.key ? '22px' : '10px' }"
                @dblclick="handleFieldDoubleClick(field)"
              >
                <label class="ee-field-row">
                  <input
                    type="checkbox"
                    class="pd-checkbox"
                    :checked="selectedFields.has(field.fieldKey)"
                    @change="toggleField(field)"
                    @click.stop
                  />
                  <span class="ee-item-label">{{ field.fieldLabel }}</span>
                  <span class="ee-item-key">{{ field.fieldKey }}</span>
                </label>
              </div>
            </template>
            <p v-if="filteredGroups.length === 0" class="pd-empty">暂无字段</p>
          </template>

          <!-- 变量列表 -->
          <template v-if="activeTab === 'variable'">
            <div
              v-for="sv in filteredSystemVars"
              :key="sv.name"
              class="ee-list-item"
              @dblclick="handleItemDoubleClick(sv.template)"
            >
              <div class="ee-item-label">{{ sv.label }}</div>
              <div class="ee-item-key">{{ sv.name }}</div>
            </div>
          </template>

          <!-- 函数列表 -->
          <template v-if="activeTab === 'function'">
            <div class="ee-func-group">
              <div class="ee-func-group-title">聚合函数</div>
              <div
                v-for="fn in filteredAggregateFuncs"
                :key="fn.name"
                class="ee-list-item"
                @dblclick="handleAggregateDoubleClick(fn)"
              >
                <div class="ee-item-label">{{ fn.label }}</div>
                <div class="ee-item-key">{{ fn.name }}</div>
              </div>
            </div>
            <div class="ee-func-group">
              <div class="ee-func-group-title">格式化函数</div>
              <div
                v-for="fn in filteredFormatFuncs"
                :key="fn.name"
                class="ee-list-item"
                @dblclick="handleItemDoubleClick(fn.template)"
              >
                <div class="ee-item-label">{{ fn.label }}</div>
                <div class="ee-item-key">{{ fn.name }}</div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 右侧编辑区 -->
      <div class="ee-editor">
        <div class="ee-editor-section">
          <div class="ee-editor-title">表达式编辑</div>
          <textarea
            ref="textareaRef"
            v-model="localExpression"
            class="ee-textarea"
            rows="6"
            placeholder="双击左侧字段/函数插入表达式，如: {fieldKey} 或 SUM(amount)"
          />
        </div>

        <div class="ee-editor-section">
          <div class="ee-editor-title">预览结果</div>
          <div class="ee-preview" :class="{ 'ee-preview-error': previewResult === '（表达式错误）' }">{{ previewResult }}</div>
        </div>

        <div class="ee-help-section">
          <div class="ee-help-title">帮助信息</div>
          <div class="ee-help-grid">
            <div class="ee-help-card ee-help-field">
              <div class="ee-help-card-title">字段绑定</div>
              <div class="ee-help-card-content">
                使用 {字段名} 格式<br>
                示例: {order.no}
              </div>
            </div>
            <div class="ee-help-card ee-help-function">
              <div class="ee-help-card-title">函数使用</div>
              <div class="ee-help-card-content">
                SUM(字段) - 求和<br>
                AVG(字段) - 平均值<br>
                COUNT(字段) - 计数
              </div>
            </div>
            <div class="ee-help-card ee-help-variable">
              <div class="ee-help-card-title">系统变量</div>
              <div class="ee-help-card-content">
                {page} - 当前页码<br>
                {total} - 总页数<br>
                {row} - 当前行号
              </div>
            </div>
            <div class="ee-help-card ee-help-conditional">
              <div class="ee-help-card-title">条件判断</div>
              <div class="ee-help-card-content">
                IF(条件, 真值, 假值)<br>
                示例: IF(amount>1000, "大单", "小单")
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <footer class="pd-dialog-footer">
      <button type="button" class="pd-button" @click="visible = false">取消</button>
      <button type="button" class="pd-button primary" @click="onConfirm">确定</button>
    </footer>
  </section>
</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { PrintBusinessField } from '../types'
import { evaluateTemplate } from '../utils/expression-eval'
import { DEFAULT_DEMO_DATA } from '../utils/demo-data'
import { groupFields, filterGroups } from '../utils/field-groups'

const props = defineProps<{
  modelValue: boolean
  expression: string
  /** 宿主传入的业务字段（字段页数据源） */
  fields?: PrintBusinessField[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:expression': [value: string]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

// 新增状态
const activeTab = ref<'field' | 'variable' | 'function'>('field')

// 搜索占位符
const searchPlaceholder = computed(() => {
  switch (activeTab.value) {
    case 'field': return '搜索字段...'
    case 'variable': return '搜索变量...'
    case 'function': return '搜索函数...'
    default: return '搜索...'
  }
})

// 字段列表（宿主注入的扁平业务字段，按 fieldKey 首段分组展示）
const searchText = ref('')
const filteredGroups = computed(() =>
  filterGroups(groupFields(props.fields ?? []), searchText.value),
)

// 字段多选模式
const selectedFields = ref<Set<string>>(new Set())

function toggleField(field: PrintBusinessField) {
  const key = field.fieldKey
  const next = new Set(selectedFields.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  selectedFields.value = next
}

// 当弹出框打开时，根据当前 expression 值尝试匹配已选字段
watch(visible, (val) => {
  if (val) {
    // 每次打开时重置为外部传入值，避免携带上次编辑残留
    localExpression.value = props.expression || ''
    const found = (props.fields ?? []).find(
      f => props.expression === f.fieldKey || props.expression === `{${f.fieldKey}}`,
    )
    if (found) {
      selectedFields.value = new Set([found.fieldKey])
    }
  } else {
    selectedFields.value = new Set()
  }
})

// 字段双击处理
function handleFieldDoubleClick(field: PrintBusinessField) {
  insertAtCursor(`{${field.fieldKey}}`)
}

// 聚合函数双击 — 自动填充选中字段
function handleAggregateDoubleClick(fn: { name: string; template: string }) {
  if (selectedFields.value.size > 0) {
    const fields = Array.from(selectedFields.value).join(', ')
    insertAtCursor(`${fn.name}(${fields})`)
  } else {
    insertAtCursor(fn.template)
  }
}

// 通用双击处理（变量和格式化函数）
function handleItemDoubleClick(text: string) {
  insertAtCursor(text)
}

// 过滤后的系统变量
const filteredSystemVars = computed(() => {
  if (!searchText.value.trim()) return systemVars
  const keyword = searchText.value.trim().toLowerCase()
  return systemVars.filter(sv =>
    sv.label.toLowerCase().includes(keyword) ||
    sv.name.toLowerCase().includes(keyword)
  )
})

// 过滤后的聚合函数
const filteredAggregateFuncs = computed(() => {
  if (!searchText.value.trim()) return aggregateFunctions
  const keyword = searchText.value.trim().toLowerCase()
  return aggregateFunctions.filter(fn =>
    fn.label.toLowerCase().includes(keyword) || fn.name.toLowerCase().includes(keyword)
  )
})

// 过滤后的格式化函数
const filteredFormatFuncs = computed(() => {
  if (!searchText.value.trim()) return formatFunctions
  const keyword = searchText.value.trim().toLowerCase()
  return formatFunctions.filter(fn =>
    fn.label.toLowerCase().includes(keyword) || fn.name.toLowerCase().includes(keyword)
  )
})

// 表达式编辑模式
const localExpression = ref(props.expression || '')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

watch(() => props.expression, (val) => {
  localExpression.value = val || ''
})

const aggregateFunctions = [
  { name: 'SUM', label: '求和', template: 'SUM()' },
  { name: 'AVG', label: '平均值', template: 'AVG()' },
  { name: 'COUNT', label: '计数', template: 'COUNT()' },
  { name: 'MIN', label: '最小值', template: 'MIN()' },
  { name: 'MAX', label: '最大值', template: 'MAX()' },
]

const formatFunctions = [
  { name: 'MONEY', label: '金额格式化', template: 'MONEY()' },
  { name: 'DATE', label: '日期格式化', template: 'DATE()' },
  { name: 'UPPER', label: '大写金额', template: 'UPPER()' },
  { name: 'IF', label: '条件判断', template: 'IF()' },
]

const systemVars = [
  { name: 'pageIndex', label: '当前页码', template: '{pageIndex}' },
  { name: 'totalPages', label: '总页数', template: '{totalPages}' },
  { name: 'printDate', label: '打印日期', template: '{printDate}' },
  { name: 'printTime', label: '打印时间', template: '{printTime}' },
]

const previewResult = computed(() => {
  if (!localExpression.value.trim()) return '（输入表达式后预览）'
  try {
    const ctx = {
      ...DEFAULT_DEMO_DATA,
      // 系统变量示例值，与渲染端一致（print-render 在生成 HTML 时替换）
      pageIndex: 1,
      totalPages: 1,
      printDate: new Date().toISOString().split('T')[0],
      printTime: Date.now(),
    }
    const result = evaluateTemplate(localExpression.value, ctx)
    if (result === undefined || result === null) return '（无法计算）'
    return String(result)
  } catch (e) {
    return '（表达式错误）'
  }
})

function insertAtCursor(text: string) {
  const ta = textareaRef.value
  if (!ta) {
    localExpression.value += text
    return
  }
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const before = localExpression.value.substring(0, start)
  const after = localExpression.value.substring(end)
  localExpression.value = before + text + after
  nextTick(() => {
    ta.focus()
    ta.selectionStart = ta.selectionEnd = start + text.length
  })
}

function onConfirm() {
  emit('update:expression', localExpression.value)
  visible.value = false
}
</script>

<style scoped>
/* 主容器 */
.expression-editor {
  display: flex;
  height: 450px;
  gap: 0;
}

/* 左侧导航 */
.ee-nav {
  width: 100px;
  background: var(--pd-sidebar);
  border-right: 1px solid var(--pd-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.ee-nav-title {
  padding: 10px;
  border-bottom: 1px solid var(--pd-border);
  font-weight: 600;
  font-size: 13px;
  color: var(--pd-text);
  text-align: center;
}

.ee-nav-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 6px;
  gap: 4px;
}

.ee-nav-tab {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  transition: all 0.2s;
}

.ee-nav-tab.active {
  background: var(--pd-accent);
  color: white;
}

.ee-nav-tab:not(.active) {
  background: white;
  border: 1px solid var(--pd-border);
  color: var(--pd-text);
}

.ee-nav-tab:hover:not(.active) {
  background: #ecf5ff;
  border-color: var(--pd-accent);
}

/* 中间内容区 */
.ee-content {
  width: 300px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--pd-border);
  flex-shrink: 0;
}

.ee-content-search {
  padding: 10px;
  border-bottom: 1px solid var(--pd-border);
}

.ee-content-list {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
  min-height: 0;
}

/* 函数分组 */
.ee-func-group {
  margin-bottom: 12px;
}

.ee-func-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--pd-text-muted);
  padding: 4px 10px 6px;
  border-bottom: 1px solid var(--pd-border);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 字段分组标题 */
.ee-field-group {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--pd-text);
}
.ee-field-group.is-list {
  color: var(--pd-accent, #165DFF);
}
.ee-field-group-icon {
  font-size: 13px;
  filter: saturate(.6);
}
/* 列表项 */
.ee-list-item {
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 4px;
  transition: all 0.2s;
}
.ee-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ee-field-row .ee-item-label {
  flex: 1;
}

.ee-list-item:hover {
  background: #ecf5ff;
  border-color: var(--pd-accent);
}

.ee-list-item .ee-item-label {
  font-size: 12px;
  color: var(--pd-text);
}

.ee-list-item .ee-item-key {
  font-size: 10px;
  color: var(--pd-text-muted);
  font-family: monospace;
  margin-top: 2px;
}

/* 右侧编辑区 */
.ee-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--pd-sidebar);
  min-width: 0;
}

.ee-editor-section {
  padding: 12px;
  border-bottom: 1px solid var(--pd-border);
}

.ee-editor-title {
  font-size: 11px;
  color: var(--pd-text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 表达式编辑框 */
.ee-textarea {
  width: 100%;
  border: 1px solid var(--pd-border);
  border-radius: 6px;
  padding: 10px;
  font-family: monospace;
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
  min-height: 100px;
}

.ee-textarea:focus {
  outline: none;
  border-color: var(--pd-accent);
}

/* 预览结果 */
.ee-preview {
  padding: 10px;
  background: var(--pd-bg);
  border: 1px solid var(--pd-border);
  border-radius: 6px;
  min-height: 30px;
  font-size: 13px;
  color: var(--pd-text);
  line-height: 1.6;
}

.ee-preview-error {
  color: #e53e3e;
  background: #fef2f2;
  border-color: #fecaca;
}

/* 帮助信息 */
.ee-help-section {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  min-height: 0;
}

.ee-help-title {
  font-size: 11px;
  color: var(--pd-text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ee-help-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ee-help-card {
  border-radius: 6px;
  padding: 10px;
}

.ee-help-card-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.ee-help-card-content {
  font-size: 11px;
  line-height: 1.5;
  color: var(--pd-text);
}

.ee-help-field {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
}

.ee-help-field .ee-help-card-title {
  color: #0369a1;
}

.ee-help-function {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.ee-help-function .ee-help-card-title {
  color: #166534;
}

.ee-help-variable {
  background: #fefce8;
  border: 1px solid #fde68a;
}

.ee-help-variable .ee-help-card-title {
  color: #854d0e;
}

.ee-help-conditional {
  background: #fdf2f8;
  border: 1px solid #fbcfe8;
}

.ee-help-conditional .ee-help-card-title {
  color: #9d174d;
}

/* 弹窗内容区域 */
.expression-editor {
  max-height: min(600px, 80vh);
  overflow-y: auto;
  padding: 16px;
}
</style>
