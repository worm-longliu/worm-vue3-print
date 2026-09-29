<script>
// Vue 2.7 宿主集成 @worm-vue3-print/common 的完整链路示例（Options API 单文件组件）。
// 版式与 ./demo（Vue 3 设计器示例）完全一致：样式由 sync-demo-styles.mjs 从 demo 逐字抽取生成，
// 本文件不写任何私有样式；事件不走侧栏面板，而是与 demo 同口径写控制台 + 下载 + alert。
import { createDefaultTemplate } from '@worm-vue3-print/common'
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { SAMPLES } from './templates'
import SampleThumb from './SampleThumb.vue'
import { checkRenderHealth, openPdfBlob, requestServerPdf } from './render-client'
import { renderInBrowser, writeHtmlToFrame } from './browser-render'

/** 宿主基址：模板里的相对路径图片按它拼接 */
const BASE_URL = window.location.origin

/**
 * 当前示例的批量数据：示例自带 batchData 时优先使用（一枚一条的标签场景），
 * 否则由当前单份数据派生，避免自定义数据与批量内容脱节。
 * Vue 2 会把 data 里的对象深度响应式化，structuredClone 对 Proxy 会抛 DataCloneError，
 * 因此深拷贝统一用 JSON.parse(JSON.stringify(...))。
 */
function deriveBatchData(base) {
  return Array.from({ length: 3 }, (_, i) => {
    const data = JSON.parse(JSON.stringify(base))
    if (data.order && typeof data.order.no === 'string') {
      data.order = { ...data.order, no: `${data.order.no}-B${String(i + 1).padStart(2, '0')}` }
    }
    return data
  })
}

/** iframe 由 v-if 控制，需等下一帧再取节点写入内容 */
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

