import { describe, it, expect } from 'vitest'
import { readImageDimensions } from './image-header.js'

/** 只含 IHDR 的假 PNG（没有真实像素数据，头足够） */
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  b.writeUInt8(8, 24) // bit depth
  b.writeUInt8(0, 25) // color type
  return b
}

/** SOI + APP0 + SOF 的假 JPEG 头 */
function jpegHeader(width: number, height: number, sofMarker = 0xc0): Buffer {
  const b = Buffer.alloc(40)
  b.writeUInt8(0xff, 0); b.writeUInt8(0xd8, 1)
  b.writeUInt8(0xff, 2); b.writeUInt8(0xe0, 3) // APP0
  b.writeUInt16BE(16, 4) // 段长度（含自身 2 字节）
  b.write('JFIF', 6, 'latin1')
  b.writeUInt8(0xff, 20); b.writeUInt8(sofMarker, 21)
  b.writeUInt16BE(11, 22) // SOF 长度：精度1 + 高2 + 宽2 + 分量数1 + 每分量3
  b.writeUInt8(8, 24) // 精度
  b.writeUInt16BE(height, 25)
  b.writeUInt16BE(width, 27)
  b.writeUInt8(1, 29) // 分量数
  return b
}

/** BITMAPINFOHEADER 口径的假 BMP 头（height 为负表示自上而下） */
function bmpHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(54)
  b.write('BM', 0, 'latin1')
  b.writeInt32LE(40, 14)
  b.writeInt32LE(width, 18)
  b.writeInt32LE(height, 22)
  b.writeUInt16LE(24, 28)
  return b
}

/** VP8X 扩展格式 WebP 头（画布尺寸 = 存储值 + 1） */
function webpHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(30)
  b.write('RIFF', 0, 'latin1')
  b.writeUInt32LE(6 + 8 + 10, 4)
  b.write('WEBP', 8, 'latin1')
  b.write('VP8X', 12, 'latin1')
  b.writeUInt32LE(18, 16)
  b.writeUIntLE(width - 1, 24, 3)
  b.writeUIntLE(height - 1, 27, 3)
  return b
}

describe('readImageDimensions：PNG', () => {
  it('从 IHDR 读大端宽高', () => {
    expect(readImageDimensions(pngHeader(1200, 800))).toEqual({ width: 1200, height: 800, format: 'png' })
  })

  it('12000×12000 在头层面就识别出来（无需真实像素数据）', () => {
    expect(readImageDimensions(pngHeader(12000, 12000))).toEqual({ width: 12000, height: 12000, format: 'png' })
  })

  it('签名 / IHDR / 长度不足时读不出', () => {
    const brokenSignature = pngHeader(100, 100)
    brokenSignature.writeUInt8(0x00, 1)
    expect(readImageDimensions(brokenSignature)).toBeUndefined()

    const notIhdr = pngHeader(100, 100)
    notIhdr.write('IEXt', 12, 'latin1')
    expect(readImageDimensions(notIhdr)).toBeUndefined()

    expect(readImageDimensions(pngHeader(100, 100).subarray(0, 20))).toBeUndefined()
  })
})

describe('readImageDimensions：JPEG', () => {
  const sofMarkers = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]

  it.each(sofMarkers)('SOF 标记 0x%s 读出宽高', (marker) => {
    expect(readImageDimensions(jpegHeader(1200, 800, marker))).toEqual({ width: 1200, height: 800, format: 'jpeg' })
  })

  it('跳过 APP0 段后再找 SOF；12000×12000 同样可读', () => {
    expect(readImageDimensions(jpegHeader(12000, 12000))).toEqual({ width: 12000, height: 12000, format: 'jpeg' })
  })

  it('SOS 之后不再扫描（找不到 SOF 时读不出）', () => {
    const noSof = jpegHeader(1200, 800)
    noSof.writeUInt8(0xda, 21)
    expect(readImageDimensions(noSof)).toBeUndefined()
  })

  it('非 JPEG 魔数读不出', () => {
    expect(readImageDimensions(Buffer.from([0xff, 0xd7, 0x00, 0x00]))).toBeUndefined()
  })
})

describe('readImageDimensions：BMP', () => {
  it('小端宽高，负高度取绝对值', () => {
    expect(readImageDimensions(bmpHeader(640, 480))).toEqual({ width: 640, height: 480, format: 'bmp' })
    expect(readImageDimensions(bmpHeader(640, -480))).toEqual({ width: 640, height: 480, format: 'bmp' })
  })

  it('12000×12000 也能从头识别', () => {
    expect(readImageDimensions(bmpHeader(12000, 12000))).toEqual({ width: 12000, height: 12000, format: 'bmp' })
  })

  it('非 BM 魔数读不出', () => {
    const b = bmpHeader(640, 480)
    b.write('XX', 0, 'latin1')
    expect(readImageDimensions(b)).toBeUndefined()
  })
})

describe('readImageDimensions：WebP', () => {
  it('VP8X 画布尺寸 = 存储值 + 1', () => {
    expect(readImageDimensions(webpHeader(1200, 800))).toEqual({ width: 1200, height: 800, format: 'webp' })
  })

  it('VP8L 无损头按 14bit 宽高解码', () => {
    const b = Buffer.alloc(25)
    b.write('RIFF', 0, 'latin1')
    b.write('WEBP', 8, 'latin1')
    b.write('VP8L', 12, 'latin1')
    b.writeUInt32LE(4, 16)
    b.writeUInt8(0x2f, 20)
    b.writeUInt32LE(1199 | (799 << 14), 21) // width-1 低 14bit，height-1 次 14bit
    expect(readImageDimensions(b)).toEqual({ width: 1200, height: 800, format: 'webp' })
  })

  it('VP8 有损头按起始码后的 14bit 宽高解码', () => {
    const b = Buffer.alloc(30)
    b.write('RIFF', 0, 'latin1')
    b.write('WEBP', 8, 'latin1')
    b.write('VP8 ', 12, 'latin1')
    b.writeUInt32LE(10, 16)
    b.writeUInt8(0x9d, 23); b.writeUInt8(0x01, 24); b.writeUInt8(0x2a, 25)
    b.writeUInt16LE(1200, 26)
    b.writeUInt16LE(800, 28)
    expect(readImageDimensions(b)).toEqual({ width: 1200, height: 800, format: 'webp' })
  })

  it('未知子块或魔数不符返回 undefined（由解码后兜底）', () => {
    const unknownChunk = webpHeader(1200, 800)
    unknownChunk.write('ANIM', 12, 'latin1')
    expect(readImageDimensions(unknownChunk)).toBeUndefined()

    const notWebp = webpHeader(1200, 800)
    notWebp.write('WTF!', 8, 'latin1')
    expect(readImageDimensions(notWebp)).toBeUndefined()
  })
})

describe('readImageDimensions：其他输入', () => {
  it('空/过短/随机字节返回 undefined', () => {
    expect(readImageDimensions(Buffer.alloc(0))).toBeUndefined()
    expect(readImageDimensions(Buffer.from([1, 2]))).toBeUndefined()
    expect(readImageDimensions(Buffer.from('GIF89a............'))).toBeUndefined()
  })
})
