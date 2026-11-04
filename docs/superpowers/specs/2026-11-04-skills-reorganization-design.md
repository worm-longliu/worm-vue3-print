# 技能体系重整与 npx 安装器设计

日期：2026-11-04

## 目标

将仓库面向用户的技能收敛为 Vue 3 集成、common 集成、MCP 协作三个技能，并提供独立的 `@worm-vue3-print/skills` 包，使用户能通过 `npx` 从指定 Git 仓库安装指定技能到指定目录或项目默认目录。

项目开发技能 `.agents/skills/experts` 维持现状，不更新、不合并、不分发，也不能通过新安装器安装。

## 已确认的决策

1. 默认安装目录为当前工作目录的 `.agents/skills`。
2. 每次必须且只能显式指定一个技能名称，不提供默认安装集。
3. 远程来源为 Git 仓库链接，不支持单目录 URL 或压缩包 URL。
4. 采用独立 npm 包，不把安装能力并入 `core`，也不依赖第三方技能安装器。
5. 只分发 `skills/` 下的三个使用技能；原 `print-template-json` 合并后删除，不保留兼容别名。
6. `@worm-vue3-print/skills` 版本随主线，当前版本为 `1.4.4`；实际发布由用户手动执行。

## 技能目录

最终可分发技能：

| 技能 | 目录 | 内容 |
| --- | --- | --- |
| Vue 3 集成 | `skills/worm-vue3-print-integration` | Vue 3 + canvas/core 集成、宿主模板管理、浏览器打印、服务端 PDF、静默打印与故障排查 |
| common 集成 | `skills/worm-vue3-print-common` | Vue 2.7、React、jQuery/原生宿主、浏览器直挂、打印链路与故障排查 |
| MCP 协作 | `skills/worm-vue3-print-mcp` | stdio/桌面 MCP 配置与调用流程、模板生成规范、布局配方、示例、Python 构建与校验脚本 |

新增 `skills/README.md`，只介绍上述三个技能及其安装命令。

### Vue 3 集成技能

- 保留现有宿主集成参考文档，移除已经移交 common 技能的跨框架内容。
- 以当前代码为准核对 `PrintDesigner`、`PrintHtmlPreview` 的 props、事件和 expose，包括 `show-help`、`validateTemplate()`。
- 安装说明要求 core 与 canvas 使用相同版本，不用容易过期的“当前发布版本”硬编码代替版本核对。
- 只保留 Vue 3 宿主需要的业务字段、模板保存与校验说明，不复制 MCP 技能的完整模板生成教程。

### common 集成技能

- 以 `packages/print-common/README.md`、`PARITY.md` 和 `demo-common/apps/*` 为事实来源。
- 覆盖 NPM、Vue 2.7、React、jQuery/无打包器浏览器直挂、打印和故障排查。
- 明确 Custom Element 的 property/attribute 注入、`CustomEvent.detail`、事件解绑、块级宽高和 `validateTemplate()`。
- 明确 Shadow DOM 与 light DOM 的样式差异，以及 `@worm-vue3-print/common/browser`、`./style.css` 公开子路径。
- 保留“实验性、不建议生产；Vue 3 优先 canvas”的约束。

### MCP 协作技能

- 将原 `print-template-json` 的 `references/`、`scripts/`、`assets/` 移入本技能，保持脚本相对路径可用。
- MCP 可用时采用：能力速查 → 草稿或修改 → 契约校验 → 静态版面体检 → 按需真实 PDF 预览。
- MCP 不可用时使用技能内置 Python 脚本生成和校验模板，不虚构工具调用结果。
- 分别说明 stdio 六工具与桌面客户端八工具，不把 stdio 的 `print_render_preview` 或 `templatePath` 错写到桌面 HTTP 能力中。
- 大模板在 stdio 下优先传 `templatePath`；桌面 HTTP 只接受其实际 Schema。
- 实时画布按 `print_list_open_templates` → `print_get_open_template` → 修改 → `print_apply_open_template` 执行。
- 写回必须携带读取时的 `baseRevision`；遇到 `REVISION_CONFLICT` 必须重新读取快照，不自动覆盖用户的新修改。
- MCP 不调用模型、不持有模型密钥；工具循环归宿主 Agent。

## 安装器

新增 `packages/print-skills` 工作区包：

- npm 包名：`@worm-vue3-print/skills`
- bin：`worm-vue3-print-skills`
- Node.js：`>=20`
- 运行时依赖：无
- 外部命令：本机 `git`
- 默认仓库：`https://github.com/worm-longliu/worm-vue3-print.git`

命令：

