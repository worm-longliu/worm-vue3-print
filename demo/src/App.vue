<template>
  <div class="demo-app">
    <header class="demo-topbar">
      <span class="demo-project">worm-vue3-print</span>
      <span class="demo-logo">打印模板设计器 Demo</span>
      <span class="demo-badge">模板 ID：{{ TEMPLATE_ID }}</span>
      <span class="demo-badge">业务类型：采购收货单（purchase_receipt）</span>
      <span class="demo-note">加载真实模板数据 · 浏览器端免保存预览</span>
      <button type="button" class="demo-print-btn" @click="onLoadDefaultLayout">加载默认布局</button>
      <button type="button" class="demo-print-btn" @click="printDialogVisible = true">打印输出</button>
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
        @preview="onPreview"
        @save="onSave"
      />
    </main>

    <!-- 浏览器端免保存预览弹层 -->
    <Teleport to="body">
      <div v-if="previewVisible" class="preview-mask" @click.self="previewVisible = false">
        <div class="preview-panel">
          <div class="preview-head">
            <span class="preview-title">打印预览</span>
            <span class="preview-subtitle" v-if="previewPages > 0">共 {{ previewPages }} 页</span>
            <div class="preview-actions">
              <button type="button" class="preview-btn" @click="printPreview">打印</button>
              <button type="button" class="preview-btn ghost" @click="previewVisible = false">关闭</button>
            </div>
          </div>
          <PrintHtmlPreview
            ref="htmlPreviewRef"
            :template-json="previewTemplateJson"
            :print-data="DEFAULT_DEMO_DATA"
            :base-url="RENDER_BASE_URL"
            @rendered="(n: number) => previewPages = n"
          />
        </div>
      </div>
    </Teleport>

    <!-- 打印输出弹窗（服务端 PDF / 客户端静默打印） -->
    <PrintOutputDialog
      :open="printDialogVisible"
      :base-url="RENDER_BASE_URL"
      :template-name="TEMPLATE_NAME"
      :get-template-json="() => (designerRef?.getTemplateJson() as unknown as Record<string, unknown>)"
      @close="printDialogVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  PrintDesigner,
  PrintHtmlPreview,
  DEFAULT_DEMO_DATA,
  createDefaultTemplate,
} from '@worm-vue3-print/canvas'
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import PrintOutputDialog from './components/PrintOutputDialog.vue'
import rawTemplate from './template-purchase-receipt.json'
import {
  TEMPLATE_ID,
  TEMPLATE_NAME,
  PURCHASE_RECEIPT_FIELDS,
} from './business'

/** 相对路径图片（/docfiles/...）拼接基址：浏览器预览与服务端渲染保持一致 */
const RENDER_BASE_URL = 'http://localhost:10103'

/** 打印输出弹窗开关 */
const printDialogVisible = ref(false)

// 页面默认空白；真实模板数据（模板 106977040967000141 的 elements 已存在本地 JSON）在点击「加载默认布局」时载入
const templateData = ref<TemplateData>(createDefaultTemplate())
const fields = ref<PrintBusinessField[]>(PURCHASE_RECEIPT_FIELDS)

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

/**
 * 保存：宿主在此将 JSON 持久化。
 * demo 仅做控制台输出并下载 JSON 文件，方便对照模板数据。
 */
function onSave(json: string) {
  const blob = new Blob([JSON.stringify(JSON.parse(json), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `template-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
  console.log('[demo] 保存模板：', JSON.parse(json))
}

// ── 浏览器端免保存预览：直接用当前画布 JSON + demo 数据，无网络请求 ──
const previewVisible = ref(false)
const previewPages = ref(0)
const previewTemplateJson = ref<Record<string, any> | null>(null)
const htmlPreviewRef = ref<InstanceType<typeof PrintHtmlPreview> | null>(null)

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

/**
 * 加载默认布局：宿主自实现的业务能力——demo 载入本地的采购收货单真实模板数据。
 * 真实宿主可在此按业务类型拉取服务端默认模板；用新对象回写 `initialTemplate` 引用，
 * 设计器监听到变化后重载画布并记录一次历史（撤销可回退）。
 */
function onLoadDefaultLayout() {
  if (!confirm('将覆盖当前画布内容，是否继续？')) return
  templateData.value = rawTemplate as TemplateData
}
</script>

<style>
/* 设计器内部控件基于原生样式，需全局引入一次 */
@import '@worm-vue3-print/canvas/native-controls.css';

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
  margin-left: auto;
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
.demo-container {
  flex: 1;
  min-height: 0;
}

/* ── 预览弹层 ── */
.preview-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 60, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.preview-panel {
  width: min(920px, 92vw);
  height: min(820px, 92vh);
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 26px 60px rgba(23, 32, 60, 0.28);
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
