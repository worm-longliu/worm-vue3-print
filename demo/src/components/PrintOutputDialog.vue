<template>
  <Teleport to="body">
    <div v-if="open" class="print-mask" @click.self="emit('close')">
      <div class="print-panel">
        <div class="print-head">
          <span class="print-title">打印输出</span>
          <span class="print-close" @click="emit('close')">×</span>
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
            <button
              type="button"
              class="primary-btn"
              :disabled="rendering || renderStatus !== 'online'"
              @click="onServerPdf"
            >{{ rendering ? '生成中…' : '服务端 PDF' }}</button>
            <p v-if="renderError" class="error-text">{{ renderError }}</p>
          </section>

          <section class="print-card">
            <h3 class="card-title">客户端静默打印</h3>
            <p class="card-desc">连接本机打印客户端（WebSocket 127.0.0.1:17521），将当前模板与 demo 数据静默提交打印。</p>
            <div class="card-row">
              <span class="status" :class="clientStatus" title="本机打印客户端（WebSocket 127.0.0.1:17521）">
                <i class="status-dot"></i>{{ clientStatusText }}
              </span>
              <button type="button" class="text-btn" @click="connectPrintClient">重新检测</button>
            </div>
            <div class="card-actions">
              <select
                v-model="selectedPrinter"
                class="printer-select"
                :disabled="clientStatus !== 'online' || clientPrinting"
                title="选择目标打印机（留空为系统默认）"
              >
                <option value="">系统默认打印机</option>
                <option v-for="p in clientPrinters" :key="p.name" :value="p.name">
                  {{ p.name }}{{ p.isDefault ? '（默认）' : '' }}
                </option>
              </select>
              <button
                type="button"
                class="primary-btn"
                :disabled="clientPrinting || clientStatus !== 'online'"
                @click="onClientPrint"
              >{{ clientPrinting ? '打印中…' : '客户端静默打印' }}</button>
            </div>
            <p v-if="clientMessage" class="message-text" :class="clientMessageKind">{{ clientMessage }}</p>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { DEFAULT_DEMO_DATA } from '@worm-vue3-print/canvas'
import { PrintClient, WormPrintError } from '@worm-vue3-print/client'
import type { PrinterInfo } from '@worm-vue3-print/client'
import {
  checkRenderHealth,
  requestServerPdf,
  openPdfBlob,
} from '../render-client'

const props = defineProps<{
  open: boolean
  baseUrl: string
  templateName: string
  getTemplateJson: () => string | Record<string, unknown> | undefined
}>()

const emit = defineEmits<{ close: [] }>()

// ── 服务端 PDF 打印 ──────────────────────────────────────────────────────
type RenderStatus = 'checking' | 'online' | 'offline'
const renderStatus = ref<RenderStatus>('checking')
const rendering = ref(false)
const renderError = ref('')

const renderStatusText = ref('渲染服务检测中…')
const renderStatusTitle = ref('探测 render 微服务 /render-api/health')

function setRenderOffline(message = '渲染服务未连接（请启动 services/print-render）') {
  renderStatus.value = 'offline'
  renderStatusText.value = '渲染服务离线'
  renderStatusTitle.value = message
}

async function refreshRenderStatus() {
  renderStatus.value = 'checking'
  renderStatusText.value = '渲染服务检测中…'
  const health = await checkRenderHealth()
  if (!health) {
    setRenderOffline()
    return
  }
  renderStatus.value = 'online'
  renderStatusText.value = '渲染服务在线'
  renderStatusTitle.value = `活跃 ${health.activeRenders} / 并发 ${health.maxConcurrent} · 队列 ${health.queueLength}`
}

let renderErrorTimer: ReturnType<typeof setTimeout> | undefined
function showRenderError(message: string) {
  renderError.value = message
  clearTimeout(renderErrorTimer)
  renderErrorTimer = setTimeout(() => (renderError.value = ''), 5000)
}

async function onServerPdf() {
  if (rendering.value) return
  let templateJson: Record<string, unknown> | null
  try {
    templateJson = resolveTemplateJson()
  } catch {
    showRenderError('模板 JSON 解析失败')
    return
  }
  if (!templateJson) {
    showRenderError('未获取到当前画布模板 JSON')
    return
  }

  rendering.value = true
  renderError.value = ''
  try {
    const pdf = await requestServerPdf(
      templateJson,
      DEFAULT_DEMO_DATA as unknown as Record<string, unknown>,
      props.baseUrl,
    )
    openPdfBlob(pdf, `purchase-receipt-${Date.now()}.pdf`)
    await refreshRenderStatus()
  } catch (err) {
    const message = err instanceof Error ? err.message : '服务端渲染失败'
    showRenderError(`PDF 生成失败：${message}`)
    await refreshRenderStatus()
  } finally {
    rendering.value = false
  }
}

// ── 桌面打印客户端静默打印 ──────────────────────────────────────────────
const client = new PrintClient({ timeoutMs: 20000 })
type ClientStatus = 'checking' | 'online' | 'offline'
const clientStatus = ref<ClientStatus>('checking')
const clientStatusText = ref('检测打印客户端…')
const clientPrinters = ref<PrinterInfo[]>([])
const selectedPrinter = ref('')
const clientPrinting = ref(false)
const clientMessage = ref('')
const clientMessageKind = ref<'success' | 'error' | ''>('')
let clientMsgTimer: ReturnType<typeof setTimeout> | undefined
let clientStatusRegistered = false

