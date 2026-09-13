// 生成托盘图标：16x16 单色打印机形状 PNG（模板图，适配 macOS 深色/浅色菜单栏）。
// 不引入二进制资源，运行时用 zlib 编码；Windows/Linux 复用同一张单色图。
import { nativeImage } from 'electron'
import { deflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'

const SIZE = 16

// 在 16x16 网格上绘制打印机：露出的纸张、机身、出纸口、底部托纸。
// 返回每个像素的不透明度（0=透明，255=主体，110=纸张浅灰）。
function drawAlpha(): Uint8Array {
  const a = new Uint8Array(SIZE * SIZE)
  const set = (x: number, y: number, v = 255) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) a[y * SIZE + x] = v
  }
  const rect = (x0: number, y0: number, x1: number, y1: number, v?: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v)
  }

  // 顶部露出的纸张（浅灰）
  rect(5, 2, 10, 7, 110)
  // 机身主体
  rect(2, 7, 13, 11)
  // 机身上沿进纸口留白（透出背景，模拟进纸缝）
  rect(4, 8, 11, 8, 0)
  // 右侧圆形按键
  set(11, 9)
  set(12, 9)
  // 底部托纸/出纸（浅灰）
  rect(4, 12, 11, 14, 110)
  // 托纸前沿
  rect(4, 14, 11, 14, 255)
  return a
}

function encodePng(alpha: Uint8Array): Buffer {
  // RGBA 行数据，每行前加 1 字节 filter(0)
  const stride = SIZE * 4
  const raw = Buffer.alloc((stride + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < SIZE; x++) {
      const v = alpha[y * SIZE + x]!
      const off = y * (stride + 1) + 1 + x * 4
      raw[off] = 0
      raw[off + 1] = 0
      raw[off + 2] = 0
      raw[off + 3] = v
    }
  }

  const crcTable = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })()
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // 其余压缩/滤波/隔行字节默认 0
  const idat = deflateSync(raw)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 创建托盘图标；macOS 标记为模板图以随菜单栏主题反色 */
export function createTrayIcon(): Electron.NativeImage {
  const img = nativeImage.createFromBuffer(encodePng(drawAlpha()))
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img
}
