# 设计背景（designBackground）设计

## 背景与目标

部分打印场景（如套打票据、预制表单、标签）中，用户需要对着一张真实单据/表单扫描图摆放元素，做视觉对位。当前设计器只有每 5mm 的虚线网格，缺少「打底图」能力。

本次新增**设计背景（定位底图）**：宿主通过自定义上传接口提供一张图片，设计器将其铺在纸张最底层用于对位；该背景**仅在设计画布显示，不出现在预览、PDF 与实际打印输出中**。

设计器内对背景图只提供**旋转**能力（90° 步进），不做缩放、位移、透明度等调整。

## 需求要点（已与用户确认）

- 模板 JSON 新增设计背景字段，保存宿主上传接口返回的**完整图片路径**。
- 新增一个由宿主定义实现的**背景图上传接口**（与现有元素图片上传 `uploadImage` 相互独立），约定返回值为可直接访问的完整图片路径（绝对 URL 或完整可访问地址）。
- 设计画布纸张最底层显示背景图，默认铺满整张纸。
- 设计器内支持将背景图按 90° 步进旋转（0 → 90 → 180 → 270 循环）。
- 背景图不拦截鼠标操作，不影响元素的选中、拖拽、缩放。
- **预览（PrintHtmlPreview）与打印/PDF/截图渲染管线一律不输出背景图。**
- 未配置上传接口时，上传入口禁用；未设置背景时画布与现状完全一致。
- 支持移除已设置的背景图。

## 与现有「叠层对比」的区别

设计器已有「叠层对比」功能（工具栏按钮，经 `requestScreenshot` 取当前模板渲染截图做半透明叠加），与本需求无关，不改动：

| 维度 | 叠层对比（既有） | 设计背景（本次） |
| --- | --- | --- |
| 图片来源 | 模板实时渲染截图（blob URL） | 宿主上传，完整路径，持久化 |
| 生命周期 | 临时，关闭即弃 | 随模板 JSON 保存 |
| 旋转 | 不支持 | 支持 90° 步进 |
| 用途 | 渲染结果与设计稿比对 | 对着真实单据摆放元素（套打对位） |

## 数据模型

`packages/print-core/src/designer/types.ts` 的设计器 `TemplateData` 新增字段（与既有 `guides`「设计态辅助、序列化保留、渲染端忽略」同模式）：

```ts
/** 设计背景（定位底图）：仅设计画布显示，用于套打对位；预览与打印管线一律忽略 */
designBackground?: {
  /** 宿主上传接口返回的完整图片路径 */
  src: string
  /** 旋转角度，仅允许 0 | 90 | 180 | 270，默认 0 */
  rotation: 0 | 90 | 180 | 270
}
```

要点：

- 字段只加在**设计器类型** `designer/types.ts`；渲染端 `render/types.ts` 的 `TemplateData` **不声明**该字段。
  渲染消费的是独立渲染模型，结构上无法读取该字段，从类型层面保证底图不进入打印管线（与 `guides` 相同的隔离方式）。
- 旧模板无该字段即为「无背景」，行为不变；`migrate.ts` 无需迁移（字段可选、渲染端忽略）。
- 旋转值规范化：读取时非 90 整数倍按 0 处理。

## 宿主上传接口

`packages/print-core/src/designer/types.ts` 新增函数类型，并经 `core/designer` 子路径导出：

```ts
/**
 * 设计背景图上传适配器（由宿主实现注入）。
 * 入参为用户选择的图片文件；返回值必须是可直接 <img src> 访问的完整图片路径。
 */
export type UploadDesignBackgroundFn = (file: File) => Promise<string>
```

- 与现有 `UploadImageFn = (file: File) => Promise<string>` 形态一致，但**语义独立**：
  元素图片上传常返回相对路径并配合 `baseUrl`；设计背景要求返回**完整路径**，宿主自行决定存储位置与 URL 形态。
- `PrintDesigner` 新增可选 prop：`uploadDesignBackground?: UploadDesignBackgroundFn`。
- 经新的注入键下发（`useHostAdapter.ts` 新增 `UPLOAD_DESIGN_BACKGROUND_KEY`，模式同 `UPLOAD_IMAGE_KEY`：PrintDesigner `provide`，属性面板深层组件 `inject`）。
- 宿主接入方式与现有 `uploadImage` 完全相同：实现一个接收 `File`、返回完整路径 `Promise<string>` 的函数传入即可。未传入时上传按钮禁用。

## 变更内容

### 1. 类型：`print-core`

- `src/designer/types.ts`：`TemplateData` 增加 `designBackground?`；新增 `UploadDesignBackgroundFn`。
- `src/designer/index.ts`：导出 `UploadDesignBackgroundFn`（确认与 `UploadImageFn` 同样的导出方式）。
- `src/render/types.ts`：**不改动**（渲染模型不感知该字段）。

