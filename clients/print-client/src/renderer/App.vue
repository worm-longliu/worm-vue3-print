<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { AppConfig } from '../main/config.js'
import type { PrinterInfo } from '@worm-vue3-print/client'
import type { JobRecord } from '../main/job-history.js'
import type { LogEntry } from '../main/logger.js'

const tab = ref<'settings' | 'jobs' | 'logs'>('settings')
const config = ref<AppConfig | null>(null)
const port = ref(0)
const version = ref('')
const pdfDir = ref('')
const printers = ref<PrinterInfo[]>([])
const testPrinter = ref('')
const saveMsg = ref('')
const testMsg = ref('')
const jobs = ref<JobRecord[]>([])
const logs = ref<LogEntry[]>([])
const originsText = ref('')
const bridgeError = ref('')
const pdfActionError = ref<Record<string, string>>({})
/** 路径条实际展示的目录：自定义目录优先，未设置时回退默认目录 */
const effectivePdfDir = computed(() => config.value?.pdfOutputDir?.trim() || pdfDir.value)

onMounted(async () => {
  if (!window.wormPrint) {
    bridgeError.value =
      '渲染桥（preload）加载失败，界面无法与主进程通信，请检查客户端构建产物是否完整。'
    return
  }
  try {
    const state = await window.wormPrint.getState()
    config.value = state.config
    port.value = state.port
    version.value = state.version
    pdfDir.value = state.pdfDir
    originsText.value = state.config.allowedOrigins.join('\n')
    printers.value = await window.wormPrint.listPrinters()
    jobs.value = await window.wormPrint.listHistory()
    window.wormPrint.onLog(e => {
      logs.value.push(e)
      if (logs.value.length > 1000) logs.value.shift()
    })
    window.wormPrint.onJob(r => {
      jobs.value.unshift(r)
    })
  } catch (err) {
    bridgeError.value = `初始化失败：${(err as Error)?.message ?? String(err)}`
  }
})

async function save() {
  if (!config.value) return
  const patch: Partial<AppConfig> = {
    ...config.value,
    allowedOrigins: originsText.value
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean),
  }
  config.value = await window.wormPrint.saveConfig(patch)
  saveMsg.value = '已保存（端口变更需重启客户端生效）'
  setTimeout(() => (saveMsg.value = ''), 3000)
}

async function doTestPrint() {
  testMsg.value = '打印中…'
  try {
    await window.wormPrint.testPrint(testPrinter.value || undefined)
    testMsg.value = '已发送到打印机'
  } catch (e) {
    testMsg.value = `失败：${(e as Error).message}`
  }
}

async function openPdfDir() {
  try {
    pdfDir.value = await window.wormPrint.openPdfDir(config.value?.pdfOutputDir || undefined)
  } catch (e) {
    saveMsg.value = `打开目录失败：${(e as Error).message}`
    setTimeout(() => (saveMsg.value = ''), 4000)
  }
}

async function pickPdfDir() {
  if (!config.value) return
  try {
    const dir = await window.wormPrint.pickPdfDir()
    if (dir) config.value.pdfOutputDir = dir
  } catch (e) {
    saveMsg.value = `选择目录失败：${(e as Error).message}`
    setTimeout(() => (saveMsg.value = ''), 4000)
  }
}

