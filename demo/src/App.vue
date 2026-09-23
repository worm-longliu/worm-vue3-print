<template>
  <div class="demo-app">
    <header class="demo-topbar">
      <span class="demo-project">worm-vue3-print</span>
      <span class="demo-logo">打印模板设计器 Demo</span>
      <span class="demo-badge">模板 ID：{{ TEMPLATE_ID }}</span>
      <span class="demo-badge">业务类型：{{ currentSample ? currentSample.name : '空白模板' }}</span>
      <button type="button" class="demo-print-btn" @click="customDialogVisible = true">自定义字段与数据</button>
      <button type="button" class="demo-print-btn" @click="onLoadSample">加载示例</button>
      <button type="button" class="demo-print-btn" @click="onExportTemplate">导出模板</button>
      <button type="button" class="demo-print-btn" @click="fileInputRef?.click()">导入模板</button>
      <button type="button" class="demo-print-btn" @click="onClearTemplate">清空</button>
      <label class="demo-batch-switch" :class="{ on: batchEnabled }" title="开启后浏览器预览/打印、客户端静默打印、服务端 PDF 均传入 3 份数据数组，由打印插件合并为一个作业">
        <input v-model="batchEnabled" type="checkbox" />
        <span>批量打印（{{ batchDataList.length }} 份）</span>
      </label>
      <button type="button" class="demo-print-btn" @click="printDialogVisible = true">打印输出</button>
      <input ref="fileInputRef" type="file" accept="application/json,.json" class="demo-file-input" @change="onImportTemplate($event)" />
    </header>

    <main class="demo-container">
      <PrintDesigner
        ref="designerRef"
        :initial-template="templateData"
        :fields="fields"
        :is-edit="true"
        :show-help="true"
        :upload-image="uploadDemoImage"
        :upload-design-background="uploadDemoImage"
        :fonts="DESIGNER_FONTS"
        @preview="onPreview"
        @save="onSave"
      />
    </main>

    <!-- 设计器预览：由设计器自带「预览」触发，仅演示控件原生单份预览，不承载批量能力 -->
    <Teleport to="body">
      <div v-if="previewVisible" class="preview-mask">
        <div class="preview-panel">
          <div class="preview-head">
            <span class="preview-title">打印预览</span>
            <span class="preview-subtitle" v-if="previewPages > 0">{{ previewPages }} 页</span>
            <div class="preview-actions">
              <button type="button" class="preview-btn" @click="printPreview">打印</button>
              <button type="button" class="preview-btn ghost" @click="previewVisible = false">关闭</button>
            </div>
          </div>
          <PrintHtmlPreview
            ref="htmlPreviewRef"
            class="preview-body"
            :template-json="previewTemplateJson"
            :print-data="activePrintData"
            :base-url="RENDER_BASE_URL"
            @rendered="(n: number) => (previewPages = n)"
          />
        </div>
      </div>
    </Teleport>

    <!-- 打印输出弹窗（服务端 PDF / 客户端静默打印）：printData 随批量开关在对象/数组间切换 -->
    <PrintOutputDialog
      :open="printDialogVisible"
      :base-url="RENDER_BASE_URL"
      :font-base-url="FONT_BASE_URL"
      :template-name="currentSample ? currentSample.name : TEMPLATE_NAME"
      :print-data="activePrintData"
      :get-template-json="() => (designerRef?.getTemplateJson() as unknown as Record<string, unknown>)"
      @close="printDialogVisible = false"
    />

    <!-- 示例模板库：点击「加载示例」唤出，选中后覆盖当前画布 -->
    <TemplateGalleryDialog
      :open="galleryVisible"
      :current-id="currentSample?.id"
      @select="applySample"
      @close="galleryVisible = false"
    />

    <!-- 自定义字段与数据：直接粘贴 JSON，调整后即时生效，便于验证打印效果 -->
    <CustomDataDialog
      :open="customDialogVisible"
      :fields="fields"
      :data="activeSampleData"
      @apply="onApplyCustomData"
      @close="customDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted } from 'vue'
