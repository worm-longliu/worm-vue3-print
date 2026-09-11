// services/print-render/src/server.ts
// 打印渲染服务入口

import express from 'express'
import { renderPdf, renderScreenshot } from './pdf-render.js'
import { BrowserPool } from './browser-pool.js'
import type { RenderRequest, PrintTemplateData as TemplateData } from '@worm-vue3-print/core'

const app = express()
app.use(express.json({ limit: '10mb' }))

const RENDER_KEY = process.env.RENDER_API_KEY || 'dev-render-key'
const PORT = Number(process.env.PORT || 3001)
const REQUEST_TIMEOUT_MS = 30_000 // 单请求 30s 超时

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.headers['x-render-key']
  if (key !== RENDER_KEY) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid render key' })
    return
  }
  next()
}

// ─── 健康状态端点 ───

app.get('/health', (_req, res) => {
  const pool = BrowserPool.getInstance()
  res.json({
    status: 'ok',
    activeRenders: pool.activeCount,
    maxConcurrent: pool.concurrencyLimit,
    queueLength: pool.queueLength,
  })
})

// ─── PDF 渲染端点 ───

app.post('/render/pdf', authMiddleware, async (req, res) => {
  const body = req.body as RenderRequest

  // 请求体校验：适配新 RenderRequest 格式
  if (!body.templateJson) {
    res.status(400).json({ code: 'INVALID_REQUEST', message: 'templateJson is required' })
    return
  }

  const tpl = body.templateJson as TemplateData
  if (!tpl.paperSize || !tpl.orientation || !tpl.margins) {
    res.status(400).json({
      code: 'INVALID_REQUEST',
      message: 'templateJson must contain paperSize, orientation, and margins',
    })
    return
  }

  // 请求级超时保护
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    res.status(504).json({ code: 'RENDER_TIMEOUT', message: `Render exceeded ${REQUEST_TIMEOUT_MS}ms` })
  }, REQUEST_TIMEOUT_MS)

  try {
    const pdf = await renderPdf(body)
    if (timedOut) return // 超时响应已发送，忽略后续
    clearTimeout(timer)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', pdf.length)
    res.send(pdf)
  } catch (error) {
    if (timedOut) return
    clearTimeout(timer)
    console.error('Render failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ code: 'RENDER_FAILED', message })
  }
})

// ─── 截图端点 ───

app.post('/render/screenshot', authMiddleware, async (req, res) => {
  const body = req.body as RenderRequest

  if (!body.templateJson) {
    res.status(400).json({ code: 'INVALID_REQUEST', message: 'templateJson is required' })
    return
  }

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    res.status(504).json({ code: 'RENDER_TIMEOUT', message: 'Screenshot timed out' })
  }, REQUEST_TIMEOUT_MS)

  try {
    const png = await renderScreenshot(body)
    if (timedOut) return
    clearTimeout(timer)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Length', png.length)
    res.send(png)
  } catch (error) {
    if (timedOut) return
    clearTimeout(timer)
    console.error('Screenshot failed:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ code: 'SCREENSHOT_FAILED', message })
  }
})

// ─── 启动服务 ───

const server = app.listen(PORT, () => {
  console.log(`Print render service listening on port ${PORT}`)
})

// ─── 优雅关闭 ───

async function gracefulShutdown(signal: string) {
  console.log(`\n[${signal}] Shutting down gracefully...`)

  // 停止接收新连接
  server.close(() => {
    console.log('[shutdown] HTTP server closed')
  })

  // 关闭 BrowserPool
  try {
    await BrowserPool.getInstance().shutdown()
    console.log('[shutdown] BrowserPool closed')
  } catch (err) {
    console.error('[shutdown] BrowserPool close error:', err)
  }

  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
