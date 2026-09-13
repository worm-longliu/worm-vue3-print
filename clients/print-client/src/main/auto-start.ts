// 开机自启：仅在目标状态与当前状态不一致时调用系统接口。
// 未签名/未授权的 macOS 环境调用 setLoginItemSettings 会打印
// 「Unable to set login item: Operation not permitted」，无谓的重复调用只产生噪声日志。

/** 只依赖用到的两个 API，便于单测注入假实现 */
export interface LoginItemHost {
  getLoginItemSettings: () => { openAtLogin: boolean }
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void
}

export interface AutoStartLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * 按需应用开机自启设置；状态已一致时不做任何调用。
 * @returns 是否实际调用了系统接口
 */
export function applyAutoStart(
  host: LoginItemHost,
  enabled: boolean,
  logger?: AutoStartLogger,
): boolean {
  let current = false
  try {
    current = host.getLoginItemSettings().openAtLogin === true
  } catch (e) {
    logger?.warn('读取开机自启状态失败', { error: (e as Error).message })
  }
  if (current === enabled) return false
  try {
    host.setLoginItemSettings({ openAtLogin: enabled })
    return true
  } catch (e) {
    logger?.warn('设置开机自启失败（未签名应用可能无权限，可在「系统设置 → 通用 → 登录项」手动添加）', {
      error: (e as Error).message,
    })
    return false
  }
}
