# @worm-vue3-print/skills

> [!IMPORTANT]
> **【迁移公告】** `worm-vue3-print` 已进入维护状态，稳定主版本 1.5.x 已迁至 **worm-print-platform**（[Gitee](https://gitee.com/liulong_oschina/worm-print-platform) ｜ [GitHub](https://github.com/worm-longliu/worm-print-platform)）；npm scope `@worm-vue3-print/*` → `@worm-print-platform/*`。
> **本包迁移去向**：[`@worm-print-platform/skills`](https://www.npmjs.com/package/@worm-print-platform/skills)，npx 命令由 `@worm-vue3-print/skills` 换成 `@worm-print-platform/skills`，默认 GitHub→Gitee 双源，`--ref` / `--dir` / `--force` 参数不变。包名映射见[新仓迁移指南 §2](https://github.com/worm-longliu/worm-print-platform/blob/master/docs/migration-worm-vue3-print.md)。

从 Git 仓库安装一个 worm-vue3-print 使用技能。默认读取官方仓库的 `skills/` 目录，安装到当前项目的 `.agents/skills/`。

```bash
npx @worm-vue3-print/skills worm-vue3-print-integration
npx @worm-vue3-print/skills worm-vue3-print-common --dir /path/to/.agents/skills
npx @worm-vue3-print/skills worm-vue3-print-mcp --ref v1.4.8 --force
```

每次必须指定一个技能。`--repo` 指定 Git 仓库，`--ref` 指定分支或 tag，`--dir` 指定技能父目录；目标已存在时只有 `--force` 才替换。本包不会安装 `.agents/skills/` 中的项目开发技能。
