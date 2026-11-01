import { describe, it, expect } from 'vitest'
import { readConfig } from '../config.js'
import { createPrintMcpServer } from '../server.js'

describe('readConfig', () => {
  it('未配置渲染服务时返回 null 而不是猜测地址', () => {
    expect(readConfig({})).toEqual({ renderBaseUrl: null, renderKey: null })
  })

  it('只接受 PRINT_RENDER_BASE_URL / RENDER_API_KEY 两个来源', () => {
    expect(readConfig({ PRINT_RENDER_BASE_URL: 'http://127.0.0.1:3001', RENDER_API_KEY: 'k' }))
      .toEqual({ renderBaseUrl: 'http://127.0.0.1:3001', renderKey: 'k' })
  })

  it('末尾斜杠被剥掉，空串按未配置处理', () => {
    expect(readConfig({ PRINT_RENDER_BASE_URL: 'http://127.0.0.1:3001/' }).renderBaseUrl)
      .toBe('http://127.0.0.1:3001')
    expect(readConfig({ PRINT_RENDER_BASE_URL: '   ' }).renderBaseUrl).toBeNull()
  })

  it('配置文件里不出现任何模型密钥相关读取', async () => {
    const source = await import('node:fs/promises')
      .then(m => m.readFile(new URL('../config.ts', import.meta.url), 'utf8'))
    expect(source).not.toMatch(/OPENAI|ANTHROPIC|MODEL_KEY|sk-/i)
  })
})

describe('createPrintMcpServer', () => {
  it('构造成功，stdio 之外的接线不抛异常', () => {
    expect(() => createPrintMcpServer()).not.toThrow()
  })
})
