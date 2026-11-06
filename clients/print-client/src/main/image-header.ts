// 图片头解析：不解码像素，只从容器头读宽高。
// 像素上限必须在真正解码之前生效——12000×12000 的 PNG 压缩后可能只有几百 KB，
// 但 nativeImage 解码会一次性分配数百 MB。这里读出头尺寸就能先把这类载荷拒掉。
// 读不出尺寸（未知容器/截断/罕见编码）时返回 undefined，由调用方走解码后的兜底检查。

export type ImageFormat = 'png' | 'jpeg' | 'bmp' | 'webp' | 'unknown'

export interface ImageDimensions {
  width: number
  height: number
  format: ImageFormat
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** SOF 标记：SOF0~SOF3 / SOF5~SOF7 / SOF9~SOF11 / SOF13~SOF15（SOF4/DJPeg 与渐进差分同样带宽高） */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

/** 无长度段的独立标记（SOI/EOI/RSTn/TEM） */
function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)
}

function isPositiveSize(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
}

function readPng(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') return undefined
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  return isPositiveSize(width, height) ? { width, height, format: 'png' } : undefined
}

function readJpeg(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined
  let p = 2
  // 段头需要 marker(2) + length(2) + SOF 的 precision/height/width(5)
  while (p + 9 < buffer.length) {
    if (buffer[p] !== 0xff) {
      p++
      continue
    }
    const marker = buffer[p + 1]!
    if (marker === 0xff) {
      p++
      continue
    }
    if (isStandaloneJpegMarker(marker)) {
      p += 2
      continue
    }
    const segmentLength = buffer.readUInt16BE(p + 2)
    if (segmentLength < 2) return undefined
    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = buffer.readUInt16BE(p + 5)
      const width = buffer.readUInt16BE(p + 7)
      return isPositiveSize(width, height) ? { width, height, format: 'jpeg' } : undefined
    }
    p += 2 + segmentLength
  }
  return undefined
}

function readBmp(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 26 || buffer[0] !== 0x42 || buffer[1] !== 0x4d) return undefined
  const width = buffer.readInt32LE(18)
  const height = Math.abs(buffer.readInt32LE(22))
  return isPositiveSize(width, height) ? { width, height, format: 'bmp' } : undefined
}

function readWebp(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 20) return undefined
  if (buffer.toString('latin1', 0, 4) !== 'RIFF') return undefined
  if (buffer.toString('latin1', 8, 12) !== 'WEBP') return undefined
  const chunk = buffer.toString('latin1', 12, 16)
  const payload = 20
  if (chunk === 'VP8X') {
    if (buffer.length < payload + 10) return undefined
    const width = buffer.readUIntLE(payload + 4, 3) + 1
    const height = buffer.readUIntLE(payload + 7, 3) + 1
    return isPositiveSize(width, height) ? { width, height, format: 'webp' } : undefined
  }
  if (chunk === 'VP8L') {
    if (buffer.length < payload + 5 || buffer[payload] !== 0x2f) return undefined
    const bits = buffer.readUInt32LE(payload + 1)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >>> 14) & 0x3fff) + 1
    return isPositiveSize(width, height) ? { width, height, format: 'webp' } : undefined
  }
  if (chunk === 'VP8 ') {
    // 有损：3 字节帧标记 + 3 字节起始码 0x9d 0x01 0x2a + 各 14 bit 宽/高
    if (buffer.length < payload + 10) return undefined
    if (buffer[payload + 3] !== 0x9d || buffer[payload + 4] !== 0x01 || buffer[payload + 5] !== 0x2a) {
      return undefined
    }
    const width = buffer.readUInt16LE(payload + 6) & 0x3fff
    const height = buffer.readUInt16LE(payload + 8) & 0x3fff
    return isPositiveSize(width, height) ? { width, height, format: 'webp' } : undefined
  }
  return undefined
}

/**
 * 从图片字节读出头尺寸。
 * PNG / JPEG / BMP / WebP 命中且尺寸有效时返回，其余（含截断、异常容器）返回 undefined。
 */
export function readImageDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return undefined
  return readPng(buffer) ?? readJpeg(buffer) ?? readBmp(buffer) ?? readWebp(buffer)
}
