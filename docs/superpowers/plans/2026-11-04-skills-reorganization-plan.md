# 技能体系重整与 npx 安装器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户技能收敛为 Vue 3、common、MCP 三个自包含技能，并发布支持指定 Git 仓库、ref 和目录的 `npx` 安装器。

**Architecture:** 新增零运行时依赖的 Node.js CLI，仅从远程仓库 `skills/` 复制单个技能。MCP 技能接收原模板生成技能的全部资源；Vue 3 与 common 各自提供宿主 MCP 接入参考。开发技能继续留在 `.agents/`，不进入分发链路。

**Tech Stack:** Node.js >=20、ESM、`node:test`、Git CLI、Markdown、Python 3、npm workspaces、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-11-04-skills-reorganization-design.md`

## Global Constraints

- 全程使用简体中文；代码标识符、命令、包名和报错原文可保留英文。
- 在 `master` 直接开发，不创建工作树；每次写入 UTF-8 无 BOM，单次不超过 500 行。
- 默认目录为 `<cwd>/.agents/skills`；必须显式指定一个技能；只读取仓库 `skills/<skill-name>`。
- 默认仓库为 `https://github.com/worm-longliu/worm-vue3-print.git`；Node.js 要求 `>=20`，CLI 无运行时依赖。
- 不修改 `.agents/skills/experts`、`.agents/deliberation/` 或 `.agents/skills/multi-role-deliberation/`。
- 不修改 `core`、`canvas`、`common`、`contract`、`mcp` 的运行时代码，不实际发布 npm。
- 不触碰用户已有的 `BarcodeElement.vue` 和 `BarcodeElement.spec.ts` 修改。
- 历史 CHANGELOG 中的 `print-template-json` 记录保留；只更新当前有效文档。
- 每个任务先验证测试或检查失败，再做最小实现，通过后审查 diff 并提交。

## 文件结构

- `packages/print-skills/`：独立 CLI、参数解析、Git 获取与安全安装、端到端测试。
- `skills/worm-vue3-print-mcp/`：MCP 使用与宿主协作、模板规范、脚本和示例。
- `skills/worm-vue3-print-common/`：跨框架宿主与 Custom Element 接入。
- `skills/worm-vue3-print-integration/`：Vue 3 宿主接入，新增宿主 MCP 参考。
- `scripts/check-skills.mjs`：三个技能的 frontmatter、目录和本地链接检查。
- 根发布脚本与当前文档：安装命令、技能清单、版本及发布链路。

---

### Task 1: `@worm-vue3-print/skills` 安装器

**Files:**
- Create: `packages/print-skills/package.json`
- Create: `packages/print-skills/bin/cli.js`
- Create: `packages/print-skills/src/cli.js`
- Create: `packages/print-skills/src/install.js`
- Create: `packages/print-skills/test/cli.test.js`
- Create: `packages/print-skills/test/helpers.js`
- Create: `packages/print-skills/README.md`
- Create: `packages/print-skills/LICENSE`

**Interfaces:**
- Produces: `installSkill({ name, repo, ref, dir, force, cwd }): Promise<{ skillPath, repo, ref }>`。
- Produces: `run(argv, io): Promise<number>`；`bin/cli.js` 只设置退出码，不承载安装逻辑。
- Consumes: 仅 Node.js 内置模块和 `git` 命令。

- [ ] **Step 1: 写 CLI 端到端失败测试**

用 `helpers.js` 创建临时仓库，提交 `skills/demo/SKILL.md` 和 `.agents/skills/experts/SKILL.md`，通过 `spawnSync(process.execPath, [cli, ...args])` 执行真实入口。首组断言：

```js
test('默认安装到项目 .agents/skills，且不扫描开发技能', async () => {
  const repo = await createSkillRepo()
  const cwd = await mkdtemp(join(tmpdir(), 'worm-skills-cwd-'))
  const ok = runCli(['demo', '--repo', repo, '--dir', join(cwd, '.agents/skills')])
  assert.equal(ok.status, 0)
  assert.match(readFileSync(join(cwd, '.agents/skills/demo/SKILL.md'), 'utf8'), /name: demo/)
  const dev = runCli(['experts', '--repo', repo, '--dir', join(cwd, '.agents/skills')])
  assert.notEqual(dev.status, 0)
  assert.equal(existsSync(join(cwd, '.agents/skills/experts')), false)
})
```

