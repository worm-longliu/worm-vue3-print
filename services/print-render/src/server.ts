// services/print-render/src/server.ts
// 打印渲染服务入口

import express from 'express'
import { renderPdf, renderScreenshot } from './pdf-render.js'
import { BrowserPool } from './browser-pool.js'
import { makeFontService } from './font-service.js'
import { MAX_BATCH_COPIES } from '@worm-vue3-print/core'
import type { RenderRequest, PrintTemplateData as TemplateData } from '@worm-vue3-print/core'

/** 校验 printData：对象放行；数组检查非空、上限与每项类型。返回错误信息或 null（与 core 文案一致） */
function validatePrintData(printData: unknown): string | null {
  if (printData === undefined || !Array.isArray(printData)) return null
  if (printData.length === 0) return '批量打印数据必须是非空对象数组'
  if (printData.length > MAX_BATCH_COPIES) {
    return `批量打印最多支持 ${MAX_BATCH_COPIES} 份，当前 ${printData.length} 份`
  }
  for (let i = 0; i < printData.length; i++) {
    const item = printData[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return `批量打印数据第 ${i + 1} 项必须是对象`
    }
  }
  return null
}

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

// ─── 系统字体清单端点 ───

const fontService = makeFontService()

app.get('/fonts', authMiddleware, async (_req, res) => {
  try {
    res.json(await fontService.list())
  } catch (error) {
    console.error('Font enumeration failed:', error)
    res.status(500).json({ code: 'INTERNAL', message: 'Font enumeration failed' })
  }
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

  const printDataError = validatePrintData(body.printData)
  if (printDataError) {
    res.status(400).json({ code: 'INVALID_REQUEST', message: printDataError })
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

  // 截图数组仅渲染首条，但非法数组（空/超限/含非对象项）仍在入口拒绝
  const printDataError = validatePrintData(body.printData)
  if (printDataError) {
    res.status(400).json({ code: 'INVALID_REQUEST', message: printDataError })
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
