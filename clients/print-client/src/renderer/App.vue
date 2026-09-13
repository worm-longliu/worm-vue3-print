<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
    pdfDir.value = await window.wormPrint.openPdfDir()
  } catch (e) {
    saveMsg.value = `打开目录失败：${(e as Error).message}`
    setTimeout(() => (saveMsg.value = ''), 4000)
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
        <div class="row">
          <label>PDF 保存目录</label>
          <input
            type="text"
            v-model="config.pdfOutputDir"
            :placeholder="pdfDir"
            style="min-width: 360px"
          />
          <button @click="openPdfDir">打开目录</button>
          <span class="muted">留空则用 {{ pdfDir }}</span>
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
      <table>
        <thead>
          <tr>
            <th>时间</th><th>模板</th><th>打印机</th><th>份数</th>
            <th>纸宽×纸高(μm)</th><th>纸高</th><th>结果</th><th>生成的 PDF</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="j in jobs" :key="j.jobId">
            <td>{{ fmtTime(j.ts) }}</td>
            <td>{{ j.templateName }}</td>
            <td>{{ j.printerName }}</td>
            <td>{{ j.copies }}</td>
            <td>{{ j.paperMicrometers.width }}×{{ j.paperMicrometers.height }}</td>
            <td>{{ j.paperHeightSource === 'derived' ? '推导' : '配置' }}</td>
            <td :class="j.outcome === 'failed' ? 'danger' : ''">
              {{ j.outcome === 'success' ? '成功' : `失败：${j.errorCode ?? ''} ${j.errorMessage ?? ''}` }}
            </td>
            <td class="muted" style="max-width: 320px; word-break: break-all">{{ j.pdfPath ?? '—' }}</td>
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
