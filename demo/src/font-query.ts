// 手动字体查询的宿主实现：设计器点击「查询字体」时才会走到这里。
// 某一端取不到一律降级为 { available: false, fonts: [] }（离线是可预期状态，不抛错），
// 只有查询流程本身失败才会让 loadFonts reject。
import { PrintClient } from '@worm-vue3-print/client'
import { fetchServerFonts, type ServerFontReport } from './render-client'

/** 复用一个客户端实例，避免每次查询都新建 WS 连接 */
let client: PrintClient | undefined

async function fetchClientFonts(): Promise<ServerFontReport> {
  try {
    client ??= new PrintClient()
    if (client.status !== 'connected') await client.connect()
    return await client.listFonts()
  } catch {
    return { available: false, fonts: [] }
  }
}

export async function loadFonts(): Promise<{ server: ServerFontReport; client: ServerFontReport }> {
  const [server, clientReport] = await Promise.all([fetchServerFonts(), fetchClientFonts()])
  return { server, client: clientReport }
}
