# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.2.0] - 2026-09-10

### 新增

- `@worm-vue3-print/canvas`：新增帮助文档模态框（HelpModal），包含功能介绍、快捷键一览、常见问题等帮助内容。
- `@worm-vue3-print/canvas`：标尺参考线增强——支持拖拽添加参考线、双击编辑、删除，参考线对齐吸附实时显示。

### 变更

- `@worm-vue3-print/canvas`：优化缩放逻辑，取消放大上限，支持滚轮乘性步进缩放，修复缩放锚点漂移问题。
- `@worm-vue3-print/canvas`：移除设计态元素左上角的 fx 绑定标签提示，简化元素视觉呈现。

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

## [1.0.0] - 2026-09-02

### 新增

- 首次开源发布。
- `@worm-vue3-print/core`：模板表达式引擎与同构渲染管线（HTML 生成/分页/数据绑定）。
- `@worm-vue3-print/canvas`：Vue 3 可视化打印模板设计器画布。
- 渲染微服务拆分为独立仓库 `worm-vue3-print-render`（仅 Docker 部署，不上 npm）。
