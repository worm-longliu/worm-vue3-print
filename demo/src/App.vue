<template>
  <div class="demo-app">
    <header class="demo-topbar">
      <span class="demo-project">worm-vue3-print</span>
      <span class="demo-logo">打印模板设计器 Demo</span>
      <span class="demo-badge">模板 ID：{{ TEMPLATE_ID }}</span>
      <span class="demo-badge">业务类型：采购收货单（purchase_receipt）</span>
      <span class="demo-note">加载真实模板数据 · 支持浏览器端免保存预览 / 打印</span>
    </header>

    <main class="demo-container">
      <PrintDesigner
        ref="designerRef"
        :initial-template="templateData"
        :fields="fields"
        :is-edit="true"
        :load-default-template="loadDefaultTemplate"
        :show-help="true" 
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
            :base-url="'http://localhost:10103'"
            @rendered="(n: number) => previewPages = n"
          />
        </div>
      </div>
    </Teleport>
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
import rawTemplate from './template-purchase-receipt.json'
import {
  TEMPLATE_ID,
  PURCHASE_RECEIPT_FIELDS,
} from './business'

// 真实模板数据（模板 106977040967000141 的 elements 已存在本地 JSON）
const templateData = ref<TemplateData>(rawTemplate as TemplateData)
const fields = ref<PrintBusinessField[]>(PURCHASE_RECEIPT_FIELDS)

const designerRef = ref<InstanceType<typeof PrintDesigner> | null>(null)

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

/** 加载默认布局：宿主在此实现自己的业务逻辑（如按业务类型拉取默认模板）；demo 返回空白默认模板 */
function loadDefaultTemplate() {
  return createDefaultTemplate()
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
  margin-left: auto;
  color: #8b909c;
  font-size: 12px;
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