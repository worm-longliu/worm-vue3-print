// 打印输出弹窗：服务端 PDF（render 微服务）+ 客户端静默打印（本机打印客户端 WebSocket）。
// 版式与 demo 的 PrintOutputDialog 一致，状态直接写 DOM，不引入框架响应式。
import { checkRenderHealth, openPdfBlob, requestServerPdf } from './render-client.js'
import { renderInBrowser } from './browser-render.js'
import { setVisible, setNotice } from './ui.js'

const W = window.WormPrintCommon

/** 宿主注入：当前打印数据、当前画布模板 JSON、当前示例名 */
let host = null

const client = new W.PrintClient({ timeoutMs: 20000 })
const state = {
  renderStatus: 'checking',
  clientStatus: 'checking',
  rendering: false,
  clientPrinting: false,
  printers: [],
  selectedPrinter: '',
  statusRegistered: false,
}
let renderErrorTimer
let clientMsgTimer

// ────────────────── 状态徽章 ──────────────────
/** @param key 'render' | 'client'，对应 #render-status / #client-status 与同名 state 字段 */
function setStatus(key, status, text, title) {
  state[`${key}Status`] = status
  const $status = $(`#${key}-status`)
  $status.removeClass('checking online offline').addClass(status)
  $status.find('span').last().text(text)
  if (title != null) $status.attr('title', title)
}

// ────────────────── 链路二：服务端 PDF ──────────────────
function refreshServerButtons() {
  $('#btn-server-pdf')
    .prop('disabled', state.rendering || state.renderStatus !== 'online')
    .text(state.rendering ? '生成中…' : '服务端 PDF')
}

async function refreshRenderStatus() {
  setStatus('render', 'checking', '渲染服务检测中…')
  refreshServerButtons()
  const health = await checkRenderHealth()
  if (!health) {
    setStatus('render', 'offline', '渲染服务离线', '请启动 services/print-render')
  } else {
    setStatus('render', 'online', '渲染服务在线',
      `活跃 ${health.activeRenders} / 并发 ${health.maxConcurrent} · 队列 ${health.queueLength}`)
  }
  refreshServerButtons()
}

function showRenderError(message) {
  setNotice('#render-error', message)
  clearTimeout(renderErrorTimer)
  renderErrorTimer = setTimeout(() => setNotice('#render-error', ''), 5000)
}

async function onServerPdf() {
  if (state.rendering) return
  let templateJson
  try {
    templateJson = host.currentTemplateJson()
  } catch {
    showRenderError('模板 JSON 解析失败')
    return
  }
  state.rendering = true
  setNotice('#render-error', '')
  refreshServerButtons()
  try {
    const pdf = await requestServerPdf(templateJson, host.printData(), window.location.origin)
    openPdfBlob(pdf, `print-${Date.now()}.pdf`)
    await refreshRenderStatus()
  } catch (err) {
    showRenderError(`PDF 生成失败：${err.message}`)
    await refreshRenderStatus()
  } finally {
    state.rendering = false
    refreshServerButtons()
  }
}

// ────────────────── 链路三：客户端静默打印 ──────────────────
function refreshClientButtons() {
  $('#btn-client-print')
    .prop('disabled', state.clientPrinting || state.clientStatus !== 'online')
    .text(state.clientPrinting ? '打印中…' : '客户端静默打印')
  $('#printer-select').prop('disabled', state.clientStatus !== 'online' || state.clientPrinting)
}

function showClientMessage(message, kind = 'success') {
  const $msg = $('#client-message').removeClass('success error')
  if (message) $msg.addClass(kind)
  setNotice($msg[0], message)
  clearTimeout(clientMsgTimer)
  clientMsgTimer = setTimeout(() => setNotice($msg[0], ''), 5000)
}

/** 重画打印机下拉：保留已选打印机（客户端掉线或列表变化时回落系统默认） */
function refreshPrinterOptions() {
  const kept = !state.selectedPrinter || state.printers.some(p => p.name === state.selectedPrinter)
  if (!kept) state.selectedPrinter = ''
  const $select = $('#printer-select').empty()
  $select.append($('<option value="">系统默认打印机</option>'))
  state.printers.forEach(p => {
    $select.append($('<option></option>').val(p.name).text(`${p.name}${p.isDefault ? '（默认）' : ''}`))
  })
  $select.val(state.selectedPrinter)
}

async function listPrintersSafe() {
  try {
    state.printers = await client.listPrinters()
  } catch {
    state.printers = []
  }
  refreshPrinterOptions()
}

/**
 * 探测本机打印客户端：core 在端口不可达时会立刻以 connection refused 失败，
 * 所以这里只需 await connect()，无需额外的快速探测（与 demo 同口径）。
 */
async function connectPrintClient() {
  setStatus('client', 'checking', '检测打印客户端…')
  refreshClientButtons()
  if (!state.statusRegistered) {
    state.statusRegistered = true
    client.onStatusChange(status => {
      if (status === 'connected') {
        setStatus('client', 'online', '打印客户端在线')
        listPrintersSafe()
      } else if (status === 'disconnected') {
        setStatus('client', 'offline', '打印客户端离线')
      }
      refreshClientButtons()
    })
  }
  try {
    await client.connect()
    setStatus('client', 'online', '打印客户端在线')
    await listPrintersSafe()
  } catch {
    setStatus('client', 'offline', '打印客户端离线')
  } finally {
    refreshClientButtons()
  }
}

/** 静默打印：本页两遍渲染出最终 HTML，直送本机客户端（WebSocket 127.0.0.1:17521） */
async function onClientPrint() {
  if (state.clientPrinting) return
  let templateJson
  try {
    templateJson = host.currentTemplateJson()
  } catch {
    showClientMessage('模板 JSON 解析失败', 'error')
    return
  }
  state.clientPrinting = true
  refreshClientButtons()
  showClientMessage('')
  try {
    const rendered = await renderInBrowser(templateJson, host.printData(), window.location.origin)
    const res = await client.printHtml(rendered, {
      printerName: state.selectedPrinter || undefined,
    }, host.currentSampleName() || '打印模板')
    showClientMessage(`已提交静默打印，作业 ${res.jobId.slice(0, 8)}（${rendered.pageCount ?? 1} 页）`)
  } catch (err) {
    const code = err instanceof W.WormPrintError ? `[${err.code}] ` : ''
    showClientMessage(`静默打印失败：${code}${err.message}`, 'error')
  } finally {
    state.clientPrinting = false
    refreshClientButtons()
  }
}

export function openPrintDialog() {
  setVisible('#print-mask', true)
  // 懒初始化：首次及以后每次打开弹窗时才探测两条链路（与 demo 同口径）
  refreshRenderStatus()
  connectPrintClient()
}

export function initPrintDialog(handlers) {
  host = handlers
  $('#print-close').on('click', () => setVisible('#print-mask', false))
  $('#print-mask').on('click', e => {
    if (e.target === e.currentTarget) setVisible('#print-mask', false)
  })
  $('#render-recheck').on('click', refreshRenderStatus)
  $('#client-recheck').on('click', connectPrintClient)
  $('#btn-server-pdf').on('click', onServerPdf)
  $('#btn-client-print').on('click', onClientPrint)
  $('#printer-select').on('change', function () { state.selectedPrinter = this.value })
  refreshServerButtons()
  refreshClientButtons()
  refreshPrinterOptions()
}
