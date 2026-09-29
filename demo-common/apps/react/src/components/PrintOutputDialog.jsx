// 打印输出弹窗：服务端 PDF 与客户端静默打印两条链路收拢于此。
// 首次打开时各探测一次，之后靠「重新检测」按钮刷新；printData 随批量开关在对象/数组间切换。
import { useEffect, useRef, useState } from 'react'
import { PrintClient, WormPrintError } from '@worm-vue3-print/core/client'
import { checkRenderHealth, openPdfBlob, requestServerPdf } from '../render-client'
import { renderInBrowser } from '../browser-render'

const client = new PrintClient({ timeoutMs: 20000 })

export default function PrintOutputDialog({ visible, onClose, designerRef, printData, currentSampleName, baseUrl }) {
  // ── 服务端 PDF ──
  const [renderStatus, setRenderStatus] = useState('checking')
  const [renderStatusText, setRenderStatusText] = useState('渲染服务检测中…')
  const [renderStatusTitle, setRenderStatusTitle] = useState('探测 render 微服务 /render-api/health')
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const renderErrorTimer = useRef()

  // ── 客户端静默打印 ──
  const [clientStatus, setClientStatus] = useState('checking')
  const [clientStatusText, setClientStatusText] = useState('检测打印客户端…')
  const [clientPrinters, setClientPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState('')
  const [clientPrinting, setClientPrinting] = useState(false)
  const [clientMessage, setClientMessage] = useState('')
  const [clientMessageKind, setClientMessageKind] = useState('')
  const clientMsgTimer = useRef()
  const statusRegistered = useRef(false)
  const probed = useRef(false)

  async function refreshRenderStatus() {
    setRenderStatus('checking')
    setRenderStatusText('渲染服务检测中…')
    const health = await checkRenderHealth()
    if (!health) {
      setRenderStatus('offline')
      setRenderStatusText('渲染服务离线')
      setRenderStatusTitle('请启动 services/print-render')
      return
    }
    setRenderStatus('online')
    setRenderStatusText('渲染服务在线')
    setRenderStatusTitle(`活跃 ${health.activeRenders} / 并发 ${health.maxConcurrent} · 队列 ${health.queueLength}`)
  }

  function showRenderError(message) {
    setRenderError(message)
    clearTimeout(renderErrorTimer.current)
    renderErrorTimer.current = setTimeout(() => setRenderError(''), 5000)
  }

  function showClientMessage(message, kind = 'success') {
    setClientMessage(message)
    setClientMessageKind(kind)
    clearTimeout(clientMsgTimer.current)
    clientMsgTimer.current = setTimeout(() => {
      setClientMessage('')
      setClientMessageKind('')
    }, 5000)
  }

  async function refreshClientPrinters() {
    try {
      setClientPrinters(await client.listPrinters())
    } catch {
      setClientPrinters([])
    }
  }

  async function connectPrintClient() {
    setClientStatus('checking')
    setClientStatusText('检测打印客户端…')
    if (!statusRegistered.current) {
      statusRegistered.current = true
      client.onStatusChange(status => {
        if (status === 'connected') {
          setClientStatus('online')
          setClientStatusText('打印客户端在线')
          refreshClientPrinters()
        } else if (status === 'disconnected') {
          setClientStatus('offline')
          setClientStatusText('打印客户端离线')
        }
      })
    }
    try {
      await client.connect()
      setClientStatus('online')
      setClientStatusText('打印客户端在线')
      await refreshClientPrinters()
    } catch {
      setClientStatus('offline')
      setClientStatusText('打印客户端离线')
    }
  }

  // 懒初始化：首次打开弹窗时探测一次，之后仅保留状态
  useEffect(() => {
    if (!visible || probed.current) return
    probed.current = true
    refreshRenderStatus()
    connectPrintClient()
  }, [visible])

  useEffect(() => () => {
    clearTimeout(renderErrorTimer.current)
    clearTimeout(clientMsgTimer.current)
  }, [])

  if (!visible) return null

  function currentTemplateJson() {
    return JSON.parse(designerRef.current.getTemplateJson())
  }

  async function onServerPdf() {
    if (rendering) return
    let templateJson
    try {
      templateJson = currentTemplateJson()
    } catch {
      showRenderError('模板 JSON 解析失败')
      return
    }
    setRendering(true)
    setRenderError('')
    try {
      const pdf = await requestServerPdf(templateJson, printData, baseUrl)
      openPdfBlob(pdf, `print-${Date.now()}.pdf`)
      await refreshRenderStatus()
    } catch (err) {
      showRenderError(`PDF 生成失败：${err.message}`)
      await refreshRenderStatus()
    } finally {
      setRendering(false)
    }
  }

  /** 静默打印：本页两遍渲染出最终 HTML，直送本机客户端（WebSocket 127.0.0.1:17521） */
  async function onClientPrint() {
    if (clientPrinting) return
    let templateJson
    try {
      templateJson = currentTemplateJson()
    } catch {
      showClientMessage('模板 JSON 解析失败', 'error')
      return
    }
    setClientPrinting(true)
    setClientMessage('')
    setClientMessageKind('')
    try {
      const rendered = await renderInBrowser(templateJson, printData, baseUrl)
      const res = await client.printHtml(rendered, {
        printerName: selectedPrinter || undefined,
      }, currentSampleName ?? '打印模板')
      showClientMessage(`已提交静默打印，作业 ${res.jobId.slice(0, 8)}（${rendered.pageCount ?? 1} 页）`)
    } catch (err) {
      const code = err instanceof WormPrintError ? `[${err.code}] ` : ''
      showClientMessage(`静默打印失败：${code}${err.message}`, 'error')
    } finally {
      setClientPrinting(false)
    }
  }

  return (
    <div className="print-mask" onClick={onClose}>
      <div className="print-panel" onClick={e => e.stopPropagation()}>
        <div className="print-head">
          <span className="print-title">打印输出</span>
          <span className="print-close" onClick={onClose}>×</span>
        </div>
        <div className="print-body">
          <section className="print-card">
            <h3 className="card-title">服务端 PDF 打印</h3>
            <p className="card-desc">将当前画布模板与 demo 数据交由 render 微服务渲染，生成 PDF 后在浏览器新标签页打开。</p>
            <div className="card-row">
              <span className={`status ${renderStatus}`} title={renderStatusTitle}>
                <i className="status-dot"></i>{renderStatusText}
              </span>
              <button type="button" className="text-btn" onClick={refreshRenderStatus}>重新检测</button>
            </div>
            <button type="button" className="primary-btn" disabled={rendering || renderStatus !== 'online'} onClick={onServerPdf}>
              {rendering ? '生成中…' : '服务端 PDF'}
            </button>
            {renderError ? <p className="error-text">{renderError}</p> : null}
          </section>

          <section className="print-card">
            <h3 className="card-title">客户端静默打印</h3>
            <p className="card-desc">页面内用 core 同构管线完成两遍渲染，将最终 HTML 直送本机打印客户端（WebSocket 127.0.0.1:17521）静默出纸，客户端不再执行模板渲染。</p>
            <div className="card-row">
              <span className={`status ${clientStatus}`} title="本机打印客户端（WebSocket 127.0.0.1:17521）">
                <i className="status-dot"></i>{clientStatusText}
              </span>
              <button type="button" className="text-btn" onClick={connectPrintClient}>重新检测</button>
            </div>
            <div className="card-actions">
              <select
                className="printer-select"
                value={selectedPrinter}
                disabled={clientStatus !== 'online' || clientPrinting}
                title="选择目标打印机（留空为系统默认）"
                onChange={e => setSelectedPrinter(e.target.value)}
              >
                <option value="">系统默认打印机</option>
                {clientPrinters.map(p => (
                  <option key={p.name} value={p.name}>{p.name}{p.isDefault ? '（默认）' : ''}</option>
                ))}
              </select>
              <button type="button" className="primary-btn" disabled={clientPrinting || clientStatus !== 'online'} onClick={onClientPrint}>
                {clientPrinting ? '打印中…' : '客户端静默打印'}
              </button>
            </div>
            {clientMessage ? <p className={`message-text ${clientMessageKind}`}>{clientMessage}</p> : null}
          </section>
        </div>
      </div>
    </div>
  )
}
