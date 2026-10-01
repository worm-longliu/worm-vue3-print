
<template>
  <div class="demo-app">
    <header class="demo-topbar">
      <span class="demo-project">worm-vue3-print</span>
      <span class="demo-logo">打印模板设计器 Demo</span>
      <details class="demo-host-switch">
        <summary>宿主示例：Vue3</summary>
        <nav class="demo-host-switch-menu" aria-label="宿主示例互跳">
          <a href="http://localhost:9303/">Vue3 canvas（demo 权威示例）</a>
          <a class="on" href="http://localhost:9331/" title="当前页面">Vue3 宿主</a>
          <a href="http://localhost:9332/">Vue2 宿主</a>
          <a href="http://localhost:9335/">React 宿主</a>
          <a href="http://localhost:9334/">jQuery 宿主</a>
        </nav>
      </details>
      <span class="demo-badge">业务类型：{{ currentSample ? currentSample.name : '空白模板' }}</span>
      <span class="demo-badge">宿主：Vue 3 + Web Component</span>
      <button type="button" class="demo-print-btn" @click="customDialogVisible = true">自定义字段与数据</button>
      <button type="button" class="demo-print-btn" @click="galleryVisible = true">加载示例</button>
      <button type="button" class="demo-print-btn" @click="onExportTemplate">导出模板</button>
      <button type="button" class="demo-print-btn" @click="fileInputRef?.click()">导入模板</button>
      <button type="button" class="demo-print-btn" @click="onClearTemplate">清空</button>
      <label class="demo-batch-switch" :class="{ on: batchEnabled }" :title="`开启后浏览器预览/打印、客户端静默打印、服务端 PDF 均传入 ${batchDataList.length} 份数据数组，由打印插件合并为一个作业`">
        <input v-model="batchEnabled" type="checkbox" />
        <span>批量打印（{{ batchDataList.length }} 份）</span>
      </label>
      <button type="button" class="demo-print-btn" @click="printDialogVisible = true">打印输出</button>
      <input ref="fileInputRef" type="file" accept="application/json,.json" class="demo-file-input" @change="onImportTemplate($event)" />
    </header>

    <main class="demo-container">
      <!-- 自定义元素：字符串开关走 attribute，对象/函数入参走 property（见 script 注释） -->
      <print-designer
        ref="designerRef"
        is-edit="true"
        show-help="true"
        @save="onSave"
        @preview="onPreview"
        @help="onHelp"
        @dblclick-element="onDblclickElement"
        @dblclick-cell="onDblclickCell"
      />
    </main>

    <!-- 设计器预览：由设计器自带「预览」触发（@preview），DOM 结构与 demo 的 PrintHtmlPreview 一致 -->
    <div v-if="previewVisible" class="preview-mask">
      <div class="preview-panel">
        <div class="preview-head">
          <span class="preview-title">打印预览</span>
          <span v-if="previewPages > 0" class="preview-subtitle">{{ previewPages }} 页</span>
          <div class="preview-actions">
            <button type="button" class="preview-btn" @click="printPreview">打印</button>
            <button type="button" class="preview-btn ghost" @click="previewVisible = false">关闭</button>
          </div>
        </div>
        <div class="preview-body print-html-preview">
          <div v-if="previewLoading" class="print-html-preview-loading">预览渲染中…</div>
          <div v-if="previewError" class="print-html-preview-error">{{ previewError }}</div>
          <iframe ref="previewFrameRef" class="print-html-preview-iframe" title="打印预览" />
        </div>
      </div>
    </div>

    <!-- 打印输出弹窗（服务端 PDF / 客户端静默打印）：printData 随批量开关在对象/数组间切换 -->
    <div v-if="printDialogVisible" class="print-mask" @click.self="printDialogVisible = false">
      <div class="print-panel">
        <div class="print-head">
          <span class="print-title">打印输出</span>
          <span class="print-close" @click="printDialogVisible = false">×</span>
        </div>
        <div class="print-body">
          <section class="print-card">
            <h3 class="card-title">服务端 PDF 打印</h3>
            <p class="card-desc">将当前画布模板与 demo 数据交由 render 微服务渲染，生成 PDF 后在浏览器新标签页打开。</p>
            <div class="card-row">
              <span class="status" :class="renderStatus" :title="renderStatusTitle">
                <i class="status-dot"></i>{{ renderStatusText }}
              </span>
              <button type="button" class="text-btn" @click="refreshRenderStatus">重新检测</button>
            </div>
            <button type="button" class="primary-btn" :disabled="rendering || renderStatus !== 'online'" @click="onServerPdf">
              {{ rendering ? '生成中…' : '服务端 PDF' }}
            </button>
            <p v-if="renderError" class="error-text">{{ renderError }}</p>
          </section>

          <section class="print-card">
            <h3 class="card-title">客户端静默打印</h3>
            <p class="card-desc">页面内用 core 同构管线完成两遍渲染，将最终 HTML 直送本机打印客户端（WebSocket 127.0.0.1:17521）静默出纸，客户端不再执行模板渲染。</p>
            <div class="card-row">
              <span class="status" :class="clientStatus" title="本机打印客户端（WebSocket 127.0.0.1:17521）">
                <i class="status-dot"></i>{{ clientStatusText }}
              </span>
              <button type="button" class="text-btn" @click="connectPrintClient">重新检测</button>
            </div>
            <div class="card-actions">
              <select v-model="selectedPrinter" class="printer-select" :disabled="clientStatus !== 'online' || clientPrinting" title="选择目标打印机（留空为系统默认）">
                <option value="">系统默认打印机</option>
                <option v-for="p in clientPrinters" :key="p.name" :value="p.name">
                  {{ p.name }}{{ p.isDefault ? '（默认）' : '' }}
                </option>
              </select>
              <button type="button" class="primary-btn" :disabled="clientPrinting || clientStatus !== 'online'" @click="onClientPrint">
                {{ clientPrinting ? '打印中…' : '客户端静默打印' }}
              </button>
            </div>
            <p v-if="clientMessage" class="message-text" :class="clientMessageKind">{{ clientMessage }}</p>
          </section>
        </div>
      </div>
    </div>

    <!-- 示例模板库：点击「加载示例」唤出，选中后覆盖当前画布 -->
    <div v-if="galleryVisible" class="gallery-mask" @click.self="galleryVisible = false">
      <div class="gallery-panel">
        <div class="gallery-head">
          <span class="gallery-title">选择示例模板</span>
          <span class="gallery-subtitle">{{ SAMPLES.length }} 个示例 · 全部使用静态数据</span>
          <button type="button" class="gallery-close" @click="galleryVisible = false">×</button>
        </div>

        <div class="gallery-tabs">
          <button
            v-for="g in GROUPS"
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
            :class="{ selected: selectedId === s.id, current: s.id === currentSample?.id }"
            @click="selectedId = s.id"
            @dblclick="confirmGallery"
          >
            <SampleThumb :template="s.template" :data="s.data" />
            <div class="sample-meta">
              <div class="sample-name">
                {{ s.name }}
                <span v-if="s.id === currentSample?.id" class="sample-flag">当前</span>
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
            <button type="button" class="gallery-btn ghost" @click="galleryVisible = false">取消</button>
            <button type="button" class="gallery-btn" :disabled="!selectedId" @click="confirmGallery">使用该模板</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 自定义字段与数据：直接粘贴 JSON，调整后即时生效，便于验证打印效果 -->
    <div v-if="customDialogVisible" class="custom-mask" @click.self="customDialogVisible = false">
      <div class="custom-panel">
        <div class="custom-head">
          <span class="custom-title">自定义字段与数据</span>
          <span class="custom-close" @click="customDialogVisible = false">×</span>
        </div>

        <div class="custom-body">
          <section class="custom-section">
            <div class="section-head">
              <span class="section-label">字段 fields</span>
              <span class="section-hint">业务字段数组，每项含 fieldKey / fieldLabel / fieldType / sortOrder</span>
            </div>
            <textarea v-model="fieldsText" class="custom-editor" spellcheck="false"></textarea>
            <p v-if="fieldsError" class="custom-error">{{ fieldsError }}</p>
          </section>

          <section class="custom-section">
            <div class="section-head">
              <span class="section-label">数据 data</span>
              <span class="section-hint">打印数据对象，结构与字段 fieldKey 对应</span>
            </div>
            <textarea v-model="dataText" class="custom-editor" spellcheck="false"></textarea>
            <p v-if="dataError" class="custom-error">{{ dataError }}</p>
          </section>
        </div>

        <div class="custom-foot">
          <button type="button" class="custom-btn ghost" @click="onFormatJson">格式化</button>
          <div class="custom-foot-right">
            <button type="button" class="custom-btn ghost" @click="customDialogVisible = false">取消</button>
            <button type="button" class="custom-btn" @click="onApplyCustom">应用</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
