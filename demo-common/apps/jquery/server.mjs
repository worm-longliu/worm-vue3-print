import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// 直挂形态的极简静态服务器：传统项目本来就有 Apache/Nginx/Express，这里只为 demo 自足。
// 同时把 /render-api/* 透传给本地 render 微服务并注入密钥，等价于 Vite 子工程里的 dev 代理。
const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))
const PORT = 9334
const RENDER_TARGET = process.env.RENDER_TARGET || 'http://localhost:3001'
const RENDER_KEY = process.env.RENDER_API_KEY || 'dev-render-key'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '/').split('?')[0])

  if (path.startsWith('/render-api')) {
    try {
      const upstream = await fetch(`${RENDER_TARGET}${path.replace(/^\/render-api/, '')}`, {
        method: req.method,
        headers: { 'content-type': 'application/json', 'x-render-key': RENDER_KEY },
        body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer(),
      })
      res.statusCode = upstream.status
      res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream')
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      res.statusCode = 503
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ code: 'render_unavailable', message: '渲染服务不可达：未启动 print-render（默认 3001）' }))
    }
    return
  }

  // /vendor/*、/images/*、/fonts/* 映射到 public/ 下同名目录（vendor 由 sync-assets 拷包产物，images/fonts 由 sync-demo-samples 拷示例资源），其余按工程根目录取文件
  const fromPublic = /^\/(vendor|images|fonts)\//.test(path)
  const target = fromPublic ? `public${path}` : path
  const rel = normalize(target.replace(/^\/+/, '') || 'index.html')
  if (rel.startsWith('..')) {
    res.statusCode = 403
    res.end()
    return
  }
  try {
    const body = await readFile(join(ROOT_DIR, rel))
    res.statusCode = 200
    res.setHeader('content-type', MIME[extname(rel)] || 'application/octet-stream')
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('Not Found')
  }
})

server.listen(PORT, () => console.log(`jQuery 直挂 demo：http://localhost:${PORT}/`))