### 2. 画布：`packages/print-canvas/src/components/CanvasPaper.vue`

- 在纸张容器（`.hiprint-printPaper`，相对定位、`overflow: hidden`）内、网格背景与水印层、所有区域元素**之下**，新增背景图层：
  - 仅当 `templateData.designBackground?.src` 存在时渲染；
  - `<img>` 设置 `draggable="false"`、`pointer-events: none`，不参与任何交互；
  - `z-index` 低于区域层，避免遮挡元素。
- 铺满与旋转规则：
  - `rotation = 0/180`：图层宽=纸宽、高=纸高，左上角与纸张对齐，绕中心旋转。
  - `rotation = 90/270`：图层宽=纸高、高=纸宽，先居中（left/top 按交换后的尺寸回中），再绕纸张中心旋转，保证旋转后仍完整铺满、不裁切、不溢出。
  - 图片默认 `object-fit: fill`（打底扫描图通常与纸张等比；若不等比允许拉伸铺满——对齐以纸张边界为准）。
- 图片加载失败时降级为不显示并在控制台告警，不阻塞设计器使用（与元素图片失败兜底同思路）。

### 3. 属性面板：`packages/print-canvas/src/components/PropertyPanel.vue`

「页面属性」tab 中「页面背景色」一行下方新增「设计背景」小节：

- 未设置：
  - `上传背景图` 按钮（文件选择，`accept="image/*"`），调用注入的 `uploadDesignBackground`，成功后以 `{ src, rotation: 0 }` 写入 `designBackground`；
  - 宿主未注入适配器时按钮禁用（复用现有 `ImageContentUpload` 的禁用态模式，或同类按钮样式）；
  - 灰色说明文案：「仅设计器显示，用于套打定位，不会出现在预览和打印中」。
- 已设置：
  - 只读展示路径（超长省略，`title` 悬停看全文）；
  - `旋转` 按钮：rotation 按 0 → 90 → 180 → 270 → 0 循环；
  - `移除` 按钮：删除 `designBackground` 字段（置 `undefined`）。
- 所有修改通过现有 `update:templateData`（`emitUpdate`）提交，自动进入撤销/重做历史；无需为背景单独处理历史栈。

### 4. 组件 props 透传

- `PrintDesigner.vue`：新增可选 prop `uploadDesignBackground`，`provide(UPLOAD_DESIGN_BACKGROUND_KEY, computed(() => props.uploadDesignBackground))`。
- `composables/useHostAdapter.ts`：新增 `UPLOAD_DESIGN_BACKGROUND_KEY`。
- `index.ts`（canvas 包入口）：按需导出新注入键（与 `UPLOAD_IMAGE_KEY` 保持一致）。

### 5. 序列化透传

`getTemplateJson` / `loadTemplate` / 历史记录已通过整体展开 `templateData` 透传，`designBackground` 自动随模板保存与恢复，无需额外改动；实现时验证 `loadTemplate` 不会白名单过滤掉该字段。

## 预览与打印隔离保证

- 浏览器预览 `PrintHtmlPreview.vue`、core 渲染管线（`html-generator.ts` / `css-builder.ts`）、Playwright PDF、截图、桌面客户端打印均基于 `render` 侧 `TemplateData` 与 `generateHtml` 产物，不读取 `designBackground`。
- 背景图 DOM 只存在于设计画布组件中，渲染 HTML 中不存在对应节点，因此无需依赖打印 CSS（如 `@media print` 隐藏）来兜底。

## 测试

- `print-core` 渲染回归测试（`src/render/html-generator.test.ts`）：构造带 `designBackground: { src, rotation }` 的模板，断言生成的 HTML/CSS 中**不包含**该 `src`、不含任何背景图相关输出。
- `print-canvas` / `print-core`：`typecheck` 与 `build` 通过。
- 手工验证（demo 宿主注入一个测试上传函数）：
  1. 上传后画布最底层显示底图，元素可正常选中拖拽；
  2. 旋转四次循环正确，90/270 时铺满不溢出；
  3. 预览与浏览器打印（及 PDF）中无底图；
  4. 保存后重新加载模板，背景与旋转角度恢复；
  5. 移除后画布恢复、JSON 中无该字段；
  6. 宿主不传上传接口时按钮禁用。

## 非目标（YAGNI）

- 不支持背景图透明度调节、任意角度旋转、缩放/拖拽位移、水平/垂直镜像。
- 不支持多张背景图或分页不同背景。
- 不内置上传实现、不内置图片压缩；存储与可访问性完全由宿主负责。
- 不改动既有「叠层对比」功能与元素图片 `uploadImage` / `baseUrl` 机制。
- 背景图不参与打印输出，故不进入渲染管线、不做打印色/分辨率处理。
