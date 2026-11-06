// 图片像素上限：解码进灰度位图前先按元数据拦截，避免大图把 toBitmap() 撑爆内存。
// 纯函数 + 常量，不依赖 Electron，供主进程与单测共用。

/** 单个图片文件上限（字节）：路径读图与 base64 解码共用（原 image-reader 的 20MB 门） */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** 长边上限（px）：与 MCP 错误文案「长边 4000px」保持一致 */
export const MAX_IMAGE_SIDE = 4000

/** 总像素上限：4000×5000 已超此限；A4@300dpi（2480×3508 ≈ 8.7M）以内不受影响 */
export const MAX_IMAGE_PIXELS = 20_000_000

export function imageTooLargeError(width: number, height: number): Error {
  const err = new Error(
    `${width}×${height}px 超出上限（长边 ≤ ${MAX_IMAGE_SIDE}px 且总像素 ≤ ${MAX_IMAGE_PIXELS}），`
      + `请等比缩小到长边 ${MAX_IMAGE_SIDE}px 以内再试`,
  )
  ;(err as Error & { code: string }).code = 'IMAGE_TOO_LARGE'
  return err
}

/** 校验解码出的像素尺寸；超限抛带 IMAGE_TOO_LARGE 的错误，通过则原样返回 */
export function assertImageSizeWithinLimit(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const err = new Error('图片尺寸非法') as Error & { code: string }
    err.code = 'IMAGE_DECODE_FAILED'
    throw err
  }
  if (Math.max(width, height) > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    throw imageTooLargeError(width, height)
  }
}

/** base64 解码后字节数的估算：ceil(len*3/4)（不含 data: 前缀与 padding 修正，按保守上限用） */
export function estimateBase64Bytes(base64: string): number {
  return Math.ceil(base64.length * 3 / 4)
}