import {
  PrintDesigner,
  PrintHtmlPreview,
  DEFAULT_DEMO_DATA,
  createDefaultTemplate,
} from '@worm-vue3-print/canvas'
import type { PrintBusinessField, TemplateData, MultiPageTemplateData } from '@worm-vue3-print/canvas'
import type { PrintFontDeclaration } from '@worm-vue3-print/core'
import PrintOutputDialog from './components/PrintOutputDialog.vue'
import TemplateGalleryDialog from './components/TemplateGalleryDialog.vue'
import CustomDataDialog from './components/CustomDataDialog.vue'
import type { SampleTemplate } from './samples'
import { COMPREHENSIVE_SHOWCASE_SAMPLE } from './samples/comprehensive-showcase'
import {
  TEMPLATE_ID,
  TEMPLATE_NAME,
  PURCHASE_RECEIPT_FIELDS,
} from './business'
import { deriveBatchData } from './batch-data'

/** 相对路径图片（/docfiles/...）拼接基址：浏览器预览与打印保持一致，默认取当前站点 origin */
const RENDER_BASE_URL = (import.meta.env.VITE_RENDER_BASE_URL as string | undefined) || window.location.origin

/**
 * 相对路径字体基址：demo 的字体挂在 Vite 站点（public/fonts），与图片域（RENDER_BASE_URL）不同。
 * 出图端必须能访问该地址——render 服务跑在宿主机时站点 origin 即可；
 * 跑在 Docker 里改成 http://host.docker.internal:9303，生产改成字体 CDN 域名。
 */
