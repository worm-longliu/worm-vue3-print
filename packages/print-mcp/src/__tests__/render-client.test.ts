import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { requestRenderPdf } from '../render-client.js'

type Stub = { url: string; close: () => void }

function stub(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Stub> {
  return new Promise<Stub>(resolve => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}

describe('requestRenderPdf', () => {
  it('把 PDF 落到临时文件并回路径，鉴权头正确透传', async () => {
    let seenKey: string | string[] | undefined
    const s = await stub((req, res) => {
      seenKey = req.headers['x-render-key']
      res.setHeader('content-type', 'application/pdf')
      res.end(Buffer.from('%PDF-1.4 fake'))
    })
    const dir = await mkdtemp(join(tmpdir(), 'mcp-render-'))
    const pdfPath = join(dir, 'preview.pdf')
    const r = await requestRenderPdf(
      { renderBaseUrl: s.url, renderKey: 'k1' },
      { templateJson: { paperSize: 'A4' } },
      pdfPath,
    )
    expect(r.ok).toBe(true)
    expect(seenKey).toBe('k1')
    if (r.ok) expect((await readFile(r.pdfPath)).subarray(0, 5).toString()).toBe('%PDF-')
    s.close()
  })

  it('401 转成鉴权失败而不是抛栈', async () => {
    const s = await stub((_req, res) => {
      res.writeHead(401)
      res.end('{"code":"UNAUTHORIZED"}')
    })
    const r = await requestRenderPdf({ renderBaseUrl: s.url, renderKey: 'bad' }, {}, '/tmp/x.pdf')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('鉴权失败')
    s.close()
  })

  it('400 把服务端文案原样带回，便于 agent 自修', async () => {
    const s = await stub((_req, res) => {
      res.writeHead(400)
      res.end('templateJson is required')
    })
    const r = await requestRenderPdf({ renderBaseUrl: s.url, renderKey: 'k' }, {}, '/tmp/x.pdf')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('templateJson is required')
    s.close()
  })

  it('未配置服务地址时直接降级，不发起请求', async () => {
    const r = await requestRenderPdf({ renderBaseUrl: null, renderKey: null }, {}, '/tmp/x.pdf')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('PRINT_RENDER_BASE_URL')
  })

  it('连不上服务时给出地址与原因', async () => {
    const r = await requestRenderPdf(
      { renderBaseUrl: 'http://127.0.0.1:1', renderKey: 'k' }, {}, '/tmp/x.pdf',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('http://127.0.0.1:1')
  })
})
