// 服务端渲染微服务（services/print-render）调用封装，与 demo 的 render-client 同口径。
// 浏览器只请求同源 /render-api/*，由 Vite dev 代理转发并注入 X-Render-Key，
// 因此密钥不出现在前端代码中。生产环境应由宿主后端做等价的反向代理。

const RENDER_API_PREFIX = '/render-api'

/** 探测 render 服务是否可用（代理不通/服务未启动时返回 null，不抛错） */
export async function checkRenderHealth(signal) {
  try {
    const res = await fetch(`${RENDER_API_PREFIX}/health`, { signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * 请求服务端渲染 PDF。
 * @param templateJson 当前画布模板 JSON（对象）
 * @param printData 打印业务数据；传非空对象数组时服务端按数组长度批量渲染并合并为一个 PDF
 * @param baseUrl 相对路径图片拼接用的宿主基址
 */
export async function requestServerPdf(templateJson, printData, baseUrl) {
  const res = await fetch(`${RENDER_API_PREFIX}/render/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateJson, printData, baseUrl }),
  })
  if (!res.ok) {
    // 服务端错误统一为 { code, message }
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      // 非 JSON 错误体时保留状态码
    }
    throw new Error(message)
  }
  return res.blob()
}

/** 在新标签页打开 PDF；被浏览器拦截时降级为下载 */
export function openPdfBlob(pdf, filename) {
  const url = URL.createObjectURL(pdf)
  const win = window.open(url, '_blank')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }
  // Blob URL 在新标签页加载后延迟回收，避免过早释放导致白屏
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