export default {
  name: 'App',
  components: { SampleThumb },
  data() {
    return {
      samples: SAMPLES,
      groups: ['全部', '单据', '标签', '小票'],
      // 设计器数据源
      fields: [],
      templateData: createDefaultTemplate(),
      activeData: {},
      currentSample: null,
      customDataActive: false,
      batchEnabled: false,
      // 顶栏隐藏文件输入
      // （通过 ref="fileInput" 访问，无需放进 data）
      // 全屏预览
      previewVisible: false,
      previewPages: 0,
      previewLoading: false,
      previewError: '',
      // 示例库弹窗
      galleryVisible: false,
      activeGroup: '全部',
      selectedId: '',
      // 自定义字段与数据弹窗
      customDialogVisible: false,
      fieldsText: '',
      dataText: '',
      fieldsError: '',
      dataError: '',
      // 打印输出弹窗：服务端 PDF
      printDialogVisible: false,
      renderStatus: 'checking',
      renderStatusText: '渲染服务检测中…',
      renderStatusTitle: '探测 render 微服务 /render-api/health',
      rendering: false,
      renderError: '',
      // 打印输出弹窗：客户端静默打印
      clientStatus: 'checking',
      clientStatusText: '检测打印客户端…',
      clientPrinters: [],
      selectedPrinter: '',
      clientPrinting: false,
      clientMessage: '',
      clientMessageKind: '',
    }
  },
  computed: {
    /**
     * 当前示例的批量数据：优先示例自带 batchData（未启用自定义数据时），否则由当前单份数据派生。
     */
    batchDataList() {
      if (!this.customDataActive && this.currentSample && this.currentSample.batchData) {
        return this.currentSample.batchData
      }
      return deriveBatchData(this.activeData)
    },
    /** 当前生效的打印数据：对象=单份，数组=批量，三条链路共用同一数据源 */
    printData() {
      return this.batchEnabled ? this.batchDataList : this.activeData
    },
    visibleSamples() {
      return this.activeGroup === '全部'
        ? this.samples
        : this.samples.filter(s => s.group === this.activeGroup)
    },
  },
  watch: {
    // 全屏预览没有可点击的遮罩空白区，改用 Esc 关闭：打开时绑定、关闭时解绑
    previewVisible(visible) {
      if (visible) window.addEventListener('keydown', this.onPreviewKeydown)
      else window.removeEventListener('keydown', this.onPreviewKeydown)
    },
    // 每次打开示例库：默认选中当前示例（或第一个），避免「确定」按钮空态
    galleryVisible(open) {
      if (!open) return
      this.activeGroup = '全部'
      this.selectedId = (this.currentSample && this.currentSample.id) || SAMPLES[0].id
    },
    customDialogVisible(open) {
      if (!open) return
      this.fieldsText = JSON.stringify(this.fields, null, 2)
      this.dataText = JSON.stringify(this.activeData, null, 2)
      this.fieldsError = ''
      this.dataError = ''
    },
    // 懒初始化：首次打开弹窗时探测一次，之后仅保留状态（与 demo 同口径）
    printDialogVisible(open) {
      if (!open) return
      this.refreshRenderStatus()
      this.connectPrintClient()
    },
  },
  created() {
    // 打印客户端实例无需响应式化，挂在实例普通属性上
    this.client = new PrintClient({ timeoutMs: 20000 })
    this.renderErrorTimer = null
    this.clientMsgTimer = null
    this.clientStatusRegistered = false
  },
  beforeDestroy() {
    clearTimeout(this.renderErrorTimer)
    clearTimeout(this.clientMsgTimer)
    window.removeEventListener('keydown', this.onPreviewKeydown)
  },
  methods: {
    // ────────────────── 设计器：属性注入与宿主回调 ──────────────────
    // <print-designer> 是原生自定义元素：`:fields="..."` 这类绑定会走 setAttribute，
    // 对象被字符串化成 "[object Object]"，所以对象/函数入参必须赋 property；
    // 只有字符串开关（is-edit、show-help）可以写在模板属性上。
    // fields 只有 setter（读回看 el.store.fields），故日志按宿主自身持有的数据计数。
    syncDesigner() {
      const el = this.$refs.designer
      if (!el) return
      el.fields = this.fields
      el.template = this.templateData
      console.log(`[demo] 注入 fields(${this.fields.length} 个字段) 与 template(${this.templateData.paperSize})`)
    },
    /** 图片上传回调：设计器「插入图片」时调用，宿主返回可访问地址即可（demo 用 Data URL 模拟上传接口） */
    uploadImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('图片读取失败'))
        reader.readAsDataURL(file)
      })
    },
    /** 载入示例：模板与数据深拷贝后回写（重复选同一示例也能触发重载），字段树与打印数据同步切换 */
    applySample(sample) {
      this.templateData = JSON.parse(JSON.stringify(sample.template))
      this.fields = [...sample.fields]
      this.activeData = JSON.parse(JSON.stringify(sample.data))
      this.currentSample = sample
      this.customDataActive = false
      this.galleryVisible = false
      this.syncDesigner()
    },
    // ────────────────── 设计器事件（CustomEvent，载荷在 event.detail） ──────────────────
    /** 宿主侧拼版校验：getTemplateJson() 是绕过保存按钮的旁路，消费它的链路需自己拦截非法拼版 */
    assertTilingValid() {
      const issues = (this.$refs.designer && this.$refs.designer.validateTemplate()) || []
      if (issues.length) {
        alert(issues[0].message)
        return false
      }
      return true
    },
    downloadTemplateFile(json, name) {
      const blob = new Blob([JSON.stringify(JSON.parse(json), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    },
    /** @save：设计器保存按钮触发，宿主在此持久化。demo 仅下载 JSON 并打印到控制台 */
    onSave(event) {
      if (!this.assertTilingValid()) return
      this.downloadTemplateFile(event.detail, `template-${Date.now()}.json`)
      console.log('[demo] @save 保存模板：', JSON.parse(event.detail))
    },
    /** @preview：设计器预览按钮触发，detail 已带模板 JSON，直接渲染免保存预览 */
    onPreview(event) {
      console.log('[demo] @preview 触发')
      this.openPreview(JSON.parse(event.detail))
    },
    onHelp() {
      console.log('[demo] @help 触发：设计器自带帮助弹窗，宿主可据此埋点')
    },
    onDblclickElement(event) {
      console.log('[demo] @dblclick-element 触发：', JSON.parse(event.detail))
    },
    // ────────────────── 顶栏：模板导入 / 导出 / 清空 ──────────────────
    onExportTemplate() {
      if (!this.assertTilingValid()) return
      const json = this.$refs.designer.getTemplateJson()
      if (!json) return
      this.downloadTemplateFile(json, `template-${Date.now()}.json`)
    },
    /** 轻量结构校验：接受单页模板，或多页面 wrapper（{ pages: [...] }，每页为完整单页模板） */
    isSingleTemplateLike(t) {
      return typeof t.paperSize === 'string'
        && !!t.margins && typeof t.margins === 'object'
        && Array.isArray(t.elements)
    },
    isTemplateLike(data) {
      if (!data || typeof data !== 'object') return false
      if (this.isSingleTemplateLike(data)) return true
      return Array.isArray(data.pages) && data.pages.length > 0
        && data.pages.every(p => p && typeof p === 'object' && this.isSingleTemplateLike(p))
    },
    onImportTemplate(event) {
      const input = event.target
      const file = input.files && input.files[0]
      input.value = ''
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result))
          if (!this.isTemplateLike(data)) {
            alert('模板文件结构不合法：缺少 paperSize / margins / elements 等关键字段')
            return
          }
          this.templateData = data
          this.currentSample = null
          this.syncDesigner()
        } catch {
          alert('模板文件读取失败，请确认是有效的 JSON 文件')
        }
      }
      reader.onerror = () => alert('模板文件读取失败')
      reader.readAsText(file)
    },
    /** 清空：恢复空白模板（字段树与打印数据保留，便于继续拖字段） */
    onClearTemplate() {
      if (!confirm('将清空当前画布模板，是否继续？')) return
      this.templateData = createDefaultTemplate()
      this.currentSample = null
      this.syncDesigner()
    },
    // ────────────────── 链路一：浏览器渲染预览 + 浏览器打印 ──────────────────
    async openPreview(templateJson) {
      this.previewPages = 0
      this.previewError = ''
      this.previewLoading = true
      this.previewVisible = true
      try {
        const rendered = await renderInBrowser(templateJson, this.printData, BASE_URL)
        // iframe 由 v-if 控制：先等 Vue 打完这条 patch，再等浏览器出这一帧，节点才真正可取
        await this.$nextTick()
        await nextFrame()
        writeHtmlToFrame(this.$refs.previewFrame, rendered.html)
        this.previewPages = rendered.pageCount
      } catch (error) {
        this.previewError = `渲染失败：${error.message}`
      } finally {
        this.previewLoading = false
      }
    },
    printPreview() {
      const frame = this.$refs.previewFrame
      if (frame && frame.contentWindow) frame.contentWindow.print()
    },
    onPreviewKeydown(event) {
      if (event.key === 'Escape') this.previewVisible = false
    },
    // ────────────────── 示例模板库弹窗 ──────────────────
    countOf(group) {
      return group === '全部'
        ? this.samples.length
        : this.samples.filter(s => s.group === group).length
    },
    confirmGallery() {
      const sample = this.samples.find(s => s.id === this.selectedId)
      if (sample) this.applySample(sample)
    },
    // ────────────────── 自定义字段与数据弹窗 ──────────────────
    parseFields() {
      let parsed
      try {
        parsed = JSON.parse(this.fieldsText)
      } catch (err) {
        this.fieldsError = `字段 JSON 解析失败：${err.message}`
        return null
      }
      if (!Array.isArray(parsed)) {
        this.fieldsError = '字段必须是数组，结构为 [ { "fieldKey": "...", "fieldLabel": "..." } ]'
        return null
      }
      const invalidIndex = parsed.findIndex(
        f => !f || typeof f !== 'object' || typeof f.fieldKey !== 'string' || typeof f.fieldLabel !== 'string',
      )
      if (invalidIndex >= 0) {
        this.fieldsError = `fields[${invalidIndex}] 缺少 fieldKey / fieldLabel 字段`
        return null
      }
      return parsed
    },
    parseData() {
      let parsed
      try {
        parsed = JSON.parse(this.dataText)
      } catch (err) {
        this.dataError = `数据 JSON 解析失败：${err.message}`
        return null
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.dataError = '数据必须是对象，结构为 { "fieldKey": 值 }'
        return null
      }
      return parsed
    },
    onFormatJson() {
      const parsedFields = this.parseFields()
      if (parsedFields) {
        this.fieldsText = JSON.stringify(parsedFields, null, 2)
        this.fieldsError = ''
      }
      const parsedData = this.parseData()
      if (parsedData) {
        this.dataText = JSON.stringify(parsedData, null, 2)
        this.dataError = ''
      }
    },
    onApplyCustom() {
      const nextFields = this.parseFields()
      const nextData = this.parseData()
      if (!nextFields || !nextData) return
      this.fields = nextFields
      this.activeData = nextData
      this.customDataActive = true
      this.customDialogVisible = false
      this.syncDesigner()
    },
    // ────────────────── 链路二 / 三：打印输出弹窗 ──────────────────
    async refreshRenderStatus() {
      this.renderStatus = 'checking'
      this.renderStatusText = '渲染服务检测中…'
      const health = await checkRenderHealth()
      if (!health) {
        this.renderStatus = 'offline'
        this.renderStatusText = '渲染服务离线'
        this.renderStatusTitle = '请启动 services/print-render'
        return
      }
      this.renderStatus = 'online'
      this.renderStatusText = '渲染服务在线'
      this.renderStatusTitle = `活跃 ${health.activeRenders} / 并发 ${health.maxConcurrent} · 队列 ${health.queueLength}`
    },
    showRenderError(message) {
      this.renderError = message
      clearTimeout(this.renderErrorTimer)
      this.renderErrorTimer = setTimeout(() => { this.renderError = '' }, 5000)
    },
    /** 取画布模板 JSON（自定义元素方法返回字符串） */
    currentTemplateJson() {
      return JSON.parse(this.$refs.designer.getTemplateJson())
    },
    async onServerPdf() {
      if (this.rendering) return
      let templateJson
      try {
        templateJson = this.currentTemplateJson()
      } catch {
        this.showRenderError('模板 JSON 解析失败')
        return
      }
      this.rendering = true
      this.renderError = ''
      try {
        const pdf = await requestServerPdf(templateJson, this.printData, BASE_URL)
        openPdfBlob(pdf, `print-${Date.now()}.pdf`)
        await this.refreshRenderStatus()
      } catch (err) {
        this.showRenderError(`PDF 生成失败：${err.message}`)
        await this.refreshRenderStatus()
      } finally {
        this.rendering = false
      }
    },
    showClientMessage(message, kind = 'success') {
      this.clientMessage = message
      this.clientMessageKind = kind
      clearTimeout(this.clientMsgTimer)
      this.clientMsgTimer = setTimeout(() => {
        this.clientMessage = ''
        this.clientMessageKind = ''
      }, 5000)
    },
    async refreshClientPrinters() {
      try {
        this.clientPrinters = await this.client.listPrinters()
      } catch {
        this.clientPrinters = []
      }
    },
    async connectPrintClient() {
      this.clientStatus = 'checking'
      this.clientStatusText = '检测打印客户端…'
      if (!this.clientStatusRegistered) {
        this.clientStatusRegistered = true
        this.client.onStatusChange(status => {
          if (status === 'connected') {
            this.clientStatus = 'online'
            this.clientStatusText = '打印客户端在线'
            this.refreshClientPrinters()
          } else if (status === 'disconnected') {
            this.clientStatus = 'offline'
            this.clientStatusText = '打印客户端离线'
          }
        })
      }
      try {
        await this.client.connect()
        this.clientStatus = 'online'
        this.clientStatusText = '打印客户端在线'
        await this.refreshClientPrinters()
      } catch {
        this.clientStatus = 'offline'
        this.clientStatusText = '打印客户端离线'
      }
    },
    /** 静默打印：本页两遍渲染出最终 HTML，直送本机客户端（WebSocket 127.0.0.1:17521） */
    async onClientPrint() {
      if (this.clientPrinting) return
      let templateJson
      try {
        templateJson = this.currentTemplateJson()
      } catch {
        this.showClientMessage('模板 JSON 解析失败', 'error')
        return
      }
      this.clientPrinting = true
      this.clientMessage = ''
      this.clientMessageKind = ''
      try {
        const rendered = await renderInBrowser(templateJson, this.printData, BASE_URL)
        const res = await this.client.printHtml(rendered, {
          printerName: this.selectedPrinter || undefined,
        }, (this.currentSample && this.currentSample.name) || '打印模板')
        this.showClientMessage(`已提交静默打印，作业 ${res.jobId.slice(0, 8)}（${rendered.pageCount || 1} 页）`)
      } catch (err) {
        const code = err instanceof WormPrintError ? `[${err.code}] ` : ''
        this.showClientMessage(`静默打印失败：${code}${err.message}`, 'error')
      } finally {
        this.clientPrinting = false
      }
    },
  },
  mounted() {
    const el = this.$refs.designer
    // 上传能力同样是 property（函数无法走 attribute）
    el.uploadImage = this.uploadImage
    el.uploadDesignBackground = this.uploadImage
    // 进入页面自动载入第一个示例（与 demo 自动载入综合示例同口径）
    this.applySample(SAMPLES[0])
    console.log('[demo] 设计器已挂载：registerAll() 与 Vue.config.ignoredElements 在 main.js 处理')
  }
}
</script>

