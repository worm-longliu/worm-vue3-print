# 页面背景色（pageBackground）设计

## 背景与目标

设计画布与打印预览中，纸张本身没有背景色概念——预览纸张恒为白底，且与打印/PDF 输出没有统一的「页面背景色」支持。本次希望在模板上新增一个**可选的页面背景色字段**，让设计画布、打印预览 HTML、导出 PDF 三处渲染同一底色。未设置时行为保持不变（白色纸张）。

## 需求要点（已与用户确认）

- 新增模板级页面背景色字段 `pageBackground?: string`（可选）。
- 设计画布纸张实时显示该背景色。
- 浏览器打印预览与本机打印/导出 PDF 使用同一背景色。
- 提供设计器「页面属性」面板的颜色选择 UI 控件。
- 未设置 `pageBackground` 时全部保持白色，不改变存量模板行为。

## 变更内容

### 1. 类型：新增可选字段

- `packages/print-core/src/render/types.ts` → `TemplateData` 增加 `pageBackground?: string`
- `packages/print-canvas/src/types.ts` → `TemplateData` 增加 `pageBackground?: string`

### 2. 核心渲染：`css-builder.ts`

`buildPageCss` 中 `.print-page` 增加：

```
background: ${template.pageBackground ?? '#fff'};
```

配合既有的 `print-color-adjust: exact`（上一修复已加入），预览与打印/PDF 背景色一致。

### 3. 设计画布：`CanvasPaper.vue`

`paperStyle.background` 由 `'var(--pd-paper, #fff)'` 改为：

```
templateData.pageBackground || 'var(--pd-paper, #fff)'
```

画布实时反映配置的页面背景色。

### 4. UI 控件：`PropertyPanel.vue`

「页面属性」tab 的「纸张设置」区块新增「页面背景色」一行，复用现有 `PresetColorPicker`，并提供「默认(白)」清除按钮（设回 undefined）。

### 5. 序列化透传

`getTemplateJson` / `loadTemplate` / 历史记录已通过 `...templateData.value` 展开，`pageBackground` 自动保留与恢复，无需额外改动。

## 测试

- `html-generator.test.ts`：新增用例断言 `.print-page` 设置了 `background`；未设置时默认 `#fff`。
- 运行 `npm run test --workspace @worm-vue3-print/core` 全量通过。

## 非目标

- 不引入页面背景图片（仅背景色）。
- 不修改服务端 PDF（Playwright）路径（当前演示走浏览器原生打印）。
