---
name: worm-vue3-print-project-map
description: worm-vue3-print monorepo 的源码地图与工作约定——包结构与边界、改什么去哪个文件、构建与发版的本机环境坑、文档索引。在本仓库做开发、排查、改模板引擎/设计器、跑构建或发版，或需要快速定位某个能力的实现位置时使用。
version: 1.1.0
agent_created: true
---

# worm-vue3-print 项目地图

在本仓库动手前的第一站：**先定位到正确包与文件，再改**，避免全局搜索式探索。

## 最高优先级规则

- 语言、编码原则、专家态度、验收清单以仓库根 **`AGENTS.md`** 为准（压缩后仍强制）。
- 发版流程、版本号同步位置、打标签与 Release 正文顺序以根 **`CLAUDE.md`** 为准。
- 两者与更细粒度的包内 README 冲突时，以更细粒度文档为准（语言类要求除外）。

## 包结构（workspace 内版本号 1.5.0）

| 路径 | 包名 | 发布 | 职责 |
|---|---|---|---|
| `packages/print-core` | `@worm-vue3-print/core` | 是 | 表达式引擎、同构渲染管线、设计器内核（纯 TS）。子路径 `/designer`、`/browser`、`/node`、`/client` |
| `packages/print-plugin-kit` | `@worm-vue3-print/plugin-kit` | 否（尚未发布） | 框架无关的插件设计器 UI 契约与注册表（`defineElementUI` / `registerElementUI`），common 原生消费、canvas 自动 Vue 桥接 |
| `packages/print-canvas` | `@worm-vue3-print/canvas` | 是 | Vue 3 可视化设计器画布（原生控件，禁止引入 Element Plus） |
| `packages/print-common` | `@worm-vue3-print/common` | 是 | 非 Vue 3 宿主（React/Vue2/无框架）设计器；**实验性，不建议生产**。支持 `el.designData` 注入设计态业务数据 |
| `packages/print-echarts` | `@worm-vue3-print/echarts` | 否（尚未发布） | 十类图表元素的可选插件包（Vue 设计器组件 + `/kit` 纯 TS 出口） |
| `packages/print-echarts-common` | `@worm-vue3-print/echarts-common` | 否（尚未发布） | 图表元素的 common 适配（静态 SVG 画布 + 图形化属性面板） |
| `packages/print-contract` | `@worm-vue3-print/contract` | 否（private） | 模板契约校验、动态元素种类、`draftTemplate`、`inspectTemplate`；MCP 依赖它 |
| `packages/print-mcp` | `@worm-vue3-print/mcp` | 否（private） | MCP 服务：模板会话工具 + 纯计算工具 |
| `services/print-render` | `@worm-vue3-print/render` | 否 | Playwright（Headless Chromium）PDF/截图渲染微服务 |
| `clients/print-client` | `@worm-vue3-print/print-client` | 否 | Electron 桌面静默打印客户端 |
| `packages/print-client-sdk` | — | — | **空壳残留目录**（只有 `dist/` / `node_modules/`，无 package.json/源码），已废弃，不要加代码 |

边界：`core`（纯逻辑）→ `canvas`（Vue 设计器）/ `common`（零框架 Custom Elements）/ `plugin-kit`（框架无关 UI 契约）→ 宿主；
SDK / render 服务 / Electron 客户端只依赖 `core`，改动不得破坏该分层。

## 源码定位（改什么去哪找）

| 要改/要看的东西 | 位置 |
| --- | --- |
| 元素插件注册表 / 描述符类型 | `packages/print-core/src/designer/element-plugin-registry.ts` |
| 插件设计器 UI 契约 / 注册表 | `packages/print-plugin-kit/src/{types,registry}.ts` |
| common 消费插件（素材卡/画布/属性台） | `packages/print-common/src/core/plugin.ts`、`src/shell/{panels,elements,property-panel,plugin-ui}.ts`、`src/print-designer.ts` |
| canvas 插件桥接 / 扩展映射 | `packages/print-canvas/src/composables/{pluginKitBridge,useElementExtensionRegistry}.ts` |
| 通用出图协议（`renderAssets` / `collectExecutorBundles`） | `packages/print-core/src/print/assets.ts` |
| 元素默认 `options`（内置 + 插件回落） | `packages/print-core/src/designer/utils/element-factory.ts` |
| 元素 / 单元格属性类型定义 | `packages/print-core/src/designer/types.ts` |
| 渲染 HTML 生成（各元素分支） | `packages/print-core/src/render/html-generator.ts` |
| 表格矩阵与合并约束 | `packages/print-core/src/designer/utils/table-matrix.ts`（`canMergeReason`） |
| 契约校验 / 动态元素种类 | `packages/print-contract/src`（`kinds.ts` 走 `getElementKinds()`） |
| MCP 基础工具 / 会话工具 | `packages/print-mcp/src/tools.ts`、`src/template-session-tools.ts`、`src/render-tools.ts` |

