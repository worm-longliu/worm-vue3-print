<template>
  <div class="font-select">
    <input
      v-model="text"
      class="pd-input font-select-input"
      type="text"
      role="combobox"
      aria-autocomplete="list"
      autocomplete="off"
      :placeholder="placeholder"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="activeRowId"
      @focus="onOpen"
      @click="onClick"
      @input="onInput"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="onEnter"
      @keydown.esc.prevent="onCancel"
      @blur="onCancel"
    />
    <ul v-if="open" :id="listId" ref="listRef" class="font-select-list" role="listbox">
      <li
        v-for="(row, index) in rows"
        :id="`${listId}-${index}`"
        :key="row.key"
        class="font-select-option"
        :class="{ 'is-active': index === highlighted, 'is-muted': row.kind === 'unknown' || row.kind === 'free' }"
        role="option"
        :aria-selected="row.selected"
        @mousedown.prevent="pick(row)"
      >{{ row.label }}</li>
    </ul>
    <div v-if="missingHint" class="font-select-hint warn">{{ missingHint }}</div>
    <div v-if="hint" class="font-select-hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import {
  filterFontCandidates,
  findFontCandidate,
  fontOptionLabel,
  useInjectedFontCatalog,
} from '../../composables/useFontCatalog'

const props = withDefaults(defineProps<{
  /** 当前族名；undefined 表示未设置，走全局兜底字体栈 */
  modelValue?: string
  /** 空值行文案（同时用作输入框 placeholder） */
  placeholder?: string
}>(), {
  placeholder: '默认',
})

const emit = defineEmits<{ 'update:model-value': [value: string | undefined] }>()

const catalog = useInjectedFontCatalog()

/** 每实例独立的列表 id，供 combobox 的 aria 关联使用 */
const listId = `font-select-list-${useId()}`

const listRef = ref<HTMLUListElement | null>(null)
/** 输入框显示值：未提交时与 modelValue 不一致，提交或取消后回到 modelValue */
const text = ref(props.modelValue ?? '')
/** 过滤词：展开时为空表示「列出全部」 */
const query = ref('')
const open = ref(false)
/** 高亮行下标；-1 表示无高亮（此时 Enter 不提交任何东西） */
const highlighted = ref(-1)

interface FontRow {
  key: string
  kind: 'clear' | 'unknown' | 'font' | 'free'
  label: string
  /** 提交值；clear 行为 undefined */
  value?: string
  selected: boolean
}

/**
 * 模板当前值不在任何清单内时（如导入了使用未上报字体的模板）必须保留一行，
 * 否则设计者会以为该字体在打开面板时被清掉了。
 */
const unknownFamily = computed(() => {
  const current = props.modelValue?.trim()
  if (!current) return ''
  return findFontCandidate(catalog.value, current) ? '' : current
})

const rows = computed<FontRow[]>(() => {
  const current = (props.modelValue ?? '').trim()
  const make = (kind: FontRow['kind'], key: string, label: string, value?: string): FontRow => ({
    kind,
    key,
    label,
    value,
    selected: (value ?? '') === current,
  })

  const typed = query.value.trim()
  // 过滤时不展示空值行与未知行：此时 Enter 应当落在命中项或用户输入的字体名上
  if (!typed) {
    const out: FontRow[] = [make('clear', '__clear__', props.placeholder)]
    if (unknownFamily.value) {
      out.push(make('unknown', '__unknown__', `${unknownFamily.value}（未知）`, unknownFamily.value))
    }
    for (const font of catalog.value.fonts) {
      out.push(make('font', font.family, fontOptionLabel(font), font.family))
    }
    return out
  }

  const matched = filterFontCandidates(catalog.value.fonts, typed).map(font =>
    make('font', font.family, fontOptionLabel(font), font.family),
  )
  // 清单外字体名可直接录入：一条都没命中时才补「使用「xxx」」，
  // 有命中项时补这行只会成为方向键路径上的噪音。
  if (!matched.length) {
    matched.push(make('free', '__free__', `使用「${typed}」`, typed))
  }
  return matched
})

const activeRowId = computed(() =>
  open.value && highlighted.value >= 0 ? `${listId}-${highlighted.value}` : undefined,
)

/** 当前值所在行；用于展开时把高亮落在已选字体上，避免误按 Enter 改掉字体 */
function currentRowIndex(): number {
  const current = (props.modelValue ?? '').trim()
  return rows.value.findIndex(row => (row.value ?? '') === current)
}

function onOpen(): void {
  if (open.value) return
  open.value = true
  query.value = ''
  highlighted.value = currentRowIndex()
}

/** 点击输入框只负责重新展开（Esc 收起后再次点开），不改动已输入内容 */
function onClick(): void {
  open.value = true
}

function onInput(): void {
  open.value = true
  query.value = text.value
  highlighted.value = rows.value.length ? 0 : -1
}

function move(delta: number): void {
  if (!open.value) {
    onOpen()
    return
  }
  const last = rows.value.length - 1
  if (last < 0) return
  highlighted.value = Math.min(Math.max(highlighted.value + delta, 0), last)
  scrollActiveIntoView()
}

function scrollActiveIntoView(): void {
  void nextTick(() => {
    const el = listRef.value?.children[highlighted.value] as HTMLElement | undefined
    el?.scrollIntoView?.({ block: 'nearest' })
  })
}

function onEnter(): void {
  if (!open.value) return
  const row = rows.value[highlighted.value]
  if (row) {
    pick(row)
    return
  }
  const typed = query.value.trim()
  if (typed) pick({ kind: 'free', key: '__free__', label: typed, value: typed, selected: false })
}

function pick(row: FontRow): void {
  text.value = row.value ?? ''
  query.value = ''
  open.value = false
  highlighted.value = -1
  emit('update:model-value', row.value)
}

function onCancel(): void {
  open.value = false
  query.value = ''
  highlighted.value = -1
  text.value = props.modelValue ?? ''
}

watch(() => props.modelValue, value => { text.value = value ?? '' })

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
</script>

<style scoped>
.font-select-input {
  width: 100%;
}
.font-select-list {
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  padding: 2px;
  border: 1px solid var(--pd-border, #d9dde6);
  border-radius: 6px;
  background: var(--pd-surface, #ffffff);
  list-style: none;
}
.font-select-option {
  padding: 4px 6px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.font-select-option.is-active {
  background: var(--pd-sidebar-hover, #f0f3f9);
}
.font-select-option.is-muted {
  color: var(--pd-text-muted, #8b909c);
}
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