同一文件加入独立用例：省略 `--dir`；`--ref` 选择 tag；缺名称/多名称/未知选项；`../demo` 与绝对路径名称；缺失 SKILL；frontmatter 名称不符；目录符号链接；目标已存在；`--force` 替换；失败无目标残留。默认目录用例子进程 `cwd` 必须不传 `--dir`。

- [ ] **Step 2: 运行测试确认 RED**

Run: `node --test packages/print-skills/test/cli.test.js`

Expected: FAIL，原因是 `bin/cli.js` 尚不存在。

- [ ] **Step 3: 创建包与最小 CLI**

`package.json` 使用名称 `@worm-vue3-print/skills`、版本 `1.4.4`、`type: module`、`engines.node: >=20`、`bin.worm-vue3-print-skills: ./bin/cli.js`，`files` 仅含 `bin/`、`src/`、`README.md`、`LICENSE`；脚本：

```json
{
  "build": "node --check bin/cli.js && node --check src/cli.js && node --check src/install.js",
  "test": "node --test test/*.test.js"
}
```

`src/cli.js` 严格解析一个位置参数及 `--repo --ref --dir --force --help`，将布尔选项后的意外值视为位置参数并报错。`src/install.js` 使用 `mkdtemp` + `spawn` 浅克隆；`ref` 存在时传 `--branch <ref> --single-branch`，只定位 `skills/<name>`。用 `lstat` 拒绝符号链接，用 frontmatter 解析结果核对名称。包文件创建后运行 `npm install --package-lock-only --ignore-scripts`，只更新新 workspace 的锁文件元数据。

- [ ] **Step 4: 实现安全替换与错误输出**

目标路径固定为 `resolve(dir ?? join(cwd, '.agents/skills'), name)`，并断言其直接父目录等于所选技能根目录。先复制到同父目录临时目录；非 force 已存在即失败；force 时先重命名旧目录为备份，再重命名新目录，失败则恢复备份，成功后删除备份。Git/校验/复制错误统一非零退出，最终清理克隆临时目录。

- [ ] **Step 5: 运行测试与打包检查**

Run: `npm test -w @worm-vue3-print/skills && npm run build -w @worm-vue3-print/skills && npm pack -w @worm-vue3-print/skills --dry-run`

Expected: 全部测试 PASS；dry-run 不含测试、其他技能或开发技能。

- [ ] **Step 6: 提交**

```bash
git add packages/print-skills package-lock.json
git commit -m "feat：新增技能 npx 安装器"
```

---

### Task 2: 合并模板能力到 MCP 技能

**Files:**
- Create by rename: `skills/worm-vue3-print-mcp/`（来自 `skills/print-template-json/`）
- Modify: `skills/worm-vue3-print-mcp/SKILL.md`
- Create: `skills/worm-vue3-print-mcp/references/stdio.md`
- Create: `skills/worm-vue3-print-mcp/references/desktop.md`
- Create: `skills/worm-vue3-print-mcp/references/workflows.md`
- Create: `scripts/check-skills.mjs`

**Interfaces:**
- Consumes: 已验证的 stdio 六工具、桌面八工具及原模板脚本。
- Produces: 可独立安装的 `worm-vue3-print-mcp`；不再存在 `skills/print-template-json/`。

- [ ] **Step 1: 写技能检查并确认 RED**

`check-skills.mjs` 接收技能目录参数，检查 frontmatter `name` 与目录一致、存在非空 `description`，扫描 Markdown 本地链接指向存在文件，并拒绝目录内符号链接。先只传目标 MCP 路径。

Run: `node scripts/check-skills.mjs skills/worm-vue3-print-mcp`

Expected: FAIL，目标目录不存在。

