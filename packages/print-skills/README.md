# @worm-vue3-print/skills

从 Git 仓库安装一个 worm-vue3-print 使用技能。默认读取官方仓库的 `skills/` 目录，安装到当前项目的 `.agents/skills/`。

```bash
npx @worm-vue3-print/skills worm-vue3-print-integration
npx @worm-vue3-print/skills worm-vue3-print-common --dir /path/to/.agents/skills
npx @worm-vue3-print/skills worm-vue3-print-mcp --ref v1.4.6 --force
```

每次必须指定一个技能。`--repo` 指定 Git 仓库，`--ref` 指定分支或 tag，`--dir` 指定技能父目录；目标已存在时只有 `--force` 才替换。本包不会安装 `.agents/skills/` 中的项目开发技能。