// Vue 3 宿主集成 @worm-vue3-print/common 的完整链路示例。
// 版式与 ./demo（Vue 3 设计器示例）完全一致：样式由 sync-demo-styles.mjs 从 demo 逐字抽取生成，
// 本文件不写任何私有样式；事件不走侧栏面板，而是与 demo 同口径写控制台 + 下载 + alert。
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { createDefaultTemplate } from '@worm-vue3-print/common'
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { SAMPLES } from './templates'
import SampleThumb from './SampleThumb.vue'
import { checkRenderHealth, openPdfBlob, requestServerPdf } from './render-client'
import { renderInBrowser, writeHtmlToFrame } from './browser-render'

/** 宿主基址：模板里的相对路径图片按它拼接 */
const BASE_URL = window.location.origin

const designerRef = ref(null)   // <print-designer> 自定义元素本体
const fields = ref([])
const templateData = ref(createDefaultTemplate())
const activeData = shallowRef({})
const currentSample = shallowRef(null)

/**
 * 当前示例的批量数据：示例自带 batchData 时优先使用（一枚一条的标签场景），
 * 否则由当前单份数据派生，避免自定义数据与批量内容脱节。
 */
function deriveBatchData(base) {
  return Array.from({ length: 3 }, (_, i) => {
    const data = structuredClone(base)
    if (data.order && typeof data.order.no === 'string') {
      data.order = { ...data.order, no: `${data.order.no}-B${String(i + 1).padStart(2, '0')}` }
    }
    return data
  })
}