- [ ] **Step 2: 迁移并改写入口**

```bash
git mv skills/print-template-json skills/worm-vue3-print-mcp
```

将 frontmatter 改为 `name: worm-vue3-print-mcp`，description 同时覆盖“驱动打印 MCP”和“生成/校验模板 JSON”。入口只保留选型、两条工作流、硬约束和参考导航：MCP 可用时走 `element_kinds → draft/修改 → validate → inspect → render_preview`；不可用时走 `build_template.py → validate_template.py`，不得伪报 MCP 结果。

- [ ] **Step 3: 写三个真实参考文档**

`stdio.md` 写入 private 包源码构建、绝对路径 `dist/stdio.js` 配置、`StdioServerTransport` 事实边界、六个工具、`templatePath` 与渲染环境变量；`desktop.md` 写入本机 HTTP/Bearer、八工具、会话三件套与 revision 冲突；`workflows.md` 写生成、修改、大模板和真实 PDF 的调用顺序。不得声称桌面支持 `print_render_preview`，不得把未配置渲染服务的降级写成 PDF 成功。

- [ ] **Step 4: 验证资源迁移与 stdio**

Run: `node scripts/check-skills.mjs skills/worm-vue3-print-mcp`

Run: `for f in skills/worm-vue3-print-mcp/assets/templates/*.template.json; do python3 skills/worm-vue3-print-mcp/scripts/validate_template.py "$f" || exit 1; done`

Run: 按 spec 的 JSON-RPC 序列执行 `initialize`、`tools/list`，并调用五个纯计算工具；未设置渲染 URL 时确认 `print_render_preview` 返回预期降级。

Expected: 技能检查与全部模板校验 PASS；工具列表为 6 个，纯计算调用成功。

- [ ] **Step 5: 提交**

```bash
git add skills/worm-vue3-print-mcp skills/print-template-json scripts/check-skills.mjs
git commit -m "feat：合并模板生成能力到 MCP 技能"
```

---

### Task 3: 新增 common 集成技能及宿主 MCP 方案

**Files:**
- Create: `skills/worm-vue3-print-common/SKILL.md`
- Create: `skills/worm-vue3-print-common/references/installation.md`
- Create: `skills/worm-vue3-print-common/references/integration-api.md`
- Create: `skills/worm-vue3-print-common/references/framework-recipes.md`
- Create: `skills/worm-vue3-print-common/references/printing.md`
- Create: `skills/worm-vue3-print-common/references/mcp-host-integration.md`
- Create: `skills/worm-vue3-print-common/references/troubleshooting.md`

**Interfaces:**
- Consumes: `packages/print-common/README.md`、四个 demo、`PrintClient` 协议。
- Produces: Custom Element 版 `template.get/apply` 宿主接入骨架。

- [ ] **Step 1: 确认技能检查 RED**

Run: `node scripts/check-skills.mjs skills/worm-vue3-print-common`

Expected: FAIL，目录不存在。

- [ ] **Step 2: 编写 common 宿主技能**

入口先路由：Vue 3 优先 canvas；common 为实验性且不建议生产。安装文档只使用公开导出 `.`, `./browser`, `./style.css`；API 文档明确对象/函数赋 property、事件读 `event.detail`、宿主给块级宽高、`getTemplateJson()` 旁路需先 `validateTemplate()`。框架文档分别给 Vue 2.7、React、jQuery 的注册、注入和清理骨架；打印文档复用 core 同源渲染与客户端链路。

- [ ] **Step 3: 编写 common 宿主 MCP 参考**

提供桌面客户端优先方案：创建 `PrintClient`，`setRequestHandler` 处理 `template.get/apply`，连接后 `attachTemplate`，卸载时 `detachTemplate/close`。读取用 `JSON.parse(el.getTemplateJson())`；写回用 `el.template = structuredClone(templateJson)`，等待元素更新后重读。代码骨架必须计算并比较 revision、拒绝封禁元素、返回新 revision，不引用 demo 私有 `createTemplateSession`。

