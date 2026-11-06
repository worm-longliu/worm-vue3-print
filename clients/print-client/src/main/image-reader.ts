// 图片读取 bridge（ImageReaderBridge 实现端）：本地路径读图 + base64 PNG 解码，统一转灰度位图。
// 解码用 Electron nativeImage（零新依赖、无 asarUnpack 风险）；MCP 包只拿像素，不碰文件系统。
import { nativeImage } from 'electron'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, extname } from 'node:path'
import type { ImageReaderBridge } from '@worm-vue3-print/mcp'
import type { GrayBitmap } from '@worm-vue3-print/mcp'
import type { Logger } from './logger.js'
import { MAX_IMAGE_BYTES, assertImageSizeWithinLimit, estimateBase64Bytes } from './image-limits.js'

/** 允许的扩展名（实际格式还要靠 nativeImage 解码成功兜底） */
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.webp'])

function imageError(code: string, message: string): Error {
  const err = new Error(message)
  ;(err as Error & { code: string }).code = code
  return err
}

/**
 * 路径校验：必须绝对路径、必须是文件、拒绝符号链接逃逸、限扩展名与体积。
 * 这是工具链开放本地读图的唯一入口，校验集中在这里（主进程本身能读任意路径）。
 */
function validateImagePath(rawPath: string): string {
  if (!isAbsolute(rawPath)) {
    throw imageError('IMAGE_UNSUPPORTED', '只接受绝对路径（相对路径无法确定基准目录）')
  }
  let real: string
  try {
    real = realpathSync(rawPath)
  } catch {
    throw imageError('IMAGE_NOT_FOUND', rawPath)
  }
  let stat
  try {
    stat = statSync(real)
  } catch {
    throw imageError('IMAGE_NOT_FOUND', rawPath)
  }
  if (!stat.isFile()) {
    throw imageError('IMAGE_UNSUPPORTED', '路径不是文件')
  }
  if (!ALLOWED_EXT.has(extname(real).toLowerCase())) {
    throw imageError('IMAGE_UNSUPPORTED', `扩展名 ${extname(real) || '（无）'} 不在允许列表内`)
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    throw imageError('IMAGE_TOO_LARGE', `${(stat.size / 1024 / 1024).toFixed(1)}MB > 20MB`)
  }
  return real
}

/**
 * nativeImage.toBitmap() 返回 BGRA（预乘 alpha）。这里转灰度：
 * 对透明像素按白底合成，避免带 alpha 的截图边缘被判成墨迹。
 */
function toGrayBitmap(image: Electron.NativeImage): GrayBitmap {
  const size = image.getSize()
  const width = size.width
  const height = size.height
  if (width <= 0 || height <= 0) {
    throw imageError('IMAGE_DECODE_FAILED', '图片尺寸为 0')
  }
  // 像素上限在 toBitmap() 之前拦截：解码分配内存前就拒绝，而不是分配完再溢出
  assertImageSizeWithinLimit(width, height)
  const bgra = image.toBitmap()
  const expected = width * height * 4
  if (bgra.length < expected) {
    throw imageError('IMAGE_DECODE_FAILED', `位图数据长度异常：${bgra.length} < ${expected}`)
  }
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const b = bgra[p]!
    const g = bgra[p + 1]!
    const r = bgra[p + 2]!
    const a = bgra[p + 3]! / 255
    // 亮度（ITU-R BT.601），再按 alpha 与白底合成
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    gray[i] = Math.round(luma * a + 255 * (1 - a))
  }
  return { width, height, gray }
}

export function createImageReader(deps: { logger?: Pick<Logger, 'info' | 'warn' | 'error' | 'debug'> } = {}): ImageReaderBridge {
  return {
    async readGrayImage(filePath: string): Promise<GrayBitmap> {
      const real = validateImagePath(filePath)
      const image = nativeImage.createFromPath(real)
      if (image.isEmpty()) {
        throw imageError('IMAGE_DECODE_FAILED', `无法解码：${real}`)
      }
      const bitmap = toGrayBitmap(image)
      deps.logger?.info('参考图已解码', {
        path: real,
        width: bitmap.width,
        height: bitmap.height,
      })
      return bitmap
    },

    async decodePngBase64(base64: string): Promise<GrayBitmap> {
      // Buffer.from 前 先按 base64 长度估算解码字节数：超大载荷直接拒绝，不进解码分配
      if (estimateBase64Bytes(base64) > MAX_IMAGE_BYTES) {
        throw imageError('IMAGE_TOO_LARGE', `${estimateBase64Bytes(base64).toFixed(0)} 字节（估算） > 20MB`)
      }
      let buffer: Buffer
      try {
        buffer = Buffer.from(base64, 'base64')
      } catch {
        throw imageError('IMAGE_DECODE_FAILED', 'base64 内容非法')
      }
      if (buffer.length === 0) {
        throw imageError('IMAGE_DECODE_FAILED', 'base64 内容为空')
      }
      const image = nativeImage.createFromBuffer(buffer)
      if (image.isEmpty()) {
        throw imageError('IMAGE_DECODE_FAILED', '无法解码渲染结果')
      }
      return toGrayBitmap(image)
    },
  }
}
