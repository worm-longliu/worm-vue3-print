# worm-vue3-print 使用技能

仓库只分发以下三个技能；`.agents/skills/` 中的项目开发技能不属于分发范围。

| 技能 | 用途 |
| --- | --- |
| `worm-vue3-print-integration` | Vue 3 + canvas/core 集成、三条打印链路、宿主 MCP 实时画布 |
| `worm-vue3-print-common` | Vue 2.7、React、jQuery/原生宿主、Custom Element、宿主 MCP |
| `worm-vue3-print-mcp` | 桌面 MCP、实时画布模板生成与校验 |

## npx 安装

每次必须且只能指定一个技能。默认从官方 GitHub 仓库读取 `skills/<技能名>`，安装到当前项目的 `.agents/skills/`：

```bash
npx @worm-vue3-print/skills worm-vue3-print-integration
npx @worm-vue3-print/skills worm-vue3-print-common
npx @worm-vue3-print/skills worm-vue3-print-mcp
```

指定仓库、分支/tag 或技能父目录：

```bash
npx @worm-vue3-print/skills worm-vue3-print-mcp \
  --repo https://github.com/worm-longliu/worm-vue3-print.git \
  --ref v1.4.6 \
  --dir /path/to/project/.agents/skills
```

`--dir` 是技能父目录，不是包含技能名的最终目录。目标已存在时默认失败，确认替换后使用 `--force`。安装器不会修改 MCP、Codex 或其他 Agent 配置。