```bash
npx @worm-vue3-print/skills <skill-name> \
  [--repo <git-url>] [--ref <branch-or-tag>] \
  [--dir <target-directory>] [--force]
```

示例：

```bash
npx @worm-vue3-print/skills worm-vue3-print-integration
npx @worm-vue3-print/skills worm-vue3-print-common --dir /path/to/.agents/skills
npx @worm-vue3-print/skills worm-vue3-print-mcp \
  --repo https://github.com/worm-longliu/worm-vue3-print.git --ref v1.4.4
```

### 执行流程

1. 解析参数，要求恰好一个位置参数；支持 `--help`。
2. 在系统临时目录浅克隆指定仓库；有 `--ref` 时检出对应 branch 或 tag。
3. 只查找仓库根目录下的 `skills/<skill-name>`，不扫描 `.agents/skills/`。
4. 校验技能目录、`SKILL.md`、frontmatter `name` 和符号链接，拒绝路径穿越与不完整技能。
5. 将技能完整复制到目标父目录下的临时位置，再原子替换最终目录。
6. 默认目标为 `<cwd>/.agents/skills/<skill-name>`；`--dir` 指定技能父目录，不是技能本身的最终目录。
7. 目标已存在时默认失败，只有 `--force` 才替换。
8. 输出实际仓库、ref 和安装路径；不自动修改 MCP、Codex 或其他 Agent 配置。
9. 任一步骤失败均清理临时目录，不留下半份技能。

### 错误处理

- 参数错误显示简短用法并以非零码退出。
- Git 不存在、克隆失败、ref 不存在时保留可行动的原始错误摘要。
- 未找到技能时列出仓库中可安装的技能名称。
- 不跟随技能目录中的符号链接，避免将仓库外内容复制到用户目录。
- `--force` 只替换同名技能目录，不清空技能父目录。

## stdio 事实核验

2026-11-04 已对当前工作区执行真实验证：

- `packages/print-mcp/src/stdio.ts` 使用 `StdioServerTransport`。
- 通过 `initialize` 握手返回 `worm-vue3-print@1.4.4` 和 tools 能力。
- `tools/list` 返回 `print_element_kinds`、`print_validate_template`、`print_check_expression`、`print_inspect_layout`、`print_draft_template`、`print_render_preview`。
- 前五个纯计算工具均通过 stdio 调用成功。
- `print_render_preview` 可正常分发；未配置 `PRINT_RENDER_BASE_URL` 时返回预期降级错误。
- `npm test -w @worm-vue3-print/mcp`：5 个测试文件、63 项测试通过。

技能文档以这些真实结果为准，不把真实 PDF 未配置时的降级描述成渲染成功。

## 测试设计

### 安装器

采用先写失败测试再实现的方式，以临时 Git 仓库执行端到端测试：

- 默认目录、`--dir`、`--repo`、`--ref`。
- 缺少技能名、多个位置参数、未知选项、未知技能、非法技能名。
- 已存在目录失败及 `--force` 成功替换。
- 缺少 `SKILL.md`、frontmatter 名称不匹配、符号链接和路径穿越。
- `.agents/skills/experts` 不可安装。
- 克隆或安装失败不留下目标残留。

### 技能

- 校验三个技能的 frontmatter、相对链接和引用资源。
- 对迁移后的示例执行 Python 构建和校验脚本。
- 检查旧 `print-template-json` 路径引用已更新。
- 重跑 stdio 握手、工具列表和受影响的 MCP 测试。

### 项目回归

- 安装器定向测试与 npm pack dry-run。
- `npm run build`。
- 按改动范围运行相关 workspace 测试，并执行项目要求的测试入口。
- `git diff` 检查包边界、文档一致性和无关改动；不触碰已有条码文件修改。

## 发布与文档同步

- 根 `build` / `test` 纳入 skills 包的语法检查与测试。
- 新增 `publish:skills` 和 dry-run 入口。
- 手动 npm 发布工作流校验 skills 包版本与 tag，并发布该包。
- 更新根 README、MCP 指南及 `AGENTS.md` 中的技能目录、安装方式和正式发包清单。
- common 的独立发布链路和 dist-tag 规则不变。

## 非目标

- 不修改 `core`、`canvas`、`common`、`contract`、`mcp` 的运行时代码。
- 不修改 `.agents/skills/experts` 及其角色包、脚本。
- 不自动配置 Claude、Cursor、Codex 或其他 MCP 客户端。
- 不发布 private 的 `@worm-vue3-print/mcp`。
- 不保留 `print-template-json` 兼容技能或安装别名。
- 不在本次任务中实际执行 npm 发布。