async function openJobPdf(job: JobRecord) {
  if (!job.pdfPath) return
  try {
    await window.wormPrint.openPdfFile(job.pdfPath)
    const next = { ...pdfActionError.value }
    delete next[job.jobId]
    pdfActionError.value = next
  } catch (e) {
    pdfActionError.value = {
      ...pdfActionError.value,
      [job.jobId]: (e as Error).message,
    }
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <div>
    <div v-if="bridgeError" class="bridge-error">{{ bridgeError }}</div>
    <div v-else-if="!config" class="loading">正在加载…</div>
    <template v-else>
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'settings' }" @click="tab = 'settings'">设置</button>
      <button class="tab" :class="{ active: tab === 'jobs' }" @click="tab = 'jobs'">任务记录</button>
      <button class="tab" :class="{ active: tab === 'logs' }" @click="tab = 'logs'">日志</button>
      <span class="muted" style="margin-left: auto; align-self: center">v{{ version }}　端口 {{ port }}</span>
    </div>

    <div v-if="tab === 'settings' && config">
      <div class="row">
        <label>监听端口</label>
        <input type="number" v-model.number="config.port" min="1024" max="65535" />
      </div>
      <div class="row">
        <label>开机自启</label>
        <input type="checkbox" v-model="config.autoStart" />
      </div>
      <div class="row">
        <label>日志级别</label>
        <select v-model="config.logLevel">
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>
      <div class="row">
        <label>保留生成的 PDF</label>
        <input type="checkbox" v-model="config.keepGeneratedPdf" />
        <span class="muted">排查用：保留每次打印生成的 PDF（关闭时打印完即删）</span>
      </div>
      <template v-if="config.keepGeneratedPdf">
        <div class="row row-stack">
          <label>PDF 保存目录</label>
          <div class="field-stack">
            <div class="path-bar">
              <svg class="path-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M1.5 4.5A1.5 1.5 0 0 1 3 3h2.8l1.3 1.6H13A1.5 1.5 0 0 1 14.5 6v5.5A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-7Z"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linejoin="round"
                />
              </svg>
              <span class="path-text" :title="effectivePdfDir">{{ effectivePdfDir }}</span>
              <button type="button" class="path-btn" @click="pickPdfDir">更改…</button>
              <span class="path-divider" aria-hidden="true"></span>
              <button type="button" class="path-btn" @click="openPdfDir">打开</button>
            </div>
            <div class="field-hint">
              <span class="muted">留空使用默认目录；更改后点击「保存设置」生效</span>
              <button
                v-if="config.pdfOutputDir"
                type="button"
                class="link-btn"
                @click="config.pdfOutputDir = ''"
              >
                恢复默认
              </button>
            </div>
          </div>
        </div>
      </template>
      <div class="row">
        <label>安全开关</label>
        <input type="checkbox" v-model="config.securityEnabled" />
        <span class="muted">开启后校验配对 token，Origin 白名单非空时同时校验来源</span>
      </div>
      <template v-if="config.securityEnabled">
        <div class="row">
          <label>配对 token</label>
          <input type="text" :value="config.pairingToken" readonly style="min-width: 360px" />
          <span class="muted">首次开启自动生成</span>
        </div>
        <div class="row" style="align-items: flex-start">
          <label>Origin 白名单</label>
          <textarea v-model="originsText" placeholder="https://erp.example.com（每行一个；留空仅校验 token）"></textarea>
        </div>
      </template>
      <div class="row">
        <label></label>
        <button class="primary" @click="save">保存设置</button>
        <span class="muted">{{ saveMsg }}</span>
      </div>

      <hr style="margin: 18px 0; border: none; border-top: 1px solid var(--divider, #eee)" />
      <div class="row">
        <label>测试打印</label>
        <select v-model="testPrinter">
          <option value="">系统默认打印机</option>
          <option v-for="p in printers" :key="p.name" :value="p.name">
            {{ p.name }}{{ p.isDefault ? '（默认）' : '' }} [{{ p.status }}]
          </option>
        </select>
        <button @click="doTestPrint">打印测试页</button>
      </div>
      <div class="row"><label></label><span class="muted">{{ testMsg }}</span></div>
    </div>

    <div v-else-if="tab === 'jobs'">
      <table class="jobs-table">
        <colgroup>
          <col style="width: 138px" />
          <col />
          <col />
          <col style="width: 44px" />
          <col style="width: 116px" />
          <col style="width: 74px" />
          <col />
          <col style="width: 64px" />
        </colgroup>
        <thead>
          <tr>
            <th>时间</th><th>模板</th><th>打印机</th><th class="num">份数</th>
            <th class="num">宽×高(μm)</th>
            <th class="num" title="纸高来源：配置=任务显式指定，推导=按渲染内容高度推导">纸高来源</th>
            <th>结果</th><th>PDF</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.jobId">
            <td class="time-cell">{{ fmtTime(j.ts) }}</td>
            <td :title="j.templateName">{{ j.templateName }}</td>
            <td :title="j.printerName">{{ j.printerName }}</td>
            <td class="num">{{ j.copies }}</td>
            <td class="num" :title="`${j.paperMicrometers.width}×${j.paperMicrometers.height} μm`">
              {{ j.paperMicrometers.width }}×{{ j.paperMicrometers.height }}
            </td>
            <td class="num">{{ j.paperHeightSource === 'derived' ? '推导' : '配置' }}</td>
            <td
              class="result-cell"
              :class="{ danger: j.outcome === 'failed' }"
              :title="j.outcome === 'success' ? '成功' : `失败：${j.errorCode ?? ''} ${j.errorMessage ?? ''}`"
            >
              {{ j.outcome === 'success' ? '成功' : `失败：${j.errorCode ?? ''} ${j.errorMessage ?? ''}` }}
            </td>
            <td>
              <template v-if="j.pdfPath">
                <button
                  type="button"
                  class="link-btn"
                  title="在文件管理器中显示该文件"
                  @click="openJobPdf(j)"
                >
                  打开
                </button>
                <div
                  v-if="pdfActionError[j.jobId]"
                  class="cell-error"
                  :title="pdfActionError[j.jobId]"
                >
                  {{ pdfActionError[j.jobId] }}
                </div>
              </template>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else>
      <div class="log">
        <div v-for="(l, i) in logs" :key="i" :class="l.level">
          [{{ fmtTime(l.ts) }}] {{ l.level.toUpperCase() }} {{ l.message }}{{ l.meta ? ' ' + JSON.stringify(l.meta) : '' }}
        </div>
      </div>
    </div>
    </template>
  </div>
</template>