<template>
  <div class="demo-app">
    <header class="demo-topbar">
      <span class="demo-project">worm-vue3-print</span>
      <span class="demo-logo">打印模板设计器 Demo</span>
      <span class="demo-badge">业务类型：{{ currentSample ? currentSample.name : '空白模板' }}</span>
      <span class="demo-badge">宿主：Vue 2 + Web Component</span>
      <button type="button" class="demo-print-btn" @click="customDialogVisible = true">自定义字段与数据</button>
      <button type="button" class="demo-print-btn" @click="galleryVisible = true">加载示例</button>
      <button type="button" class="demo-print-btn" @click="onExportTemplate">导出模板</button>
      <button type="button" class="demo-print-btn" @click="$refs.fileInput.click()">导入模板</button>
      <button type="button" class="demo-print-btn" @click="onClearTemplate">清空</button>
      <label class="demo-batch-switch" :class="{ on: batchEnabled }" :title="'开启后浏览器预览/打印、客户端静默打印、服务端 PDF 均传入 ' + batchDataList.length + ' 份数据数组，由打印插件合并为一个作业'">
        <input v-model="batchEnabled" type="checkbox" />
        <span>批量打印（{{ batchDataList.length }} 份）</span>
      </label>
      <button type="button" class="demo-print-btn" @click="printDialogVisible = true">打印输出</button>
      <input ref="fileInput" type="file" accept="application/json,.json" class="demo-file-input" @change="onImportTemplate($event)" />
    </header>

    <main class="demo-container">
      <!-- 自定义元素：字符串开关走 attribute，对象/函数入参走 property（见 script 注释）；事件为 CustomEvent，载荷在 event.detail -->
      <print-designer
        ref="designer"
        is-edit="true"
        show-help="true"
        @save="onSave"
        @preview="onPreview"
        @help="onHelp"
        @dblclick-element="onDblclickElement"
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
          <iframe ref="previewFrame" class="print-html-preview-iframe" title="打印预览" />
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
          <span class="gallery-subtitle">{{ samples.length }} 个示例 · 全部使用静态数据</span>
          <button type="button" class="gallery-close" @click="galleryVisible = false">×</button>
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
            :class="{ selected: selectedId === s.id, current: s.id === (currentSample && currentSample.id) }"
            @click="selectedId = s.id"
            @dblclick="confirmGallery"
          >
            <SampleThumb :template="s.template" :data="s.data" />
            <div class="sample-meta">
              <div class="sample-name">
                {{ s.name }}
                <span v-if="currentSample && s.id === currentSample.id" class="sample-flag">当前</span>
                <span v-if="s.template.tiling && s.template.tiling.enabled" class="sample-flag tiling">拼版</span>
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

<!-- 不加 scoped：demo 样式是各组件 scoped 抽取成一份全局 CSS，.thumb-* 属于子组件 SampleThumb，
     scoped 会加 data 属性命不中子节点，故全局引入。 -->
<style src="./styles/demo-ui.css"></style>