// 部署到 GitHub Pages 等子路径站点时，字体在 BASE_URL 下而非域名根路径
const FONT_BASE_URL = (import.meta.env.VITE_FONT_BASE_URL as string | undefined) || `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/$/, '')

/** 打印输出弹窗开关 */
const printDialogVisible = ref(false)

// 页面初始为空白模板；挂载后自动载入综合示例模板，点击「加载示例」可从示例库另选
const templateData = ref<TemplateData | MultiPageTemplateData>(createDefaultTemplate())
const fields = ref<PrintBusinessField[]>(PURCHASE_RECEIPT_FIELDS)

/** 示例模板库弹窗开关 */
const galleryVisible = ref(false)

/** 自定义字段与数据弹窗开关 */
const customDialogVisible = ref(false)
/**
 * 当前画布加载的示例（清空/导入后为 null）。
 * 用 shallowRef：静态数据与批量派生都要求拿到原始对象——
 * 深层响应式 Proxy 会让 `structuredClone`（批量派生）抛 DataCloneError。
 */
const currentSample = shallowRef<SampleTemplate | null>(null)
/** 当前生效的静态打印数据：随示例切换，未选示例时为采购收货单 demo 数据 */
const activeSampleData = shallowRef<Record<string, any>>(DEFAULT_DEMO_DATA as unknown as Record<string, any>)

/**
 * 载入示例：模板深拷贝后回写（保证重复选同一示例也能触发设计器重载），
 * 同时切换字段树与静态打印数据，预览/打印即刻看到该示例的真实值。
 */
function applySample(sample: SampleTemplate) {
  templateData.value = JSON.parse(JSON.stringify(sample.template)) as TemplateData
  fields.value = [...sample.fields]
  activeSampleData.value = sample.data
  currentSample.value = sample
  customDataActive.value = false
  galleryVisible.value = false
}

/**
 * 应用自定义字段与数据：字段树与单份打印数据即刻生效。
 * customDataActive 置 true：批量打印不再使用示例自带的 batchData，
 * 改为从用户提交的数据派生，避免批量数据与自定义内容脱节。
 */
const customDataActive = ref(false)
function onApplyCustomData(payload: { fields: PrintBusinessField[]; data: Record<string, any> }) {
  fields.value = [...payload.fields]
  activeSampleData.value = payload.data
  customDataActive.value = true
  customDialogVisible.value = false
}

/**
 * 模板字体声明（宿主配置）：保存时同步写入模板 JSON，服务端与客户端按模板出图。
 * url 以 '/' 开头 → 各端按自己的 baseUrl 解析：浏览器取当前站点（dev 为 9303 端口），
 * render 服务取请求里的 baseUrl（本机联调填 http://host.docker.internal:9303）。
 *
 * 这里用的是三款公开字体（OFL-1.1），字型与宋体/黑体差异极大，一眼就能看出webfont 有没有真正生效：
 * 马善政毛笔楷书 / 站酷快乐体 / 站酷庆科黄油体。文件用 node scripts/fetch-test-fonts.mjs 下载，
 * 换字体只改这份数组（family 与文件名对应），不动库代码。
 */
const DESIGNER_FONTS: PrintFontDeclaration[] = [
  {
    family: 'Ma Shan Zheng',
    label: '马善政毛笔楷书',
    files: [
      { weight: 400, url: `${FONT_BASE_URL}/fonts/MaShanZheng-Regular.ttf` },
    ],
  },
  {
    family: 'ZCOOL KuaiLe',
    label: '站酷快乐体',
    files: [
      { weight: 400, url: `${FONT_BASE_URL}/fonts/ZCOOLKuaiLe-Regular.ttf` },
    ],
  },
  {
    family: 'ZCOOL QingKe HuangYou',
    label: '站酷庆科黄油体',
    files: [
      { weight: 400, url: `${FONT_BASE_URL}/fonts/ZCOOLQingKeHuangYou-Regular.ttf` },
    ],
  },
]

const designerRef = ref<InstanceType<typeof PrintDesigner> | null>(null)

/**
 * demo 没有宿主后端，使用 Data URL 模拟“宿主上传后返回完整图片路径”。
 * 真实项目在这里调用业务上传接口，并 resolve 服务端返回的完整可访问图片地址。
 */
function uploadDemoImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function downloadTemplateFile(json: string, name: string) {
  const blob = new Blob([JSON.stringify(JSON.parse(json), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 保存：宿主在此将 JSON 持久化。
 * demo 仅做控制台输出并下载 JSON 文件，方便对照模板数据。
 */
/**
 * 宿主侧拼版校验：`getTemplateJson()` 是绕过设计器保存按钮的旁路，
 * 在「保存 / 导出」等直接消费它的链路上必须自己调 `validateTemplate()` 拦截非法拼版配置
 * （典型：列数超出目标纸可用宽度）。
 */
function assertTilingValid(): boolean {
  const issues = designerRef.value?.validateTemplate?.() ?? []
  if (issues.length) {
    alert(issues[0]!.message)
    return false
  }
  return true
}

function onSave(json: string) {
  if (!assertTilingValid()) return
  downloadTemplateFile(json, `template-${Date.now()}.json`)
  console.log('[demo] 保存模板：', JSON.parse(json))
}

// ── 模板导入/导出/清空：宿主能力示意（仅浏览器端，不经过服务端） ──
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 导出：下载当前画布 JSON，与 onSave 走同一下载逻辑 */
function onExportTemplate() {
  if (!assertTilingValid()) return
  const json = designerRef.value?.getTemplateJson?.()
  if (!json) return
  downloadTemplateFile(JSON.stringify(json), `template-${Date.now()}.json`)
}

/** 单页模板关键字段校验（paperSize/margins/elements 三要素） */
function isSingleTemplateLike(t: Record<string, unknown>): boolean {
  return typeof t.paperSize === 'string'
    && !!t.margins && typeof t.margins === 'object'
    && Array.isArray(t.elements)
}

/** 轻量结构校验：接受单页模板，或多页面 wrapper（{ pages: [...] }，每页为完整单页模板） */
function isTemplateLike(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object') return false
  const t = data as Record<string, unknown>
  if (isSingleTemplateLike(t)) return true
  const pages = t.pages
  return Array.isArray(pages)
    && pages.length > 0
    && pages.every(p => !!p && typeof p === 'object' && isSingleTemplateLike(p as Record<string, unknown>))
}

/** 导入：读取本地 JSON 文件，校验通过后回写画布 */
function onImportTemplate(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if (!isTemplateLike(data)) {
        alert('模板文件结构不合法：缺少 paperSize / margins / elements 等关键字段（或 pages 页列表内缺少这些字段）')
        return
      }
      templateData.value = data as unknown as TemplateData | MultiPageTemplateData
      currentSample.value = null
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
}

// ── 浏览器端免保存预览：直接用当前画布 JSON + demo 数据，无网络请求 ──
const previewVisible = ref(false)
const previewPages = ref(0)
const previewTemplateJson = ref<Record<string, any> | null>(null)
const htmlPreviewRef = ref<InstanceType<typeof PrintHtmlPreview> | null>(null)

/** 批量打印开关：开启后三条打印链路统一传数组，关闭则传单对象 */
const batchEnabled = ref(false)
/**
 * 批量数据：未应用自定义数据时优先用示例自带的静态批量数据（一枚一条的标签场景），
 * 否则（自定义数据生效或无批量数据）由当前单份数据派生（派生函数内部深拷贝，不污染原数据）。
 */
const batchDataList = computed<Record<string, any>[]>(
  () => !customDataActive.value && currentSample.value?.batchData
    ? currentSample.value.batchData
    : deriveBatchData(activeSampleData.value),
)
/** 当前生效的打印数据：对象=单份，数组=批量，浏览器/客户端/服务端三端共用同一数据源 */
const activePrintData = computed<Record<string, any> | Record<string, any>[]>(() =>
  batchEnabled.value ? batchDataList.value : activeSampleData.value,
)

function onPreview() {
  const json = designerRef.value?.getTemplateJson?.()
  if (!json) return
  previewTemplateJson.value = json as unknown as Record<string, any>
  previewPages.value = 0
  previewVisible.value = true
}

function printPreview() {
  htmlPreviewRef.value?.print()
}

// 全屏预览没有可点击的遮罩空白区，改用 Esc 关闭：打开时绑定、关闭时解绑
function onPreviewKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') previewVisible.value = false
}
watch(previewVisible, visible => {
  if (visible) {
    window.addEventListener('keydown', onPreviewKeydown)
  } else {
    window.removeEventListener('keydown', onPreviewKeydown)
  }
})

/**
 * 加载示例：弹出示例模板库，由用户选择一份（采购收货单 / 称签 / 价签 / 面单 / 小票 …）。
 * 真实宿主可在此按业务类型拉取服务端默认模板；用新对象回写 `initialTemplate` 引用，
 * 设计器监听到变化后重载画布并记录一次历史（撤销可回退）。
 */
function onLoadSample() {
  galleryVisible.value = true
}

// 进入页面自动载入综合示例模板
onMounted(() => {
  applySample(COMPREHENSIVE_SHOWCASE_SAMPLE)
})

</script>

<style>
/* 设计器内部控件基于原生样式，需全局引入一次 */
html,
body,
#app {
  height: 100%;
  margin: 0;
}
</style>

<style scoped>
.demo-app {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.demo-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 16px;
  background: #ffffff;
  border-bottom: 1px solid #e9ecf2;
  font-size: 13px;
  color: #2a2e37;
  flex-shrink: 0;
}
.demo-logo {
  font-weight: 600;
  color: #165dff;
}
.demo-project {
  font-weight: 700;
  color: #2a2e37;
  font-size: 14px;
}
.demo-project::after {
  content: '';
  display: inline-block;
  width: 1px;
  height: 14px;
  margin: 0 4px 0 12px;
  background: #e9ecf2;
  vertical-align: middle;
}
.demo-badge {
  padding: 2px 10px;
  border: 1px solid #d9dde6;
  border-radius: 999px;
  background: #f4f6fa;
  color: #5a667f;
  font-size: 12px;
}
.demo-note {
  color: #8b909c;
  font-size: 12px;
}
.demo-print-btn {
  margin-left: 0;
  padding: 5px 16px;
  border: 1px solid #165dff;
  border-radius: 6px;
  background: #fff;
  color: #165dff;
  font-size: 13px;
  cursor: pointer;
}
.demo-print-btn:hover {
  background: #eef3ff;
}
.demo-topbar > .demo-print-btn:first-of-type {
  margin-left: auto;
}
.demo-batch-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border: 1px solid #d9dde6;
  border-radius: 6px;
  background: #fff;
  color: #5a667f;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.demo-batch-switch input {
  margin: 0;
  cursor: pointer;
  accent-color: #165dff;
}
.demo-batch-switch.on {
  border-color: #165dff;
  background: #eef3ff;
  color: #165dff;
  font-weight: 600;
}
.demo-file-input {
  display: none;
}
.demo-container {
  flex: 1;
  min-height: 0;
}

/* ── 预览弹层（全屏，便于看清整页细节） ── */
.preview-mask {
  position: fixed;
  inset: 0;
  background: #fff;
  z-index: 9999;
}
.preview-panel {
  width: 100vw;
  height: 100vh;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid #e9ecf2;
  flex-shrink: 0;
}
/* PrintHtmlPreview 根节点：占满头部之外的剩余高度，内部 iframe 自行滚动 */
.preview-body {
  flex: 1;
  min-height: 0;
}
.preview-title {
  font-size: 14px;
  font-weight: 600;
  color: #2a2e37;
}
.preview-subtitle {
  font-size: 12px;
  color: #8b909c;
}
.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.preview-btn {
  padding: 5px 16px;
  border: none;
  border-radius: 6px;
  background: #165dff;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.preview-btn.ghost {
  background: #f4f6fa;
  color: #2a2e37;
  border: 1px solid #d9dde6;
}
</style>