补充 Node 嵌入方案：从源码/workspace 的 private `@worm-vue3-print/mcp` 导入 `createPrintMcpServer`；说明 transport 由宿主选择，自定义会话源实现 `TemplateSessionBridge`，模型密钥不进入前端。

- [ ] **Step 4: 校验文档与公开 API**

Run: `node scripts/check-skills.mjs skills/worm-vue3-print-common`

Run: `npm test -w @worm-vue3-print/common && npm test -w @worm-vue3-print/core -- client`

Expected: 检查与测试 PASS；示例只出现真实的 Custom Element 和客户端方法。

- [ ] **Step 5: 提交**

```bash
git add skills/worm-vue3-print-common
git commit -m "docs：新增 common 集成与宿主 MCP 技能"
```

---

### Task 4: 更新 Vue 3 技能及宿主 MCP 方案

**Files:**
- Modify: `skills/worm-vue3-print-integration/SKILL.md`
- Modify: `skills/worm-vue3-print-integration/references/installation.md`
- Modify: `skills/worm-vue3-print-integration/references/integration-api.md`
- Modify: `skills/worm-vue3-print-integration/references/host-integration-guide.md`
- Modify: `skills/worm-vue3-print-integration/references/troubleshooting.md`
- Create: `skills/worm-vue3-print-integration/references/mcp-host-integration.md`

**Interfaces:**
- Consumes: 当前 canvas 组件契约、`demo/src/template-session.ts` 的真实行为。
- Produces: Vue 3 `designerRef` 版 `template.get/apply` 接入骨架。

- [ ] **Step 1: 增加当前契约检查并确认 RED**

在技能检查输出之外执行文本断言：Vue 3 技能必须包含 `mcp-host-integration.md`、`validateTemplate()`、`show-help`，且安装文档不得含 common 跨框架接入段或“当前已发布 1.3.0/1.4.3”的过期说法。先运行 `grep`，记录缺失项。

- [ ] **Step 2: 收敛 Vue 3 集成内容**

移除 common 安装和跨框架路由细节，改为一句“非 Vue 3 宿主使用 `worm-vue3-print-common` 技能”；core/canvas 要求同版本。核对 `PrintDesigner` 的 `show-help`、`validateTemplate()` 和预览 API，不增加不存在的组件事件或 expose。

- [ ] **Step 3: 编写 Vue 3 宿主 MCP 参考**

桌面方案读取 `designerRef.value.getTemplateJson()`，写回时给 `initial-template` 绑定的 ref 赋深拷贝新引用，`await nextTick()` 后重读；`onMounted` 启动、`onUnmounted` 停止。包含 fields/printData 快照、revision、封禁元素、冲突重读和一步撤销约束。Node 嵌入方案与 common 保持相同协议，但示例使用 Vue 3 快照函数。

- [ ] **Step 4: 校验技能与真实会话实现**

Run: `node scripts/check-skills.mjs skills/worm-vue3-print-integration`

Run: `npm test -w @worm-vue3-print/print-client -- mcp-live-demo.integration.test.ts`

Expected: PASS，真实 demo 会话的读写、冲突和清理测试保持通过。

- [ ] **Step 5: 提交**

```bash
git add skills/worm-vue3-print-integration
git commit -m "docs：更新 Vue 3 集成并补充宿主 MCP"
```

---

### Task 5: 技能目录、发布链路与当前文档

**Files:**
- Create: `skills/README.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/publish-npm.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/check-release-carriers.mjs`
- Modify: `README.md`
- Modify: `docs/中文/指南/MCP集成.md`
- Modify: `docs/中文/文档总览.md`
- Modify: `AGENTS.md`
- Modify: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: Task 1 的包与 Tasks 2–4 的三个技能。
- Produces: `test:skills`、`publish:skills`、统一发布和当前安装文档。

- [ ] **Step 1: 写发布配置失败检查**

用 Node 断言根 `test`/`build` 包含 skills workspace，`publish:npm` 与发布工作流包含 `@worm-vue3-print/skills`，`check-release-carriers.mjs` 比较 skills 版本；并断言当前 README/MCP 指南不再把 `print-template-json` 描述为现存技能。先运行确认缺少配置。

