// image-reader 单元测试：像素上限必须在 nativeImage 解码之前生效（容器头判定），
// 头读不出尺寸时仍由解码后的 toGrayBitmap 兜底。electron 与文件系统分离：electron 全替身。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const native = vi.hoisted(() => ({
  createFromBuffer: vi.fn(),
  createFromPath: vi.fn(),
}))

vi.mock('electron', () => ({ nativeImage: native }))

function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

/** 解码成功后的假 NativeImage：BGRA 全白 */
function fakeNativeImage(width: number, height: number): unknown {
  return {
    isEmpty: () => false,
    getSize: () => ({ width, height }),
    toBitmap: () => Buffer.alloc(width * height * 4, 255),
  }
}

function codeOf(err: unknown): string | undefined {
  return err && typeof err === 'object' ? (err as { code?: string }).code : undefined
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'worm-image-reader-'))
  native.createFromBuffer.mockReset()
  native.createFromPath.mockReset()
})

async function reader(): Promise<ReturnType<typeof import('./image-reader.js').createImageReader>> {
  const { createImageReader } = await import('./image-reader.js')
  return createImageReader()
}

describe('readGrayImage', () => {
  it('12000×12000 PNG 在解码前被拒：不触发 nativeImage', async () => {
    const file = join(dir, 'huge.png')
    writeFileSync(file, pngHeader(12000, 12000))
    const err = await reader().then(r => r.readGrayImage(file)).catch(e => e)
    expect(codeOf(err)).toBe('IMAGE_TOO_LARGE')
    expect(err.message).toContain('12000')
    expect(native.createFromBuffer).not.toHaveBeenCalled()
    expect(native.createFromPath).not.toHaveBeenCalled()
  })

  it('头尺寸合规时走 createFromBuffer 并返回灰度位图', async () => {
    const file = join(dir, 'small.png')
    writeFileSync(file, pngHeader(8, 4))
    native.createFromBuffer.mockReturnValue(fakeNativeImage(8, 4))
    const bitmap = await reader().then(r => r.readGrayImage(file))
    expect(native.createFromBuffer).toHaveBeenCalledTimes(1)
    expect(bitmap).toMatchObject({ width: 8, height: 4 })
    expect(bitmap.gray.length).toBe(32)
  })

  it('未知容器（头读不出尺寸）仍由解码后兜底拒绝超限', async () => {
    const file = join(dir, 'weird.png')
    writeFileSync(file, Buffer.from('GIF89a' + '.'.repeat(40)))
    native.createFromBuffer.mockReturnValue(fakeNativeImage(9000, 9000))
    const err = await reader().then(r => r.readGrayImage(file)).catch(e => e)
    expect(codeOf(err)).toBe('IMAGE_TOO_LARGE')
  })

  it('文件不存在报 IMAGE_NOT_FOUND', async () => {
    const err = await reader().then(r => r.readGrayImage(join(dir, 'nope.png'))).catch(e => e)
    expect(codeOf(err)).toBe('IMAGE_NOT_FOUND')
  })

  it('相对路径与不允许的扩展名报 IMAGE_UNSUPPORTED', async () => {
    const rel = await reader().then(r => r.readGrayImage('relative.png')).catch(e => e)
    expect(codeOf(rel)).toBe('IMAGE_UNSUPPORTED')

    const tiff = join(dir, 'scan.tiff')
    writeFileSync(tiff, pngHeader(8, 8))
    const bad = await reader().then(r => r.readGrayImage(tiff)).catch(e => e)
    expect(codeOf(bad)).toBe('IMAGE_UNSUPPORTED')
  })
})

describe('decodePngBase64', () => {
  it('12000×12000 PNG 载荷在解码前被拒：不触发 nativeImage', async () => {
    const base64 = pngHeader(12000, 12000).toString('base64')
    const err = await reader().then(r => r.decodePngBase64(base64)).catch(e => e)
    expect(codeOf(err)).toBe('IMAGE_TOO_LARGE')
    expect(native.createFromBuffer).not.toHaveBeenCalled()
  })

  it('载荷过大（base64 估算 > 20MB）直接拒绝', async () => {
    const err = await reader().then(r => r.decodePngBase64('A'.repeat(30 * 1024 * 1024))).catch(e => e)
    expect(codeOf(err)).toBe('IMAGE_TOO_LARGE')
    expect(native.createFromBuffer).not.toHaveBeenCalled()
  })

  it('小载荷正常解码', async () => {
    native.createFromBuffer.mockReturnValue(fakeNativeImage(16, 16))
    const bitmap = await reader().then(r => r.decodePngBase64(pngHeader(16, 16).toString('base64')))
    expect(bitmap).toMatchObject({ width: 16, height: 16 })
  })
})
