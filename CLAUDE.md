# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 本文件是架构与命令速查；工作准则（强制简体中文回复、最小实现、外科手术式修改、专家态度、验收清单）以 [AGENTS.md](AGENTS.md) 为准，进入仓库先读，冲突时以 AGENTS.md 和包内更细粒度文档为准。

## 省 token / 提效工作模式（强制）

- **窄探索**：先读本文件 + AGENTS.md + 目标包的入口（`src/index.ts`）或 README，再用 `grep`/glob 精确定位；不要通读整目录或无关包。广度搜索派 Explore 子代理，只收结论。
- **窄测试**：改动后只跑受影响 workspace 的相关测试文件，不跑根 `npm test`：
  - 单文件：`npm exec -w @worm-vue3-print/core vitest run -- tests/evaluator.test.ts`（或在包目录内 `npx vitest run tests/evaluator.test.ts`）
  - 单用例：`npx vitest run -t "用例名"`；监听模式 `npm run test:watch -w <包名>`
- **窄构建**：各 workspace 通过 **dist** 消费 core，改了 core 只需 `npm run build -w @worm-vue3-print/core`，不要每步全量构建。
- 渲染管线改动才加跑 `npm run test -w @worm-vue3-print/render`（Playwright 集成测试，慢，首次需 `npx playwright install chromium`）。
- 仅在任务收尾 / 提 PR / 发版前执行一次全量 `npm run build && npm test` + `npm run lint:print-architecture`。
- 优先 Edit 小改，不整文件重写；不重复读取已读文件；完成后用 `git diff` 自审命名、包边界与改动面。

## 常用命令

```bash
npm install                 # 根目录安装并链接 workspace
npm run build               # 全量构建（顺序 core→client→render→canvas→print-client）
npm test                    # 全量测试（core、canvas、print-client，不含 render 集成测试）

npm run build -w @worm-vue3-print/core      # 单独构建某包（包名：core / canvas / render / print-client）
npm run test  -w @worm-vue3-print/canvas    # canvas 全部 *.spec.ts
npm run typecheck -w @worm-vue3-print/print-client  # 仅 print-client 有 typecheck
npm run lint:print-architecture             # 架构守卫（见下），改 render/client 前后必跑
npm run parity:cross-end                    # 三端渲染像素/参数一致性校验

npm run dev -w @worm-vue3-print/render      # 渲染服务本地开发（tsx，:3000 见其 README）
npm run dev -w @worm-vue3-print/print-client # Electron 客户端开发
cd demo && npm run dev                       # demo 不在根 workspaces 内，有独立 node_modules，须进目录运行

npm run pack:client        # 打包 Electron 客户端安装包（mac/win）
npm run publish:dry-run    # 发版演练；正式发布流程见 CONTRIBUTING.md
```

发版注意：版本号必须四处同步（根包、core、canvas、demo），CHANGELOG 三处同步（中文、en、canvas 帮助弹窗 `help-content/changelog.ts`），打 `v` 标签推 GitHub 触发自动发布。

## 架构（需跨多文件才能理解的全局）

npm workspaces monorepo，依赖方向单向：**`core`（纯逻辑）→ `canvas`（Vue UI）→ 宿主应用**；SDK、render 服务、Electron 客户端只依赖 `core`，不得反向依赖。

### core（`packages/print-core`，纯 TS，无 Vue/DOM 硬依赖）

- 表达式引擎：`lexer.ts` → `parser.ts` → `evaluator.ts`，`functions/`（format/aggregate/system）为 safelist 内置函数；`template-parser.ts` 处理 `{field.path}` 模板串。
- 渲染管线（`src/render/`，与宿主无关的纯函数阶段）：`data-binder`（数据绑定/系统变量）→ `pagination-engine`（分页、表格跨页）→ `html-generator` + `css-builder`（mm 布局出 HTML）；`continuous-paper.ts` 连续纸纸高推导、`watermark.ts` 水印。
- 打印抽象层（`src/print/`）：`pipeline.ts`/`ports.ts`/`driver.ts` 定义与平台无关的测量、码制（`codes.ts`，jsbarcode/qrcode）、PDF 规格（`pdf-spec.ts`）；**所有测量、纸高推导、出图参数、码制渲染的唯一真实来源在 core**。
- DOM 执行器（`src/browser/`）：`dom-executor.ts` 会编译成 IIFE（`./browser/dom-executor.iife` 导出）注入到真实页面上下文执行——浏览器 iframe 预览（`driver-iframe.ts`）、Playwright 服务、Electron 隐藏 webContents 三端注入同一份代码，这是「同构渲染」的机制。`browser-pagination.ts`/`browser-runtime.ts` 为浏览器侧运行时。
- `src/designer/`：框架无关的设计器内核（交互模型/工具），canvas 包是它的 Vue 壳。
- 子路径导出：`.`（引擎+渲染）、`/designer`、`/browser`、`/node`、`./browser/dom-executor.iife`。改动导出面时同步 tsup 配置与各子路径 `index.ts`。

### canvas（`packages/print-canvas`，Vue 3.5+ 原生控件）

- `components/`（PrintDesigner、属性面板、各元素控件）+ `composables/`（拖拽/吸附/参考线/历史/选择等，均有对应 *.spec.ts）；样式在 `styles/`，以 `native-controls.css` 整体导出，**禁止引入 Element Plus 等 UI 库**，DOMPurify 消毒 HTML 元素。
- 宿主通过 `ref.getTemplateJson()` 取画布 JSON；模板加载/重置是宿主职责（替换 `initial-template` 引用即可）。

### 三端消费方（只许做平台适配，不许重实现 core 逻辑）

- `services/print-render`（Express + Playwright）：`driver-playwright.ts` 是唯一允许调用 `page.pdf`/透传出图参数的地方；workspace 软链消费 core 的 dist 与 IIFE。
- `clients/print-client`（electron-vite）：`src/main`（WS 服务/打印引擎/打印机服务）、`src/worker`（隐藏渲染窗口）、`src/preload`（沙箱 IPC）、`src/shared`（IPC 契约）。
- `packages/print-core/src/client`：浏览器侧 WS 门面（core 子路径 `@worm-vue3-print/core/client`；127.0.0.1:17521 起端口探测、退避重连、错误码 `WormPrintError`）。
- `scripts/check-print-architecture.mjs` 是架构守卫：render 与 electron 源码中出现直接 DOM 测量（`offsetHeight` 等）、纸高推导函数、直接 import 码制库、硬编码出图参数即失败（driver 白名单除外）。

### 测试约定

- 全部用 vitest（core 配 happy-dom）。core 纯逻辑测试在 `tests/`，渲染阶段测试与源码同目录（`*.test.ts`）；canvas 测试在 `src/__tests__/`（`*.spec.ts`）；render 的 `*.integration.test.ts` 需要 Playwright。
- 新测试跟随所在目录既有命名与放置方式。
- TypeScript 全仓 `strict: true`。

### 提交

Conventional Commits 类型前缀（`feat:`/`fix:`/`refactor:` …）+ 简体中文描述；提交信息与 PR 描述按会话要求附 Co-Authored-By / Claude Code 署名行。
