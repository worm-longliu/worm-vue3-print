/** core 统一失败分类；各端只做映射，不新增协议码 */
export type PrintFailureCode =
  | 'INVALID_PAPER'
  | 'MEASURE_FAILED'
  | 'RENDER_TIMEOUT'
  | 'PDF_FAILED'
  | 'SCREENSHOT_FAILED'
  | 'UNSUPPORTED_RUNTIME'
  | 'INTERNAL'

export class PrintFailure extends Error {
  readonly code: PrintFailureCode
  readonly cause?: unknown

  constructor(code: PrintFailureCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'PrintFailure'
    this.code = code
    this.cause = cause
  }
}

export function toPrintFailure(err: unknown, fallbackCode: PrintFailureCode, context: string): PrintFailure {
  if (err instanceof PrintFailure) return err
  const detail = err instanceof Error ? err.message : String(err)
  return new PrintFailure(fallbackCode, `${context}：${detail}`, err)
}

export async function withTimeout<T>(
  task: Promise<T>,
  ms: number,
  code: PrintFailureCode,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new PrintFailure(code, message)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
