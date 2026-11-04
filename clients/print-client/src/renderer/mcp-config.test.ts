import { describe, expect, it } from 'vitest'
import { buildMcpConfigJson, MCP_SERVICE_NAME, resolveMcpConnectionView } from './mcp-config'

describe('buildMcpConfigJson', () => {
  it('产出可直接粘贴的完整 mcpServers 配置块', () => {
    const parsed = JSON.parse(buildMcpConfigJson('http://127.0.0.1:17521/mcp', 'tok-abc'))
    expect(parsed).toEqual({
      mcpServers: {
        'worm-vue3-print': {
          url: 'http://127.0.0.1:17521/mcp',
          headers: { Authorization: 'Bearer tok-abc' },
        },
      },
    })
  })

  it('服务名称固定，URL 与 Bearer token 随实际状态变化', () => {
    expect(MCP_SERVICE_NAME).toBe('worm-vue3-print')
    const parsed = JSON.parse(buildMcpConfigJson('http://127.0.0.1:17522/mcp', 'tok-xyz'))
    expect(Object.keys(parsed.mcpServers)).toEqual(['worm-vue3-print'])
    expect(parsed.mcpServers['worm-vue3-print'].url).toBe('http://127.0.0.1:17522/mcp')
    expect(parsed.mcpServers['worm-vue3-print'].headers.Authorization).toBe('Bearer tok-xyz')
  })
})

describe('resolveMcpConnectionView', () => {
  it.each([
    { draftEnabled: false, savedEnabled: false, expected: 'disabled' },
    { draftEnabled: true, savedEnabled: false, expected: 'save-required' },
    { draftEnabled: true, savedEnabled: true, expected: 'details' },
    { draftEnabled: false, savedEnabled: true, expected: 'details' },
  ])(
    '草稿开关=$draftEnabled、已保存开关=$savedEnabled 时返回 $expected',
    ({ draftEnabled, savedEnabled, expected }) => {
      expect(resolveMcpConnectionView(draftEnabled, savedEnabled)).toBe(expected)
    },
  )
})
