# 项目长期笔记：worm-vue3-print

## 发版流程（硬要求）

- **9 个 `package.json` 全同号**（根、`demo`、packages 下 core/canvas/common/contract/mcp/echarts/skills）+ 6 处内部 `^x.y.z` 引用 + 两个 lock（根 20 处、demo 8 处）。
- CHANGELOG **四处**同步：`docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`、`packages/print-canvas/src/help-content/changelog.ts`、`packages/print-common/src/shell/help-content/changelog.ts`（后者是 canvas 版逐字副本，`common/src/shell/__tests__/help-modal.spec.ts` 断言强制一致）。
- 顺序硬约束：写 `.github/release/notes.md` → 提交 → 打标签 → 推送（release.yml 用 `body_path` checkout 到标签提交取正文）。
- release.yml 是 **workflow_dispatch 手动触发**，需填已推送的 tag，校验 core/canvas 与 tag 一致，先 core 后 canvas。
- 远端两个都推：`origin`=Gitee（默认上游）、`github`=GitHub。推 Gitee 偶发 `credential storage lock` 属竞争，用 `git ls-remote` 核对而非盲重试。
- 提交前确认 `git config user.name`（历史是 `worm <1432263953@qq.com>`，曾被改成 `Task Timer`）。

## 本地构建 / 测试环境坑（非项目问题）

- 本机 `npm run build` 会撞沙箱批量删除守卫（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）：先把各包 `dist/`（含 `clients/print-client/out`、`demo/dist`）`mv` 到 /tmp，再 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build`。
- canvas / Electron 客户端 / render 都吃 core 的 **dist**；改 core 源码（含新增子路径如 `/client`）必须先重建 core，否则 `ERR_MODULE_NOT_FOUND`。
- `npm test` 全量会被杀（exit 137）。**必须逐 workspace 独占跑**：core≈2.6min、canvas≈8.7min、common≈4min。并行跑 canvas 会触发 forks worker 超时（零断言失败却 exit 1）。
- vitest 收集规则按包而异：echarts 只收 `__tests__/*.test.ts`、canvas 只收 `*.spec.ts`、client 只收 `src/**/*.test.ts`；common 用 `__tests__/*.spec.ts`。
- render 服务的 `vitest.setup.ts` 预热真实 Chromium；纯 fake driver 用 `vitest.baseline.config.ts` / `npm run test:baseline`。
- 会话中断后恢复：① 检查半截源码括号闭合（曾报 `Unexpected end of file`）；② `packages/print-core/dist` 只剩一个文件说明 tsup 清理后中断，需完整重建。

## 包结构（2026-11-15）

- 七个包：core、canvas、common、plugin-kit、echarts、echarts-common、contract/mcp/skills。`print-client-sdk` 是空壳残骸，别加代码。
- 分层：core（纯逻辑）→ canvas（Vue 设计器）/ common（零框架 Custom Elements）/ plugin-kit（框架无关 UI 契约）→ 宿主；SDK / render / 桌面客户端只依赖 core。
- demo 线上预览：GitHub Pages + `.github/workflows/pages.yml`；EdgeOne 读 `edgeone.json`。

## 自定义元素插件体系（P0–P5 已落地，1.5.0 待发）

- 方案在 `docs/superpowers/specs/2026-11-14-custom-element-plugin-design.md`（v2 非破坏性）。硬约束：不破坏历史模板、零迁移、零宿主改动。
- 注册表 `core/src/designer/element-plugin-registry.ts`，状态挂 `globalThis[Symbol.for('worm-vue3-print.element-plugin-registry.v1')]`；`defineElementPlugin` / `registerElementPlugin`（句柄只注销自己那版）/ `configurePlugin` 惰性配置 / `legacyAliases`。类型扩展点 `PluginElementTypeMap`（空接口 + declare module）。
- 契约 legacy/strict 双模式：模板顶层无 `plugins` 键 = 宽松 warning；有清单才严格（`MISSING_PLUGIN` / `PLUGIN_VERSION_MISMATCH`）。`kinds.ts` 与 MCP `print_draft_template` 都走 `getElementKinds()` 动态注册态。
- 通用出图协议 `core/src/print/assets.ts`：`ElementRenderSpec` / `renderAssets` / `collectExecutorBundles`；`renderers` 已透传六条渲染路径（单页/批量/拼版/多页/浏览器预览/设计器预览）。
- 装配口径：三端 `createDomHostRuntime(factory, coreBundle, undefined, collectExecutorBundles())`；服务端/Electron 副作用 import `echarts/node`，浏览器/设计器 import `echarts`。`collectExecutorBundles()` 只收 `render.executorBundle()` 的插件（只给 `createRenderer()` 的走进程内 SSR）。
- canvas 属性台：`useElementExtensionRegistry` 的 `ElementPropertyTab` + `resolveElementPropertyTab` 是唯一判据；`registerElementExtension` 保留为兼容别名，同 type 时优先。
- 基线/守卫：`docs/superpowers/specs/baseline/` 逐字基线受 `legacy-baseline.test.ts` / `three-end-baseline.spec.ts` / `generic-assets.spec.ts` 保护；架构守卫用 `PLUGIN_RENDER_LIBS` 数据清单。
- ECharts SSR 的 zrender class 名含进程级递增计数器，逐字基线须固定顺序或归一化 `zr\d+-(?:cls-\d+|c\d+)`。
- 测试坑：mount `PrintDesigner` 的元素必须带 `printElementType:{type,title}`；`isVisible()` 对根节点 `v-show` 不可靠，断言 style。

## 表格「多级表头」语义

- Excel 行×列矩阵，无独立分组模型；多级表头 = 多行 header + rowspan/colspan。
- 合并不能跨行类型（`canMergeReason`），header 区 rowspan 天然闭合。
- **重复粒度是「表头区」不是「单行」**：区内任一行 `repeatOnPage` → 整区重复（`countRepeatHeader`）；续片传 `rowLimit=repeatCount` 裁剪越界 rowspan。
- 新增 header 行继承相邻行 `repeatOnPage`；开关走 `setHeaderRepeat(rows, enabled)`。

## 其他

- MCP 基础 11 工具 + 条件注入 `print_preview_template`（需 `PRINT_RENDER_BASE_URL`+key）；`print_render_preview` 桌面端不可见是设计如此；桌面端拒 `templatePath`。元素种类以 `print_element_kinds` 实时为准。
- 技能：MCP 相关放用户级（`~/.workbuddy/skills/print-mcp-designer`），仓库开发放项目级（`.workbuddy/skills/worm-vue3-print-project-map`）；仓库 `skills/` 是分发给宿主的，不参与本机发现。
- 写文档前核实 API 是否真从主入口导出；render 截图接口对 `printData` 只渲染首条，PDF 才全量。
