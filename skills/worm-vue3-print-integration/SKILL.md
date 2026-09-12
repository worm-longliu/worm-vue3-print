---
name: worm-vue3-print-integration
description: 用于在 Vue 3 项目中集成 @worm-vue3-print/core 或 @worm-vue3-print/canvas（可视化打印模板设计器）；覆盖 NPM/源码安装、设计器接入、业务字段契约、浏览器打印与服务端 PDF（print-render 微服务）两条链路、宿主最小清单、AI 快速集成提示词与故障排查。
version: 1.1.0
---

# worm-vue3-print 集成支持

在修改用户项目前，先判断集成目标，再选择安装方式与打印链路。不要默认所有用户都需要源码安装，也不要默认都需要服务端 PDF。

## 1. 先确认集成场景

| 场景 | 需要的包 | 推荐安装方式 |
| --- | --- | --- |
| 只做表达式求值、模板数据绑定、服务端 HTML/分页管线 | `@worm-vue3-print/core` | NPM 包 |
| 需要 Vue 3 可视化设计器或浏览器端打印预览 | `@worm-vue3-print/canvas` + `@worm-vue3-print/core` | NPM 包 |
| 需要未发布修复、调试库源码、修改/回传补丁 | `core`，按需 `canvas` | 源码安装 |
| 外部宿主要直接消费 monorepo 中的 `.vue/.ts` | 两者按需 | 源码 + Vite 别名 |
| 服务端 PDF / 截图微服务 | monorepo 内 `services/print-render`（private 服务包，workspace 软链 core，**不发布 npm**） | 按 [服务端渲染](references/server-render.md) 部署 |

生产项目优先 NPM 包；当前已发布版本为 **1.2.2**。只有用户明确要改/调试库源码、消费未发布代码，或项目本身就在本 monorepo 中，才用源码安装。安装细节见 [安装方式](references/installation.md)。

## 2. 先让用户选打印链路（关键决策）

集成设计器后，「打印」有两条独立链路，可二选一，也可并存：

| | 链路 A：浏览器打印 | 链路 B：服务端 PDF |
| --- | --- | --- |
| 渲染位置 | 用户浏览器（`PrintHtmlPreview` 同构渲染 + `window.print`） | 服务端 `print-render` 微服务（Playwright Headless Chromium 两遍渲染） |
| 额外基础设施 | 无 | 需部署 Node 微服务（Linux 需 Chromium + 中文字体） |
| 产出 | 调起浏览器打印对话框 | `application/pdf` 字节流（可下载/归档/批量） |
| 宿主后端职责 | 返回 `{templateJson, printData, baseUrl}` | 额外持有渲染密钥、代理转发 `/render/pdf`、组装业务数据 |
| 适用 | 交互式打印、快速落地 | 电子存档、无界面批量、脱离浏览器的 PDF 产出 |

真实全栈宿主通常**两者并存**：业务页点打印先走 A 做全屏预览与浏览器打印，预览弹窗里「下载 PDF」按钮按需走 B。链路判定与最小集合见 [全栈宿主集成指南](references/host-integration-guide.md)，微服务对接见 [服务端渲染](references/server-render.md)。

## 3. 快速工作流

1. 读取用户项目的构建器、Vue 版本（canvas 要求 `vue@^3.5.0`）、TypeScript 配置和现有上传/文件能力。
2. 按 [安装方式](references/installation.md) 选择 NPM 或源码方案，先安装并验证可解析。
3. 与用户确认打印链路（A / B / 并存）。
4. 按 [接入 API](references/integration-api.md) 引入组件与样式，再按 [全栈宿主集成指南](references/host-integration-guide.md) 落地模板管理、设计器页、业务打印入口与后端契约。
5. 用一条最小链路验证：设计器保存 JSON → 预览渲染 → 浏览器打印；链路 B 再加「模板 JSON + printData → 后端 → render 服务 → PDF」。
6. 出现样式、类型、依赖解析、打包或 PDF 问题时，按 [故障排查](references/troubleshooting.md) 定位，不要先改用户业务代码。

## 4. 宿主最小清单速查

无论技术栈，接入设计器需要宿主自行提供以下能力（库不内置任何业务后端）：

**前端（5 个必备片段）**
1. 模板管理列表页：模板元信息（名称/业务类型/备注/默认标记）的增删改查。
2. 设计器页：挂载 `PrintDesigner`，`save` 事件提交模板 JSON，`preview` 事件打开预览。
3. 新建模板弹窗：元信息表单 + 用 `createDefaultTemplate()` 生成可渲染的初始 elements。
4. 业务打印入口（按钮组件）：按业务类型选模板 → 向后端取 `{templateJson, printData, baseUrl}` → 打开预览。
5. 预览弹窗：`PrintHtmlPreview` 全屏预览 + `print()`；链路 B 再加「下载 PDF」。

