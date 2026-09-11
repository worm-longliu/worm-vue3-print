# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 变更

- 渲染微服务 `worm-vue3-print-render` 并入本 monorepo，落地为私有服务包 `services/print-render`（包名 `@worm-vue3-print/render` 保持不变，不发布 npm）；通过 npm workspace 本地软链依赖 `@worm-vue3-print/core`，不再从 npm registry 安装 core。
- 根工作区新增 `services/*` 分层；`npm run build` 同时构建 render，根 `npm test` 仍只覆盖 core/canvas，render 的浏览器集成测试由 CI 独立 job 执行。
- 新增根 `.npmrc`：Playwright 浏览器不随依赖安装自动下载，本地/CI 按需执行 `npx playwright install chromium`，Docker 镜像使用基础镜像内置 Chromium；Docker 构建上下文改为仓库根（`docker build -f services/print-render/Dockerfile .`）。
- demo（`demo/`）新增服务端 PDF 打印：顶栏显示渲染服务在线状态，「服务端 PDF」按钮经 Vite dev 代理（`/render-api/*`，代理层注入 `X-Render-Key`）调用 render 微服务，取当前画布 JSON + 示例数据两遍渲染出 PDF 并新标签页打开。

## [1.2.2] - 2026-09-11

### 变更

- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/designer`——框架无关的设计器内核，包含完整模板模型类型、通用工具（元素工厂、表格矩阵、单位换算、模板迁移、标尺等）与纯交互逻辑（对齐、分组、键盘、缩放、吸附计算），无 Vue/React 等框架依赖。
- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/browser`——浏览器侧渲染适配器（`renderHtmlPages` 两遍分页渲染、`browserCodeRenderer` 条形码/二维码渲染）。
- `@worm-vue3-print/canvas`：设计器模型、工具与纯逻辑下沉至 core 子路径，canvas 仅保留 Vue 适配层；公共导出 API 保持不变，core 主入口仍保持零运行时依赖。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏放大/缩小按钮直接线性修改缩放比例、未做滚动锚点校正导致画面漂移的问题；按钮缩放改为与 Ctrl+滚轮一致的乘性步进，并以视口中心为锚点（与「适应窗口」同一缩放管线）。

## [1.2.1] - 2026-09-11

### 变更

- `@worm-vue3-print/canvas`：工具栏编辑区/层级区/视图区图标按钮统一使用 data-tip 自定义悬浮提示，补齐「网格」「吸附」缺失提示；提升提示层级，不再被画布顶部标尺遮挡。
- `@worm-vue3-print/canvas`：优化「适应窗口」——以视口中心为锚点一步缩放到位（与 Ctrl+滚轮同一缩放换算管线），缩放平滑过渡；允许低于交互缩放下限（最小可至 5%），超大纸张也能整版容纳，纸张在画布视口内水平垂直居中。
- `@worm-vue3-print/canvas`：新增 `showHelp` 配置——控制帮助入口（帮助按钮与帮助弹框）显示，默认开启，传入 `false` 即可隐藏。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏悬浮提示气泡被画布顶部固定标尺遮挡无法显示的问题。
- `@worm-vue3-print/canvas`：修复「适应窗口」后超大纸张仍残留滚动条、纸张未在画布视口居中（垂直偏上）的问题。

### 文档

- 新增打印设计工作台布局线框图文档（`docs/中文/打印设计工作台-布局线框图.md`），标注各区域名称、功能与对应组件文件，便于后续布局调整。

## [1.2.0] - 2026-09-10

### 新增

- `@worm-vue3-print/canvas`：新增帮助文档模态框（HelpModal），包含功能介绍、快捷键一览、常见问题等帮助内容。
- `@worm-vue3-print/canvas`：标尺参考线增强——支持拖拽添加参考线、双击编辑、删除，参考线对齐吸附实时显示。
- `@worm-vue3-print/canvas`：表格列宽拖拽新增末列右边界手柄，可直接拖拽调整末列宽并受 `maxTableWidth` 钳制。

### 变更

- `@worm-vue3-print/canvas`：优化缩放逻辑，取消放大上限，支持滚轮乘性步进缩放，修复缩放锚点漂移问题。
- `@worm-vue3-print/canvas`：移除设计态元素左上角的 fx 绑定标签提示，简化元素视觉呈现。

### 文档

- 仓库根目录新增 `AGENTS.md` AI 代理行为规范文件，明确代理在本仓库工作时的语言、专家态度、协作约定等强制要求。
- 新增 `worm-vue3-print` 集成支持 skill（`skills/worm-vue3-print-integration/`），包含安装指南、集成 API、故障排查等参考文档。

### 修复

- `@worm-vue3-print/canvas`：修复表格列宽拖拽存在的多个缺陷——内部列边界向左拖时左列宽度不变导致边界线不跟随光标、px→mm 单位换算缺失导致拖拽距离存在约 3.78 倍偏差、`table-layout:fixed` 下拖拽过程中表格 CSS `width(100%)` 与列宽和失配导致浏览器按比例拉伸列使边界线与右侧内容偏离光标；同时删除 `onColResizeStart` 中残留的 `document.title` 调试代码。

## [1.1.0] - 2026-09-06

### 新增

- `@worm-vue3-print/canvas`：表格元素支持列宽拖拽——设计态选中表格后，在列边界悬停并拖动即可调整该列宽（左侧列），实时更新画布与元素尺寸；受打印范围宽度（`maxTableWidth`）与最小列宽（5mm）钳制，拖拽结束后计入一次撤销历史。属性面板的列宽数值输入保留作为精确输入兜底。
- `@worm-vue3-print/canvas`：表格单元格支持图片类型——单元格可切换为图片类型，设计态支持选择图片与设置 fit/maxWidth/maxHeight，预览与打印输出完整渲染。
- `@worm-vue3-print/canvas`：条形码与二维码单元格支持 fit/maxWidth/maxHeight 属性。
- `@worm-vue3-print/canvas`：属性面板位置尺寸改用 StepperInput 控件，支持按钮微调数值；StepperInput 支持可选值列表和小数步进。
- `@worm-vue3-print/canvas`：新增统一颜色选择器并重构属性面板字段分组。
- `@worm-vue3-print/canvas`：支持页面（纸张）背景色 `pageBackground`，预览与打印/PDF 输出一致。
- `@worm-vue3-print/canvas`：支持 canvas 库模式构建与 npm 发布。

### 修复

- `@worm-vue3-print/canvas`：打印/导出 PDF 保留元素背景色（`print-color-adjust: exact`）。
- `@worm-vue3-print/canvas`：打印预览保留元素重叠，表格下方跟随元素按设计坐标绝对定位并透传层级 z-index。
- `@worm-vue3-print/canvas`：打印页眉页脚区域贴页面底部，修复页边距失效。
- `@worm-vue3-print/canvas`：条形码渲染缺少 `object-fit: contain`。
- `@worm-vue3-print/canvas`：修复 canvas 测试在 vitest v4 + happy-dom 环境下 `localStorage` 未定义的问题，补充 mock 以兼容测试环境。

## [1.0.0] - 2026-09-02

### 新增

- 首次开源发布。
- `@worm-vue3-print/core`：模板表达式引擎与同构渲染管线（HTML 生成/分页/数据绑定）。
- `@worm-vue3-print/canvas`：Vue 3 可视化打印模板设计器画布。
- 渲染微服务拆分为独立仓库 `worm-vue3-print-render`（仅 Docker 部署，不上 npm）。
