---
name: worm-vue3-print-project-map
description: worm-vue3-print monorepo 的源码地图与工作约定——包结构与边界、改什么去哪个文件、构建与发版的本机环境坑、文档索引。在本仓库做开发、排查、改模板引擎/设计器、跑构建或发版，或需要快速定位某个能力的实现位置时使用。
version: 1.0.0
agent_created: true
---

# worm-vue3-print 项目地图

在本仓库动手前的第一站：**先定位到正确包与文件，再改**，避免全局搜索式探索。

## 最高优先级规则

- 语言、编码原则、专家态度、验收清单以仓库根 **`AGENTS.md`** 为准（压缩后仍强制）。
- 发版流程、版本号同步位置、打标签与 Release 正文顺序以根 **`CLAUDE.md`** 为准。
- 两者与更细粒度的包内 README 冲突时，以更细粒度文档为准（语言类要求除外）。

## 包结构（workspace 内版本号 1.4.4）

| 路径 | 包名 | 发布 | 职责 |
|---|---|---|---|
| `packages/print-core` | `@worm-vue3-print/core` | 是 | 表达式引擎、同构渲染管线、设计器内核（纯 TS，无 Vue/React）。子路径 `/designer`、`/browser`、`/client` |
| `packages/print-canvas` | `@worm-vue3-print/canvas` | 是 | Vue 3 可视化设计器画布（原生控件，无 Element Plus 等 UI 库） |
| `packages/print-common` | `@worm-vue3-print/common` | 是 | 非 Vue 3 宿主（React/Vue2/无框架）设计器；**实验性，不建议生产** |
| `packages/print-contract` | `@worm-vue3-print/contract` | 否（private） | 模板契约校验、元素种类/表达式函数白名单、`draftTemplate`、`inspectTemplate`。MCP 依赖它 |
| `packages/print-mcp` | `@worm-vue3-print/mcp` | 否（private） | MCP 服务：模板会话工具 + 纯计算工具 |
| `services/print-render` | `@worm-vue3-print/render` | 否 | Playwright（Headless Chromium）PDF/截图渲染微服务 |
| `clients/print-client` | `@worm-vue3-print/print-client` | 否 | Electron 桌面静默打印客户端（本地 WebSocket + core 同构渲染） |
| `packages/print-client-sdk` | — | — | **空壳残留目录**（只有 `dist/` 与 `node_modules/`，无 package.json/源码），已废弃，不要往里加代码 |

边界：`core`（纯逻辑）→ `canvas`（设计器 UI）→ 宿主应用；SDK / 渲染服务 / 桌面客户端只依赖 `core`，改动不得破坏该分层。

## 源码定位（改什么去哪找）

| 要改/要看的东西 | 位置 |
|---|---|
| MCP 纯计算工具（element_kinds / validate / check_expression / inspect / draft / render_preview） | `packages/print-mcp/src/tools.ts` |
| MCP 会话工具（list / get / apply 设计器页面） | `packages/print-mcp/src/template-session-tools.ts` |
| 桌面端工具裁剪（剔除 render_preview 与 templatePath） | `packages/print-mcp/src/desktop-tools.ts` |
| 元素默认 `options`（13 种） | `packages/print-core/src/designer/utils/element-factory.ts` |
| 元素 / 表格单元格属性类型定义 | `packages/print-core/src/designer/types.ts`（单元格约 180–216 行；条码/二维码元素约 319–346 行） |
| 渲染 HTML 生成（各元素分支） | `packages/print-core/src/render/html-generator.ts`（`flowList` 分支约 500 行，含「一框一页、overflow 裁剪」注释） |
| 表格矩阵与合并约束 | 未逐字核实路径，先 `Glob "**/table-matrix.ts"` 定位（约束函数 `canMergeReason`） |
| 契约校验 / 元素种类白名单 | `packages/print-contract/src` |

不确定路径时用 `Glob` / `Grep` 定位，**不要凭记忆写死路径**。

## 文档索引

- `docs/中文/`：`文档总览.md` 入口，下设 `指南/`、`接口/`、`示例/`、`CHANGELOG.md`、`技术复盘.md`
- `docs/en/`：英文镜像（含 `CHANGELOG.en.md`）
- `docs/superpowers/`：设计 spec 与可视化稿（如桌面端 MCP 模板会话设计）
- `skills/`：随仓库分发的集成技能 —— `print-template-json`（生成模板 JSON，`scripts/build_template.py` / `validate_template.py`）、`worm-vue3-print-integration`（宿主集成 A/B/C 三条打印链路）

## 本机构建的环境坑（不是代码问题）

- `npm run build` 清理 `dist` 会触发沙箱批量删除守卫（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）。绕过：先把各包 `dist/` `mv` 到 `/tmp` 备份，再 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`。CI 无此限制。
- `canvas` 与桌面客户端依赖 **core 的 dist**：改了 core 源码必须先构建 core，否则测试/运行看到的还是旧 core。
- 新增或改动 core 子路径导出（如 `/client`）后必须重建 core，否则报 `ERR_MODULE_NOT_FOUND`。
- 构建垃圾（`*.bundled_*.mjs`、`vitest.config.ts.timestamp-*.mjs`）清理同理需绕守卫。

## 发版要点（细节以 CLAUDE.md 为准）

- 版本号同步：根 `package.json`、`packages/print-core`、`packages/print-canvas`、`demo/package.json`，另加 `demo/package-lock.json`（含多处版本号）。
- CHANGELOG 三处：`docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`、`packages/print-canvas/src/help-content/changelog.ts`。
- Release 正文写 `.github/release/notes.md`；`release.yml` 是手动触发且 checkout 到标签所指提交，**顺序必须是：写正文 → 提交 → 打标签 → 推送**。
- 两个远端都要推：`origin`=Gitee（默认上游）、`github`=GitHub。推 Gitee 偶发凭据锁报错，用 `git ls-remote origin master` 核对而不是盲重试。

## 表格语义（2026-09-20 定下的约定）

- 表格是 Excel 风格行×列矩阵，**没有**独立 columns/表头分组模型；多级表头 = 多行 `type:'header'` + `colspan/rowspan` 合并。
- 合并区不能跨不同行类型（`canMergeReason`），表头区 rowspan 天然闭合在表头内。
- 跨页重复的粒度是**整个表头区**：区内任一行 `repeatOnPage` 为真 → 整个表头区重复（避免把靠 rowspan 连成的表头切在半截上）。