**后端（任意语言/框架）**
1. 模板表：至少 `id / name / business_type / elements(text) / paper_config / remark / is_default`。
2. 业务字段元数据来源：返回 `PrintBusinessField[]`（`fieldKey/fieldLabel/fieldType/sortOrder` 契约，见接入 API）；可硬编码、配置表或注解反射生成。
3. 模板 CRUD + 设计器初始化聚合功能（一次返回模板 + 字段树 + 可选示例数据）。
4. 渲染数据组装功能：按模板 id + 业务单据 id 组装 `printData`，返回 `{templateJson, printData, baseUrl}`（链路 A）。
5. 链路 B：代理 `print-render` 的 PDF/截图端点，注入 `X-Render-Key`，组装业务数据后透传。

完整代码骨架与真实案例拆解见 [全栈宿主集成指南](references/host-integration-guide.md)。

## 5. 用 AI 工具快速集成（可直接复用的提示词）

当用户要让 AI 编程工具（opencode / Claude Code / Codex 等）在其项目中完成集成时，给 AI 的提示词应包含「先读规范再动手」的门控。可直接复制以下骨架并按项目填充：

```text
第 0 步（门控，未完成禁止改代码）：
1. 完整阅读打印设计器集成技能文档：SKILL.md 及 references/ 下
   installation.md、integration-api.md、host-integration-guide.md
   （链路 B 再加 server-render.md）、troubleshooting.md。
2. 先输出「已读规范确认」：逐个列出文件路径 + 与本任务相关的 3 条以上约束。
3. 阅读本项目的 AGENTS.md / README / 构建配置，确认 Vue 版本与包管理器。
4. 任一文档不存在或读不懂，先提问，禁止臆测 API。

集成要求：
- 安装方式：【NPM 包 / 源码别名】；打印链路：【A 浏览器 / B 服务端 PDF / 并存】。
- 按技能「宿主最小清单」实现前端 5 个片段与后端契约，复用项目现有的
  请求封装、UI 组件库、上传接口与代码风格，不引入额外 UI 依赖。
- 业务字段按 PrintBusinessField 契约由【后端接口/本文件常量】提供。
- 模板 JSON（elements）与宿主元信息分开存储；元信息由宿主表维护。

验收标准：
- 类型检查/构建通过；设计器能保存模板 JSON 并再次打开回填。
- 最小链路跑通：保存 → 预览渲染出含真实业务数据的页面 → 浏览器打印
  （链路 B：后端代理返回可下载的 application/pdf）。
- 不使用文档之外的组件方法/事件（例如不存在 setTemplateMeta、back 事件）。
```

使用 opencode 委托时，把技能文件用 `opencode run '<提示词>' -f SKILL.md -f <reference>` 附加进上下文，并在其产出后按第 6 节验收。

## 6. 验收要点（委托或集成完成后逐项核对）

- 安装方式与样式导入匹配：NPM/`file:` 用 `@worm-vue3-print/canvas/style.css`，源码别名才用 `native-controls.css`。
- `PrintDesigner` 只使用真实契约：props `initial-template/fields/is-edit/request-screenshot/upload-image/load-default-template`，事件仅 `save/preview`，实例方法仅 `getTemplateJson()`。
- 没有调用不存在的 `setTemplateMeta`、监听不存在的 `back` 事件。
- 模板 JSON 与宿主元信息分离；列表/详情能正确回填 elements。
- 链路 A 预览与打印用同一份 `templateJson + printData + baseUrl`。
- 链路 B：密钥只在服务端/代理层，不进前端 bundle；render 服务 `/health` 可达，Linux 已装中文字体。
- 表格数据：明细 `fieldType:'list'`、列表达式用完整路径（如 `{goods.name}`）、printData 对应字段为数组。

## 7. 关键约束

- `core` 是纯 TypeScript，无 Vue 依赖；`canvas` 才依赖 Vue 3，边界不能倒置。
- `canvas` 的 peer 依赖是 `vue@^3.5.0`，安装后必须核对 Vue 版本。
- NPM 包样式入口是 `@worm-vue3-print/canvas/style.css`；`native-controls.css` 仅源码别名方式可用。
- `PrintDesigner` 事件只有 `save(json)` 与 `preview()`；expose 只有 `getTemplateJson()`。不要据旧文档假设 `back` 事件或 `setTemplateMeta` 方法。
- 常用导出：`PrintDesigner`、`PrintHtmlPreview`、`createDefaultTemplate`、`DEFAULT_DEMO_DATA`/`getDemoData`（均来自 `@worm-vue3-print/canvas`；后两者由 `core/designer` 转出）。
- 模板 JSON 不含名称、业务类型、备注等宿主元信息，元信息由宿主自行持久化。
- 服务端 PDF/截图由独立微服务 `services/print-render` 承担；`core` 只提供同构渲染管线。接入方业务仓库不要虚构 `/render/pdf` 的实现。