- [ ] **Step 2: 接入构建、测试和发布**

根脚本增加：

```json
{
  "test:skills": "npm test -w @worm-vue3-print/skills && node scripts/check-skills.mjs skills/worm-vue3-print-integration skills/worm-vue3-print-common skills/worm-vue3-print-mcp",
  "publish:skills": "npm publish -w @worm-vue3-print/skills --registry=https://registry.npmjs.org --access public",
  "publish:skills:dry-run": "npm publish -w @worm-vue3-print/skills --dry-run --registry=https://registry.npmjs.org --access public"
}
```

将 skills 的 build/test 加入根对应命令，将 `publish:skills` 加入 `publish:npm`。手动发布工作流构建、tag 版本循环和发布步骤纳入 skills；release 版本检查同步纳入。`check-release-carriers.mjs` 添加 skills 包版本与主线一致性检查。

- [ ] **Step 3: 写技能目录和安装文档**

`skills/README.md` 只列三个技能及精确 `npx` 示例，说明 `--dir` 是技能父目录、默认 `.agents/skills`、必须指定名称、`--force` 才覆盖。README、MCP 指南、文档总览、AGENTS、CONTRIBUTING 同步技能名和四个正式发包（core/canvas/common/skills）；common 实验性和 private MCP 边界保持不变。历史 CHANGELOG 不改。

- [ ] **Step 4: 验证配置和 npm 包**

Run: `npm run test:skills && npm run publish:skills:dry-run && node scripts/check-release-carriers.mjs --pre`

Expected: skills 测试与发布 dry-run PASS；载体检查无新增 FAIL（与本次无关的历史 WARN 如实记录）。

- [ ] **Step 5: 提交**

```bash
git add skills/README.md package.json package-lock.json .github/workflows/publish-npm.yml .github/workflows/release.yml scripts/check-release-carriers.mjs README.md docs/中文/指南/MCP集成.md docs/中文/文档总览.md AGENTS.md CONTRIBUTING.md
git commit -m "chore：接入技能发布与安装文档"
```

---

### Task 6: 全量验收

**Files:**
- Modify only if evidence requires: 本计划前述文件
- No runtime source changes

**Interfaces:**
- Consumes: 前五项提交后的完整工作区。
- Produces: 可复现的验收输出与最终 diff。

- [ ] **Step 1: 验证真实 npx 安装**

先执行 `npm pack -w @worm-vue3-print/skills --pack-destination /tmp`，再用生成的 tgz 作为 `npx --yes <tgz> <skill> --repo <本地测试仓库> --dir <临时目录>` 的包来源；分别安装三个技能并运行 `check-skills.mjs`。另建带 tag 的仓库验证 `--ref`，重复安装确认默认拒绝、`--force` 成功；最后对官方仓库省略 `--repo` 安装 `worm-vue3-print-mcp`，验证默认仓库路径。

- [ ] **Step 2: 运行定向与项目测试**

```bash
npm run test:skills
npm test -w @worm-vue3-print/mcp
npm test -w @worm-vue3-print/common
npm test -w @worm-vue3-print/core
npm test -w @worm-vue3-print/print-client
npm run build
npm test
npm run lint:print-architecture
```

若用户已有条码改动导致失败，保留原始失败输出并区分本次回归与既有工作区问题，不修改条码文件。

- [ ] **Step 3: 审查最终变更**

Run: `git diff --check <起点提交>..HEAD && git status --short && git diff --stat <起点提交>..HEAD`

确认只有计划文件、技能、安装器、发布与当前文档；`.agents/` 和两个条码文件未进入任何提交。

- [ ] **Step 4: 提交验收修正**

仅在验收发现计划内问题时修正并复跑对应失败检查，然后：

只暂存本次验收实际修正的精确文件，不使用目录级批量暂存，然后执行：

```bash
git commit -m "test：完成技能体系与安装器验收"
```

无修正时不创建空提交。