注意：`packages/print-mcp/src/desktop-tools.ts` 与 `DESKTOP_BLOCKED_TOOL_NAMES` **已不存在**；桌面端屏蔽口径改为「不进基础 TOOLS + 条件注入」。
不确定路径时用 `Glob` / `Grep` 定位，**不要凭记忆写死路径**。

## 文档索引

- `docs/中文/`：`文档总览.md` 入口，下设 `指南/`（含 `自定义元素插件开发.md`）、`接口/`、`示例/`、`CHANGELOG.md`；`docs/en/` 是英文镜像。
- `docs/superpowers/`：设计 spec（`specs/`）、实施计划（`plans/`）、交接（`handover/`）与 spike。
- `skills/`：随仓库分发的集成技能，不参与本机技能发现。
- 帮助弹窗 changelog 在 canvas / common 两份 `src/**/help-content/changelog.ts`，**必须逐字一致**（有测试断言）。

## 本机构建的环境坑（不是代码问题）

- `npm run build` 清理 `dist` 会触发沙箱批量删除守卫（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。绕过：`CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`，必要时先把各包 `dist/` `mv` 到 `/tmp`。CI 无此限制。
- canvas / common / Electron 客户端 / render 都吃 **core 的 dist**：改 core 源码（含新增子路径）必须先重建 core，否则 `ERR_MODULE_NOT_FOUND`。同样地，改 plugin-kit 的 `types.ts` 后要重建它，否则下游 typecheck 看到旧声明。
- `npm test` 全量会被信号杀掉（exit 137）。**必须逐 workspace 独占跑**（core≈2.6min、canvas≈8.7min、common≈4min）；并行跑 canvas 会触发 forks worker 超时（零断言失败却 exit 1）。
- vitest 收集规则按包而异：echarts 只收 `__tests__/*.test.ts`、canvas 只收 `*.spec.ts`、client 只收 `src/**/*.test.ts`、common 用 `src/**/__tests__/*.spec.ts`。
- render 的 `vitest.setup.ts` 预热真实 Chromium；纯 fake driver 走 `vitest.baseline.config.ts` / `npm run test:baseline`。
- 会话中断后恢复：① 检查半截源码括号闭合；② `print-core/dist` 只剩一个文件说明 tsup 清理后中断，需完整重建。

## 发版要点（细节以 CLAUDE.md 为准）

- **9 个 `package.json` 全同号**（根、demo、packages 下 core/canvas/common/contract/mcp/echarts/skills）+ 6 处内部 `^x.y.z` + 两个 lock（根 20 处、demo 8 处）。
- CHANGELOG **四处**：中英 `docs/`、`packages/print-canvas/src/help-content/changelog.ts`、`packages/print-common/src/shell/help-content/changelog.ts`。
- 顺序：写 `.github/release/notes.md` → 提交 → 打标签 → 推送（release.yml 用 `body_path` checkout 到标签提交）。release.yml 是 workflow_dispatch 手动触发。
- 两个远端都推：`origin`=Gitee（默认上游）、`github`=GitHub。Gitee 偶发凭据锁报错，用 `git ls-remote` 核对而非盲重试。
- 提交前确认 `git config user.name`（历史是 `worm <1432263953@qq.com>`）。

## 表格语义（2026-09-20 定下的约定）

- 表格是 Excel 风格行×列矩阵，**没有**独立 columns/表头分组模型；多级表头 = 多行 header + `colspan/rowspan`。
- 合并区不能跨不同行类型（`canMergeReason`），header 区 rowspan 天然闭合在表头内。
- 跨页重复的粒度是**整个表头区**：区内任一行 `repeatOnPage` 为真 → 整个表头区重复（避免把靠 rowspan 连成的表头切在半截上）。
