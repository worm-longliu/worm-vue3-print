import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 宿主示例总览页的静态托管：demo-common/index.html 是一份无构建的单文件导航页，
// 五个示例工程各起各的端口，本页只负责把它们的入口列出来并互链。
// 用法：node demo-common/scripts/serve-nav.mjs
const HERE = dirname(fileURLToPath(import.meta.url))
const PAGE = join(HERE, '..', 'index.html')
const PORT = 9300

createServer(async (_req, res) => {
  try {
    const html = await readFile(PAGE)
    res.statusCode = 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html)
  } catch {
    res.statusCode = 500
    res.end('Not Found：demo-common/index.html')
  }
}).listen(PORT, () => console.log(`宿主示例总览：http://localhost:${PORT}/`))
