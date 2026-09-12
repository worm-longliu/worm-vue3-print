// 本地 WebSocket 访问控制。开关默认关闭；开启后校验配对 token，白名单非空时再校验 Origin。
import type { AppConfig } from './config.js'

type AccessConfig = Pick<AppConfig, 'securityEnabled' | 'allowedOrigins' | 'pairingToken'>

export type AccessResult =
  | { ok: true }
  | { ok: false; code: 'UNAUTHORIZED'; message: string }

export function checkAccess(
  input: { origin?: string; token?: string },
  cfg: AccessConfig,
): AccessResult {
  if (!cfg.securityEnabled) return { ok: true }

  if (!input.token || input.token !== cfg.pairingToken) {
    return { ok: false, code: 'UNAUTHORIZED', message: '配对 token 无效' }
  }
  if (cfg.allowedOrigins.length > 0) {
    if (!input.origin) {
      return { ok: false, code: 'UNAUTHORIZED', message: '缺少来源 Origin' }
    }
    if (!cfg.allowedOrigins.includes(input.origin)) {
      return { ok: false, code: 'UNAUTHORIZED', message: `来源 ${input.origin} 不在白名单` }
    }
  }
  return { ok: true }
}
