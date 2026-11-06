import { describe, expect, it } from 'vitest'
import * as mcpConfig from './mcp-config'

describe('buildMcpAgentPrompt', () => {
  it('把当前 MCP 服务地址和 Bearer 鉴权信息直接写入提示词', () => {
    expect(mcpConfig.buildMcpAgentPrompt).toBeTypeOf('function')
    const prompt = mcpConfig.buildMcpAgentPrompt(
      'http://127.0.0.1:17523/mcp',
      'tok-current',
      'mcp',
    )

    expect(prompt).toContain('"url": "http://127.0.0.1:17523/mcp"')
    expect(prompt).toContain('"Authorization": "Bearer tok-current"')
    expect(prompt).not.toContain('<设置页展示的配对 token>')
  })

  it.each([
    {
      scenario: 'mcp',
      commands: ['npx @worm-vue3-print/skills worm-vue3-print-mcp'],
      giteeCommands: [
        'npx @worm-vue3-print/skills worm-vue3-print-mcp --repo https://gitee.com/liulong_oschina/worm-vue3-print.git',
      ],
      excluded: ['worm-vue3-print-integration', 'worm-vue3-print-common'],
    },
    {
      scenario: 'vue3',
      commands: [
        'npx @worm-vue3-print/skills worm-vue3-print-mcp',
        'npx @worm-vue3-print/skills worm-vue3-print-integration',
      ],
      giteeCommands: [
        'npx @worm-vue3-print/skills worm-vue3-print-mcp --repo https://gitee.com/liulong_oschina/worm-vue3-print.git',
        'npx @worm-vue3-print/skills worm-vue3-print-integration --repo https://gitee.com/liulong_oschina/worm-vue3-print.git',
      ],
      excluded: ['npx @worm-vue3-print/skills worm-vue3-print-common'],
    },
    {
      scenario: 'common',
      commands: [
        'npx @worm-vue3-print/skills worm-vue3-print-mcp',
        'npx @worm-vue3-print/skills worm-vue3-print-common',
      ],
      giteeCommands: [
        'npx @worm-vue3-print/skills worm-vue3-print-mcp --repo https://gitee.com/liulong_oschina/worm-vue3-print.git',
        'npx @worm-vue3-print/skills worm-vue3-print-common --repo https://gitee.com/liulong_oschina/worm-vue3-print.git',
      ],
      excluded: ['npx @worm-vue3-print/skills worm-vue3-print-integration'],
    },
  ] as const)('$scenario 场景生成对应技能安装命令', ({ scenario, commands, giteeCommands, excluded }) => {
    const prompt = mcpConfig.buildMcpAgentPrompt(
      'http://127.0.0.1:17521/mcp',
      'tok-abc',
      scenario,
    )

    for (const command of commands) expect(prompt).toContain(command)
    for (const command of giteeCommands) expect(prompt).toContain(command)
    for (const skill of excluded) expect(prompt).not.toContain(skill)
  })
})
