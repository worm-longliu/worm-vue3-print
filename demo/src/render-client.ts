// 服务端渲染微服务（services/print-render）调用封装。
// 浏览器只请求同源 /render-api/*，由 Vite dev 代理转发并注入 X-Render-Key，
// 因此密钥不出现在前端代码中。生产环境应由宿主后端做等价的反向代理。

const RENDER_API_PREFIX = '/render-api'

/** render 服务健康状态（GET /health 响应体） */
export interface RenderHealth {
  status: string
  activeRenders: number
  maxConcurrent: number
  queueLength: number
}

/** 探测 render 服务是否可用（代理不通/服务未启动时返回 null，不抛错） */
export async function checkRenderHealth(signal?: AbortSignal): Promise<RenderHealth | null> {
  try {
    const res = await fetch(`${RENDER_API_PREFIX}/health`, { signal })
    if (!res.ok) return null
    return (await res.json()) as RenderHealth
  } catch {
    return null
  }
}

/** 服务端容器字体清单（GET /fonts 响应体） */
export interface ServerFontReport {
  /** false 表示服务端未能给出清单（枚举失败/服务未就绪），不等于「没有字体」 */
  available: boolean
  fonts: string[]
}

/** 取数超时：字体清单绝不阻塞设计器首屏，超时按未上报处理 */
const FONT_FETCH_TIMEOUT_MS = 3000

/**
 * 拉取 render 服务容器内的系统字体清单。
 * 服务不可达或超时返回 { available: false, fonts: [] }，不抛错——调用方无需 try/catch。
 */
export async function fetchServerFonts(signal?: AbortSignal): Promise<ServerFontReport> {
  const unavailable: ServerFontReport = { available: false, fonts: [] }
  try {
    const res = await fetch(`${RENDER_API_PREFIX}/fonts`, {
      signal: signal ?? AbortSignal.timeout(FONT_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return unavailable
    const data = (await res.json()) as Partial<ServerFontReport>
    if (typeof data?.available !== 'boolean' || !Array.isArray(data.fonts)) return unavailable
    return { available: data.available, fonts: data.fonts }
  } catch {
    return unavailable
  }
}

/**
 * 请求服务端渲染 PDF。
 * @param templateJson 当前画布模板 JSON（对象）
 * @param printData 打印业务数据；传非空对象数组时服务端按数组长度批量渲染，份间分页并合并为一个 PDF（最多 500 份）
 * @param baseUrl 相对路径图片（如 /docfiles/...）拼接用的宿主基址
 * @returns PDF Blob
 */
export async function requestServerPdf(
  templateJson: Record<string, unknown>,
  printData: Record<string, unknown> | Array<Record<string, unknown>>,
  baseUrl: string,
): Promise<Blob> {
  const res = await fetch(`${RENDER_API_PREFIX}/render/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateJson, printData, baseUrl }),
  })

  if (!res.ok) {
    // 服务端错误统一为 { code, message }
    let message = `HTTP ${res.status}`
    try {
      const errBody = await res.json()
      if (errBody?.message) message = errBody.message
    } catch {
      // 非 JSON 错误体时保留状态码
    }
    throw new Error(message)
  }

  return res.blob()
}

/** 在新标签页打开 PDF；被浏览器拦截时降级为下载 */
export function openPdfBlob(pdf: Blob, filename: string): void {
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