function showClientMessage(message: string, kind: 'success' | 'error' = 'success') {
  clientMessage.value = message
  clientMessageKind.value = kind
  clearTimeout(clientMsgTimer)
  clientMsgTimer = setTimeout(() => {
    clientMessage.value = ''
    clientMessageKind.value = ''
  }, 5000)
}

async function connectPrintClient() {
  clientStatus.value = 'checking'
  clientStatusText.value = '检测打印客户端…'
  if (!clientStatusRegistered) {
    clientStatusRegistered = true
    client.onStatusChange(s => {
      if (s === 'connected') {
        clientStatus.value = 'online'
        clientStatusText.value = '打印客户端在线'
        void refreshClientPrinters()
      } else if (s === 'disconnected') {
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

async function refreshClientPrinters() {
  try {
    clientPrinters.value = await client.listPrinters()
  } catch {
    clientPrinters.value = []
  }
}

async function onClientPrint() {
  if (clientPrinting.value) return
  let templateJson: Record<string, unknown> | null
  try {
    templateJson = resolveTemplateJson()
  } catch {
    showClientMessage('模板 JSON 解析失败', 'error')
    return
  }
  if (!templateJson) {
    showClientMessage('未获取到当前画布模板 JSON', 'error')
    return
  }

  clientPrinting.value = true
  clientMessage.value = ''
  clientMessageKind.value = ''
  try {
    const res = await client.print(
      templateJson,
      DEFAULT_DEMO_DATA as unknown as Record<string, unknown>,
      {
        baseUrl: props.baseUrl,
        printerName: selectedPrinter.value || undefined,
      },
      props.templateName,
    )
    showClientMessage(`已提交静默打印，作业 ${res.jobId.slice(0, 8)}`)
  } catch (err) {
    const code = err instanceof WormPrintError ? `[${err.code}] ` : ''
    const message = err instanceof Error ? err.message : '静默打印失败'
    showClientMessage(`静默打印失败：${code}${message}`, 'error')
  } finally {
    clientPrinting.value = false
  }
}

/** 获取画布模板 JSON：字符串则解析为对象；解析失败抛错由调用方提示 */
function resolveTemplateJson(): Record<string, unknown> | null {
  const rawJson = props.getTemplateJson()
  if (!rawJson) return null
  if (typeof rawJson === 'string') return JSON.parse(rawJson) as Record<string, unknown>
  return rawJson as unknown as Record<string, unknown>
}

// ── 懒初始化：首次打开时执行一次服务端检测与客户端连接，之后仅保留状态 ──
const initialized = ref(false)
watch(
  () => props.open,
  val => {
    if (val && !initialized.value) {
      initialized.value = true
      void refreshRenderStatus()
      void connectPrintClient()
    }
  },
)
</script>

<style scoped>
.print-mask {
  position: fixed;
  inset: 0;
  background: rgba(23, 32, 60, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.print-panel {
  width: min(560px, 92vw);
  max-height: 90vh;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 26px 60px rgba(23, 32, 60, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.print-head {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecf2;
  flex-shrink: 0;
}
.print-title {
  font-size: 15px;
  font-weight: 600;
  color: #2a2e37;
}
.print-close {
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
.print-close:hover {
  background: #f4f6fa;
  color: #2a2e37;
}
.print-body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.print-card {
  border: 1px solid #e9ecf2;
  border-radius: 8px;
  padding: 14px 16px;
  background: #fbfcfe;
}
.card-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #2a2e37;
}
.card-desc {
  margin: 0 0 12px;
  font-size: 12px;
  color: #8b909c;
}
.card-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #5a667f;
  cursor: default;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c2c7d0;
}
.status.online {
  color: #16a34a;
}
.status.online .status-dot {
  background: #22c55e;
}
.status.offline {
  color: #dc2626;
}
.status.offline .status-dot {
  background: #ef4444;
}
.status.checking .status-dot {
  background: #f59e0b;
}
.text-btn {
  padding: 0;
  border: none;
  background: none;
  color: #165dff;
  font-size: 12px;
  cursor: pointer;
}
.text-btn:hover {
  text-decoration: underline;
}
.primary-btn {
  padding: 6px 14px;
  border: 1px solid #165dff;
  border-radius: 6px;
  background: #165dff;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.primary-btn:hover:not(:disabled) {
  background: #0e4fd8;
}
.primary-btn:disabled {
  border-color: #c2c7d0;
  background: #c2c7d0;
  cursor: not-allowed;
}
.printer-select {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid #d9dde6;
  border-radius: 6px;
  font-size: 12px;
  color: #2a2e37;
  background: #fff;
}
.printer-select:disabled {
  background: #f4f6fa;
  color: #9aa1af;
  cursor: not-allowed;
}
.error-text {
  margin: 10px 0 0;
  font-size: 12px;
  color: #dc2626;
}
.message-text {
  margin: 10px 0 0;
  font-size: 12px;
}
.message-text.success {
  color: #16a34a;
}
.message-text.error {
  color: #dc2626;
}
</style>