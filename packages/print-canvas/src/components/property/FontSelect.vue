<template>
  <div class="font-select">
    <div class="font-select-row">
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
      <!-- mousedown.prevent 保住输入框焦点：点按钮不该收起列表或回填输入内容 -->
      <button
        v-if="fontQuery.canQuery"
        type="button"
        class="pd-button small font-select-query"
        :disabled="fontQuery.status === 'loading'"
        title="查询桌面客户端与服务端上可用的字体"
        @mousedown.prevent
        @click="fontQuery.run()"
      >{{ fontQuery.status === 'loading' ? '查询中…' : '查询字体' }}</button>
    </div>
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
    <div v-for="(text, index) in hints" :key="index" class="font-select-hint">{{ text }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, useId, watch } from 'vue'
import {
  filterFontCandidates,
  findFontCandidate,
  fontOptionLabel,
  normalizeFontQuery,
  useInjectedFontCatalog,
} from '../../composables/useFontCatalog'
import { FONT_QUERY_KEY } from '../../composables/useHostAdapter'
import { DEFAULT_FONT_QUERY } from '../../composables/useFontQuery'

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
/** 未注入时退化为「不可查询、已确认」：提示只看两端可用性，与接入手动查询前一致 */
const fontQuery = inject(FONT_QUERY_KEY, DEFAULT_FONT_QUERY)

/** 每实例独立的列表 id，供 combobox 的 aria 关联使用 */
const listId = `font-select-list-${useId()}`

const listRef = ref<HTMLUListElement | null>(null)
/** 输入框显示值：未提交时与 modelValue 不一致，提交或取消后回到 modelValue 的展示名 */
const text = ref(toDisplayName(props.modelValue))
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
    const family = resolveTypedFamily(typed)
    matched.push(make('free', '__free__', `使用「${family}」`, family))
  }
  return matched
})

/** 输入的是展示名（label）时，写进模板的必须是真实族名，否则字体静默失效 */
function resolveTypedFamily(typed: string): string {
  const key = normalizeFontQuery(typed)
  const hit = catalog.value.fonts.find(font => font.label && normalizeFontQuery(font.label) === key)
  return hit?.family ?? typed
}

/**
 * 展示名：宿主用 prop 声明了 label 的字体在输入框里显示 label（业务名），
 * 便于识别；写入模板的始终是族名，展示与存储分离。
 */
function toDisplayName(family?: string): string {
  const key = family?.trim()
  if (!key) return ''
  return findFontCandidate(catalog.value, key)?.label ?? key
}

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
  if (typed) {
    const family = resolveTypedFamily(typed)
    pick({ kind: 'free', key: '__free__', label: family, value: family, selected: false })
  }
}

function pick(row: FontRow): void {
  text.value = toDisplayName(row.value)
  query.value = ''
  open.value = false
  highlighted.value = -1
  emit('update:model-value', row.value)
}

function onCancel(): void {
  open.value = false
  query.value = ''
  highlighted.value = -1
  text.value = toDisplayName(props.modelValue)
}

watch(() => props.modelValue, value => { text.value = toDisplayName(value) })

/**
 * 查询状态与两端可用性共同决定提示，最多两条（服务端 / 客户端各一条）：
 * 没查过不报「未连接」（只是还没查），查过才引导用户去连接。
 */
const hints = computed<string[]>(() => {
  const { status, error, hasReport } = fontQuery.value
  if (status === 'loading') return ['正在查询服务端与本机字体清单…']
  if (status === 'failed') {
    return [`字体查询失败：${error ?? '未知原因'}，请检查服务端与桌面客户端连接后重试`]
  }
  if (status === 'idle' && !hasReport) {
    return ['尚未获取服务端与本机字体清单，点击「查询字体」获取']
  }
  const { server, client } = catalog.value.available
  const out: string[] = []
  if (!server) out.push('服务端未连接，请连接服务端后重新查询')
  if (!client) out.push('桌面客户端未连接，请连接桌面客户端后重新查询')
  return out
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
.font-select-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.font-select-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}
.font-select-query {
  flex: none;
  white-space: nowrap;
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