const batchEnabled = ref(false)
const customDataActive = ref(false)
const batchDataList = computed(() =>
  !customDataActive.value && currentSample.value?.batchData
    ? currentSample.value.batchData
    : deriveBatchData(activeData.value),
)
/** 当前生效的打印数据：对象=单份，数组=批量，三条链路共用同一数据源 */
const printData = computed(() => (batchEnabled.value ? batchDataList.value : activeData.value))

// ────────────────── 设计器：属性注入与宿主回调 ──────────────────
// <print-designer> 是原生自定义元素：`:fields="..."` 这类绑定会走 setAttribute，
// 对象被字符串化成 "[object Object]"，所以对象/函数入参必须赋 property；
// 只有字符串开关（is-edit、show-help）可以写在模板属性上。
// fields 只有 setter（读回看 el.store.fields），故日志按宿主自身持有的数据计数。
function syncDesigner() {
  const el = designerRef.value
  if (!el) return
  el.fields = fields.value
  el.template = templateData.value
  console.log(`[demo] 注入 fields(${fields.value.length} 个字段) 与 template(${templateData.value.paperSize})`)
}

/** 图片上传回调：设计器「插入图片」时调用，宿主返回可访问地址即可（demo 用 Data URL 模拟上传接口） */
function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

/** 载入示例：模板深拷贝后回写（重复选同一示例也能触发重载），字段树与打印数据同步切换 */
function applySample(sample) {
  templateData.value = JSON.parse(JSON.stringify(sample.template))
  fields.value = [...sample.fields]
  activeData.value = sample.data
  currentSample.value = sample
  customDataActive.value = false
  galleryVisible.value = false
  syncDesigner()
}

// ────────────────── 设计器事件（CustomEvent，载荷在 event.detail） ──────────────────
/** 宿主侧拼版校验：getTemplateJson() 是绕过保存按钮的旁路，消费它的链路需自己拦截非法拼版 */
function assertTilingValid() {
  const issues = designerRef.value?.validateTemplate?.() ?? []
  if (issues.length) {
    alert(issues[0].message)
    return false
  }
  return true
}

