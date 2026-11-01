import { writeFile } from 'node:fs/promises'
import type { McpConfig } from './config.js'

// 服务端单请求 30s 超时（services/print-render/src/server.ts:31），客户端多留 5s 才拿得到超时归因
const RENDER_TIMEOUT_MS = 35_000

export type RenderOutcome = { ok: true; pdfPath: string } | { ok: false; message: string }

/**
 * 唯一的「出机器」入口：真实分页/行高只能由 print-render（Playwright）产生，
 * 本连接器不重复实现排版（见架构守卫 scripts/check-print-architecture.mjs）。
 */
export async function requestRenderPdf(
  cfg: McpConfig,
  body: Record<string, unknown>,
  pdfPath: string,
): Promise<RenderOutcome> {
  if (!cfg.renderBaseUrl) {
    return { ok: false, message: '未设置 PRINT_RENDER_BASE_URL，无法取得真实分页与 PDF' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS)
  try {
    const res = await fetch(`${cfg.renderBaseUrl}/render/pdf`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-render-key': cfg.renderKey ?? '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (res.status === 401) return { ok: false, message: '鉴权失败：客户端 RENDER_API_KEY 与服务端 RENDER_API_KEY 不一致' }
    if (res.status === 400) return { ok: false, message: `渲染服务判定请求非法：${await res.text()}` }
    if (res.status === 504) return { ok: false, message: '渲染超时（服务端 30s 上限）' }
    if (!res.ok) return { ok: false, message: `渲染服务返回 ${res.status}` }
    await writeFile(pdfPath, Buffer.from(await res.arrayBuffer()))
    return { ok: true, pdfPath }
  } catch (e) {
    const msg = (e as Error).name === 'AbortError' ? '渲染超时' : (e as Error).message
    return { ok: false, message: `无法访问渲染服务 ${cfg.renderBaseUrl}：${msg}` }
  } finally {
    clearTimeout(timer)
  }
}
