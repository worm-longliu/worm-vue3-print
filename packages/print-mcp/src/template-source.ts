import { readFile, stat } from 'node:fs/promises'

const MAX_BYTES = 5 * 1024 * 1024

export type TemplateSourceResult =
  | { ok: true; template: unknown }
  | { ok: false; message: string }

/** demo 与客户端的模板文件常写成 { templateJson, printData } 外壳，这里统一解包成裸模板 */
function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)
    && Object.prototype.hasOwnProperty.call(raw, 'templateJson')) {
    return (raw as { templateJson: unknown }).templateJson
  }
  return raw
}

/**
 * 从「直接传入的整份模板」或「本地模板文件路径」里取出模板。
 * 放在连接器一侧而非契约层：契约层要保持浏览器/Node 同构，不能有 fs 依赖。
 */
export async function resolveTemplateSource(args: {
  templateJson?: unknown
  templatePath?: string
}): Promise<TemplateSourceResult> {
  if (args.templateJson !== undefined && args.templateJson !== null) {
    return { ok: true, template: unwrap(args.templateJson) }
  }

  const path = args.templatePath?.trim()
  if (!path) {
    return {
      ok: false,
      message: '必须提供 templateJson（整份模板）或 templatePath（本地 .json 模板文件路径）之一。'
        + '模板较大时优先用 templatePath，省掉整份 JSON 的往返。',
    }
  }
  if (!/\.json$/i.test(path)) {
    return { ok: false, message: `templatePath 只接受 .json 文件：${path}` }
  }

  let size: number
  try {
    size = (await stat(path)).size
  } catch (e) {
    return { ok: false, message: `读不到模板文件：${path}（${(e as Error).message}）` }
  }
  if (size > MAX_BYTES) {
    return {
      ok: false,
      message: `模板文件 ${(size / 1024 / 1024).toFixed(1)}MB 超过上限 5MB：${path}`,
    }
  }

  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (e) {
    return { ok: false, message: `读不到模板文件：${path}（${(e as Error).message}）` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return {
      ok: false,
      message: `模板文件不是合法 JSON（解析失败，不是模板不合法）：${path}（${(e as Error).message}）`,
    }
  }
  return { ok: true, template: unwrap(parsed) }
}