function downloadTemplateFile(json, name) {
  const blob = new Blob([JSON.stringify(JSON.parse(json), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** @save：设计器保存按钮触发，宿主在此持久化。demo 仅下载 JSON 并打印到控制台 */
function onSave(event) {
  if (!assertTilingValid()) return
  downloadTemplateFile(event.detail, `template-${Date.now()}.json`)
  console.log('[demo] @save 保存模板：', JSON.parse(event.detail))
}

/** @preview：设计器预览按钮触发，detail 已带模板 JSON，直接渲染免保存预览 */
function onPreview(event) {
  console.log('[demo] @preview 触发')
  openPreview(JSON.parse(event.detail))
}

function onHelp() {
  console.log('[demo] @help 触发：设计器自带帮助弹窗，宿主可据此埋点')
}

function onDblclickElement(event) {
  // detail 为元素 id 字符串（与 canvas 的 @dblclick-element 首参同口径）
  console.log('[demo] @dblclick-element 触发：', event.detail)
}

function onDblclickCell(event) {
  // detail 为 { elementId, r, c, cellId } 对象（画布单元格与属性台单元格两条入口同形）
  console.log('[demo] @dblclick-cell 触发：', event.detail)
}

// ────────────────── 顶栏：模板导入 / 导出 / 清空 ──────────────────
const fileInputRef = ref(null)

function onExportTemplate() {
  if (!assertTilingValid()) return
  const json = designerRef.value?.getTemplateJson?.()
  if (!json) return
  downloadTemplateFile(json, `template-${Date.now()}.json`)
}

/** 轻量结构校验：接受单页模板，或多页面 wrapper（{ pages: [...] }，每页为完整单页模板） */
function isSingleTemplateLike(t) {
  return typeof t.paperSize === 'string'
    && !!t.margins && typeof t.margins === 'object'
    && Array.isArray(t.elements)
}
function isTemplateLike(data) {
  if (!data || typeof data !== 'object') return false
  if (isSingleTemplateLike(data)) return true
  return Array.isArray(data.pages) && data.pages.length > 0
    && data.pages.every(p => p && typeof p === 'object' && isSingleTemplateLike(p))
}

function onImportTemplate(event) {
  const input = event.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if (!isTemplateLike(data)) {
        alert('模板文件结构不合法：缺少 paperSize / margins / elements 等关键字段')
        return
      }
      templateData.value = data
      currentSample.value = null
      syncDesigner()
    } catch {
      alert('模板文件读取失败，请确认是有效的 JSON 文件')
    }
  }
  reader.onerror = () => alert('模板文件读取失败')
  reader.readAsText(file)
}

/** 清空：恢复空白模板（字段树与打印数据保留，便于继续拖字段） */
function onClearTemplate() {
  if (!confirm('将清空当前画布模板，是否继续？')) return
  templateData.value = createDefaultTemplate()
  currentSample.value = null
  syncDesigner()
}

// ────────────────── 链路一：浏览器渲染预览 + 浏览器打印 ──────────────────
const previewVisible = ref(false)
const previewPages = ref(0)
const previewLoading = ref(false)
const previewError = ref('')
const previewFrameRef = ref(null)

async function openPreview(templateJson) {
  previewPages.value = 0
  previewError.value = ''
  previewLoading.value = true
  previewVisible.value = true
  try {
    const rendered = await renderInBrowser(templateJson, printData.value, BASE_URL)
    // iframe 由 v-if 控制，需等这一帧渲染完成后再取节点
    await nextFrame()
    writeHtmlToFrame(previewFrameRef.value, rendered.html)
    previewPages.value = rendered.pageCount
  } catch (error) {
    previewError.value = `渲染失败：${error.message}`
  } finally {
    previewLoading.value = false
  }
}

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

function printPreview() {
  previewFrameRef.value?.contentWindow?.print()
}

// 全屏预览没有可点击的遮罩空白区，改用 Esc 关闭：打开时绑定、关闭时解绑
function onPreviewKeydown(event) {
  if (event.key === 'Escape') previewVisible.value = false
}
watch(previewVisible, visible => {
  if (visible) window.addEventListener('keydown', onPreviewKeydown)
  else window.removeEventListener('keydown', onPreviewKeydown)
})

// ────────────────── 示例模板库弹窗 ──────────────────
const galleryVisible = ref(false)
const GROUPS = ['全部', '单据', '标签', '小票']
const activeGroup = ref('全部')
const selectedId = ref('')

const visibleSamples = computed(() =>
  activeGroup.value === '全部' ? SAMPLES : SAMPLES.filter(s => s.group === activeGroup.value),
)
const countOf = group => (group === '全部' ? SAMPLES.length : SAMPLES.filter(s => s.group === group).length)

// 每次打开：默认选中当前示例（或第一个），避免「确定」按钮空态
watch(galleryVisible, open => {
  if (!open) return
  activeGroup.value = '全部'
  selectedId.value = currentSample.value?.id || SAMPLES[0].id
})

function confirmGallery() {
  const sample = SAMPLES.find(s => s.id === selectedId.value)
  if (sample) applySample(sample)
}

// ────────────────── 自定义字段与数据弹窗 ──────────────────
const customDialogVisible = ref(false)
const fieldsText = ref('')
const dataText = ref('')
const fieldsError = ref('')
const dataError = ref('')

watch(customDialogVisible, open => {
  if (!open) return
  fieldsText.value = JSON.stringify(fields.value, null, 2)
  dataText.value = JSON.stringify(activeData.value, null, 2)
  fieldsError.value = ''
  dataError.value = ''
})

function parseFields() {
  let parsed
  try {
    parsed = JSON.parse(fieldsText.value)
  } catch (err) {
    fieldsError.value = `字段 JSON 解析失败：${err.message}`
    return null
  }
  if (!Array.isArray(parsed)) {
    fieldsError.value = '字段必须是数组，结构为 [ { "fieldKey": "...", "fieldLabel": "..." } ]'
    return null
  }
  const invalidIndex = parsed.findIndex(
    f => !f || typeof f !== 'object' || typeof f.fieldKey !== 'string' || typeof f.fieldLabel !== 'string',
  )
  if (invalidIndex >= 0) {
    fieldsError.value = `fields[${invalidIndex}] 缺少 fieldKey / fieldLabel 字段`
    return null
  }
  return parsed
}

function parseData() {
  let parsed
  try {
    parsed = JSON.parse(dataText.value)
  } catch (err) {
    dataError.value = `数据 JSON 解析失败：${err.message}`
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    dataError.value = '数据必须是对象，结构为 { "fieldKey": 值 }'
    return null
  }
  return parsed
}

function onFormatJson() {
  const parsedFields = parseFields()
  if (parsedFields) {
    fieldsText.value = JSON.stringify(parsedFields, null, 2)
    fieldsError.value = ''
  }
  const parsedData = parseData()
  if (parsedData) {
    dataText.value = JSON.stringify(parsedData, null, 2)
    dataError.value = ''
  }
}

function onApplyCustom() {
  const nextFields = parseFields()
  const nextData = parseData()
  if (!nextFields || !nextData) return
  fields.value = nextFields
  activeData.value = nextData
  customDataActive.value = true
  customDialogVisible.value = false
  syncDesigner()
}

// ────────────────── 链路二 / 三：打印输出弹窗 ──────────────────
const printDialogVisible = ref(false)

const renderStatus = ref('checking')
const renderStatusText = ref('渲染服务检测中…')
const renderStatusTitle = ref('探测 render 微服务 /render-api/health')
const rendering = ref(false)
const renderError = ref('')

async function refreshRenderStatus() {
  renderStatus.value = 'checking'
  renderStatusText.value = '渲染服务检测中…'
  const health = await checkRenderHealth()
  if (!health) {
    renderStatus.value = 'offline'
    renderStatusText.value = '渲染服务离线'
    renderStatusTitle.value = '请启动 services/print-render'
    return
  }
  renderStatus.value = 'online'
  renderStatusText.value = '渲染服务在线'
  renderStatusTitle.value = `活跃 ${health.activeRenders} / 并发 ${health.maxConcurrent} · 队列 ${health.queueLength}`
}

let renderErrorTimer
function showRenderError(message) {
  renderError.value = message
  clearTimeout(renderErrorTimer)
  renderErrorTimer = setTimeout(() => (renderError.value = ''), 5000)
}

/** 取画布模板 JSON（自定义元素方法返回字符串） */
function currentTemplateJson() {
  return JSON.parse(designerRef.value.getTemplateJson())
}

async function onServerPdf() {
  if (rendering.value) return
  let templateJson
  try {
    templateJson = currentTemplateJson()
  } catch {
    showRenderError('模板 JSON 解析失败')
    return
  }
  rendering.value = true
  renderError.value = ''
  try {
    const pdf = await requestServerPdf(templateJson, printData.value, BASE_URL)
    openPdfBlob(pdf, `print-${Date.now()}.pdf`)
    await refreshRenderStatus()
  } catch (err) {
    showRenderError(`PDF 生成失败：${err.message}`)
    await refreshRenderStatus()
  } finally {
    rendering.value = false
  }
}

const client = new PrintClient({ timeoutMs: 20000 })
const clientStatus = ref('checking')
const clientStatusText = ref('检测打印客户端…')
const clientPrinters = ref([])
const selectedPrinter = ref('')
const clientPrinting = ref(false)
const clientMessage = ref('')
const clientMessageKind = ref('')
let clientMsgTimer
let clientStatusRegistered = false

function showClientMessage(message, kind = 'success') {
  clientMessage.value = message
  clientMessageKind.value = kind
  clearTimeout(clientMsgTimer)
  clientMsgTimer = setTimeout(() => {
    clientMessage.value = ''
    clientMessageKind.value = ''
  }, 5000)
}

async function refreshClientPrinters() {
  try {
    clientPrinters.value = await client.listPrinters()
  } catch {
    clientPrinters.value = []
  }
}

async function connectPrintClient() {
  clientStatus.value = 'checking'
  clientStatusText.value = '检测打印客户端…'
  if (!clientStatusRegistered) {
    clientStatusRegistered = true
    client.onStatusChange(status => {
      if (status === 'connected') {
        clientStatus.value = 'online'
        clientStatusText.value = '打印客户端在线'
        refreshClientPrinters()
      } else if (status === 'disconnected') {
        clientStatus.value = 'offline'
        clientStatusText.value = '打印客户端离线'
      }
    })
  }
  try {
    await client.connect()
    clientStatus.value = 'online'
    clientStatusText.value = '打印客户端在线'
    await refreshClientPrinters()
  } catch {
    clientStatus.value = 'offline'
    clientStatusText.value = '打印客户端离线'
  }
}

// 懒初始化：首次打开弹窗时探测一次，之后仅保留状态（与 demo 同口径）
watch(printDialogVisible, open => {
  if (!open) return
  refreshRenderStatus()
  connectPrintClient()
})

/** 静默打印：本页两遍渲染出最终 HTML，直送本机客户端（WebSocket 127.0.0.1:17521） */
async function onClientPrint() {
  if (clientPrinting.value) return
  let templateJson
  try {
    templateJson = currentTemplateJson()
  } catch {
    showClientMessage('模板 JSON 解析失败', 'error')
    return
  }
  clientPrinting.value = true
  clientMessage.value = ''
  clientMessageKind.value = ''
  try {
    const rendered = await renderInBrowser(templateJson, printData.value, BASE_URL)
    const res = await client.printHtml(rendered, {
      printerName: selectedPrinter.value || undefined,
    }, currentSample.value?.name ?? '打印模板')
    showClientMessage(`已提交静默打印，作业 ${res.jobId.slice(0, 8)}（${rendered.pageCount ?? 1} 页）`)
  } catch (err) {
    const code = err instanceof WormPrintError ? `[${err.code}] ` : ''
    showClientMessage(`静默打印失败：${code}${err.message}`, 'error')
  } finally {
    clientPrinting.value = false
  }
}

onMounted(() => {
  const el = designerRef.value
  // 上传能力同样是 property（函数无法走 attribute）
  el.uploadImage = uploadImage
  el.uploadDesignBackground = uploadImage
  // 进入页面自动载入第一个示例（与 demo 自动载入综合示例同口径）
  applySample(SAMPLES[0])
  console.log('[demo] 设计器已挂载：registerAll() 在 main.js 调用一次，元素由 isCustomElement 放行')
})

onBeforeUnmount(() => {
  clearTimeout(renderErrorTimer)
  clearTimeout(clientMsgTimer)
  window.removeEventListener('keydown', onPreviewKeydown)
})
</script>


<style src="./styles/demo-ui.css"></style>
