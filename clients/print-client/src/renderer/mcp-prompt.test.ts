import { describe, expect, it } from 'vitest'
import * as mcpConfig from './mcp-config'

/** 当前客户端 MCP 的完整工具清单：与 local-server 的 tools/list 及 print-client/README 保持一致 */
const MCP_TOOL_NAMES = [
  // 纯计算
  'print_element_kinds',
  'print_draft_template',
  'print_validate_template',
  'print_check_expression',
  'print_inspect_layout',
  // 视觉与测量（本地渲染出图；模板引用的远程图片/字体可能触网）
  'print_preview_template',
  'print_analyze_reference_image',
  'print_compare_with_reference',
  // 模板会话（读写实时画布）
  'print_list_open_templates',
  'print_get_open_template',
  'print_patch_open_template',
  'print_apply_open_template',
] as const

const MCP_TOOL_COUNT = MCP_TOOL_NAMES.length // 12

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

  it('工具清单锁定为 12 个工具：名字齐全、数量声明为 12', () => {
    const prompt = mcpConfig.buildMcpAgentPrompt(
      'http://127.0.0.1:17520/mcp',
      'tok-tools',
      'mcp',
    )

    expect(MCP_TOOL_COUNT).toBe(12)
    // 12 个工具名一个不少
    for (const name of MCP_TOOL_NAMES) {
      expect(name.startsWith('print_'), `${name} 应是 print_ 前缀的真实工具名`).toBe(true)
      expect(prompt).toContain(name)
    }
    // 数量声明与清单一致，且没留旧数字
    expect(prompt).toContain(`共 ${MCP_TOOL_COUNT} 个工具`)
    expect(prompt).not.toContain('共 9 个工具')
    expect(prompt).not.toContain('共 11 个工具')
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
