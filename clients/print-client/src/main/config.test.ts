import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConfigStore, DEFAULT_CONFIG, parseConfig, generatePairingToken } from './config.js'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wpc-config-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('parseConfig', () => {
  it('空值返回默认配置', () => {
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG)
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(parseConfig('x')).toEqual(DEFAULT_CONFIG)
  })

  it('合法字段合并，非法/越界字段回退默认', () => {
    const cfg = parseConfig({
      port: 9090,
      autoStart: true,
      logLevel: 'debug',
      securityEnabled: true,
      allowedOrigins: ['https://a.com'],
      pairingToken: 'tok',
    })
    expect(cfg).toMatchObject({
      port: 9090,
      autoStart: true,
      logLevel: 'debug',
      securityEnabled: true,
    })
    expect(cfg.allowedOrigins).toEqual(['https://a.com'])

    const fallback = parseConfig({
      port: 80,
      logLevel: 'verbose',
      autoStart: 'yes',
      allowedOrigins: ['x', 12],
    })
    expect(fallback.port).toBe(DEFAULT_CONFIG.port)
    expect(fallback.logLevel).toBe('info')
    expect(fallback.autoStart).toBe(false)
    expect(fallback.allowedOrigins).toEqual([])
  })
})

describe('generatePairingToken', () => {
  it('返回 64 位十六进制且两次不同', () => {
    const a = generatePairingToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(generatePairingToken())
  })
})

describe('ConfigStore', () => {
  it('文件不存在时 load 返回默认值并落盘', () => {
    const file = join(dir, 'config.json')
    const store = new ConfigStore(file)
    expect(store.load()).toEqual(DEFAULT_CONFIG)
    expect(existsSync(file)).toBe(true)
  })

  it('update 合并并持久化，新实例可读到', () => {
    const file = join(dir, 'config.json')
    const store = new ConfigStore(file)
    store.load()
    store.update({ port: 18000, autoStart: true })
    const again = new ConfigStore(file)
    expect(again.load()).toMatchObject({ port: 18000, autoStart: true })
    // 文件是合法 JSON
    expect(() => JSON.parse(readFileSync(file, 'utf-8'))).not.toThrow()
  })
})
