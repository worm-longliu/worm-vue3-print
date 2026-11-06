// 通用超时包装：链路超时后先执行清理，再按给定错误码拒绝。
// 关键点：输掉的 promise 后续 rejection 会被吞掉 —— 否则 Promise.race 走超时分支后，
// 主链路稍后失败会把「未处理的 rejection」留给进程（Electron 主进程会弹日志/崩溃）。

export interface WithTimeoutOptions {
  /** 总超时（毫秒） */
  timeoutMs: number
  /** 超时错误码（进 err.code，供工具层映射可行动文案） */
  code: string
  /** 超时错误文案 */
  message: string
  /** 超时瞬间的清理（销毁窗口、删除临时文件等）；同步执行，抛错不会掩盖超时本身 */
  onTimeout?: () => void
}

export async function withTimeout<T>(run: () => Promise<T>, options: WithTimeoutOptions): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let timeoutHit = false
  const work = run()
  // 超时后主链路的结果不再有人消费：提前挂 catch，避免未处理 rejection
  void work.catch(() => {})
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timeoutHit = true
          try {
            options.onTimeout?.()
          } catch {
            // 清理失败不掩盖超时错误
          }
          const err = new Error(options.message) as Error & { code: string }
          err.code = options.code
          reject(err)
        }, options.timeoutMs)
      }),
    ])
  } catch (e) {
    // 已判定超时就不再让链路自身的错误冒出来（防双报）
    if (timeoutHit) {
      const err = new Error(options.message) as Error & { code: string }
      err.code = options.code
      throw err
    }
    throw e
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
