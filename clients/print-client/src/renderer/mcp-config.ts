// 生成可直接粘贴进 MCP 客户端配置文件的完整 mcpServers 配置块。
// 服务名称与 docs/中文/指南/AI接入.md 的示例一致；它只是配置文件里的 key，
// 与 MCP 协议层 serverInfo.name（worm-vue3-print-client）不是同一个概念。
export const MCP_SERVICE_NAME = 'worm-vue3-print'

/** 连接区只跟随已保存开关；草稿开启但未保存时先提示保存。 */
export function resolveMcpConnectionView(
  draftEnabled: boolean,
  savedEnabled: boolean,
): 'disabled' | 'save-required' | 'details' {
  if (savedEnabled) return 'details'
  return draftEnabled ? 'save-required' : 'disabled'
}

export function buildMcpConfigJson(url: string, pairingToken: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVICE_NAME]: {
          url,
          headers: { Authorization: `Bearer ${pairingToken}` },
        },
      },
    },
    null,
    2,
  )
}

export const MCP_PROMPT_SCENARIOS = [
  { id: 'mcp', label: '实时模板编辑', skills: ['worm-vue3-print-mcp'] },
  {
    id: 'vue3',
    label: 'Vue 3 项目接入',
    skills: ['worm-vue3-print-mcp', 'worm-vue3-print-integration'],
  },
  {
    id: 'common',
    label: 'Common 项目接入',
    skills: ['worm-vue3-print-mcp', 'worm-vue3-print-common'],
  },
] as const

export type McpPromptScenario = (typeof MCP_PROMPT_SCENARIOS)[number]['id']

export function buildMcpAgentPrompt(
  url: string,
  pairingToken: string,
  scenario: McpPromptScenario,
): string {
  const selected = MCP_PROMPT_SCENARIOS.find(item => item.id === scenario) ?? MCP_PROMPT_SCENARIOS[0]
  const configJson = buildMcpConfigJson(url, pairingToken)
  const installCommands = selected.skills
    .map(skill => `npx @worm-vue3-print/skills ${skill}`)
    .join('\n')
  const giteeInstallCommands = selected.skills
    .map(
      skill =>
        `npx @worm-vue3-print/skills ${skill} --repo https://gitee.com/liulong_oschina/worm-vue3-print.git`,
    )
    .join('\n')

  return `请为当前项目接入 worm-vue3-print 桌面客户端 MCP，并安装下面列出的官方 skills。

## MCP 服务信息

MCP 服务已经由本机桌面客户端提供，不要再安装或启动其他 MCP 服务进程。请将以下服务合并到当前 AI Agent 的 MCP 配置中：

${configJson}

- 传输方式：Streamable HTTP
- 服务名称：${MCP_SERVICE_NAME}
- 服务地址：${url}
- 鉴权请求头：Authorization: Bearer ${pairingToken}

## 安装 skills

在当前项目中逐条执行以下命令：

\`\`\`bash
${installCommands}
\`\`\`

如果默认命令因 GitHub 访问受限、网络超时或克隆失败而安装失败，可以改用 Gitee 镜像。只对安装失败的技能逐条执行对应的备用命令，不要重复安装或覆盖已经成功的技能：

\`\`\`bash
${giteeInstallCommands}
\`\`\`

默认安装到当前项目的 .agents/skills/。如果当前 Agent 使用其他项目级技能目录，请按其规则通过 --dir 指定目录，不要全局安装。目标技能已存在时先检查并告知我，未经确认不要使用 --force 覆盖。

## 执行要求

1. 优先使用当前 Agent 原生的 MCP 配置方式；不要猜测配置文件路径。保留现有 mcpServers 和其他配置，只新增或更新 ${MCP_SERVICE_NAME} 条目，不整段覆盖原配置。
2. 如果没有权限修改配置、当前环境不支持自动配置或命令执行失败，请如实说明，并给出我需要执行的准确步骤；不要声称已经安装成功。
3. 配置完成后按当前 Agent 的要求重载 MCP 连接；必须由我重启或重新打开会话时，明确告诉我。只有实际连接成功后，才能声称 MCP 已可用。
4. 重载后核对是否提供 print_element_kinds、print_draft_template、print_validate_template、print_check_expression、print_inspect_layout、print_preview_template、print_analyze_reference_image、print_compare_with_reference、print_list_open_templates、print_get_open_template、print_patch_open_template、print_apply_open_template 共 12 个工具。
5. 调用 print_list_open_templates 检查模板会话并报告数量。没有会话时，提示我打开已注册模板会话的浏览器设计器页面，不要把这种情况误判为 MCP 安装失败。
6. 最后列出实际修改的 MCP 配置位置、已安装的技能目录和真实验证结果；不要修改任何打印模板。`
}
