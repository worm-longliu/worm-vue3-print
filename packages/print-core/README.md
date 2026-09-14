# @worm-vue3-print/core

打印模板表达式引擎与**同构渲染管线**（数据绑定 / HTML 生成 / 分页 / 测量元素），纯 TypeScript。

```
print-core/
  src/
    lexer.ts / parser.ts / evaluator.ts / template-parser.ts   # 模板表达式引擎
    functions/                                                # formatMoney / formatDate / sum / concat 等
    render/
      data-binder.ts        # 变量/表达式绑定
      html-generator.ts     # 模板 JSON → HTML/CSS/SVG
      pagination-engine.ts  # 表格分页、重复表头、小计/汇总
      css-builder.ts        # mm 单位布局 → CSS
      expression-eval.ts    # 表达式安全求值（safelist）
      types.ts              # 模板/请求类型（JSON 可序列化）
    designer/                                       # 框架无关的设计器内核（无 Vue/React 依赖）
      types.ts              # 设计器完整模板模型（TemplateData/RuntimeElement 等）
      utils/                # 元素工厂/表格矩阵/单位换算/迁移/吸附参考线等通用工具
      interactions/         # 对齐/分组/缩放/键盘/吸附等纯交互逻辑
    browser/                # 渲染管线浏览器适配器（iframe 两遍分页、jsbarcode/qrcode）
```

`core` 无 Vue、无宿主依赖，可在 Node 服务端（`@worm-vue3-print/render`）与浏览器端（`@worm-vue3-print/canvas`）共用，
保证「浏览器预览」「服务端 PDF」「桌面客户端出图」共用同一套算法（逻辑同源；像素级一致还需三端字体与 Chromium 内核同源）。

### 打印管线（`print/`，纯 TS）

- 入口：`prepareDocument(job, runtime)`、`renderPdf(job, runtime)`、`renderScreenshot(job, runtime)`；
- 规格：`buildPdfTargetSpec`、`toElectronPrintToPdfOptions`（英寸）、`toPlaywrightPdfOptions`（mm）、`buildScreenshotTargetSpec`；
- 纸张：`resolvePaperMm`（宿主覆盖逃生门）、`paperViewportPx`（测量容器 mm→px）、`escapeHeightMm`（连续纸纸高逃生门）；
- 契约：`PageDriver`（宿主只实现 open/setContent/injectExecutor/evaluate 与可选 pdf/screenshot）+
  `createDomHostRuntime(driverFactory, bundle)`（共享的载入→注入→就绪→执行→释放时序、超时预算与错误归一化）；
- DOM 能力：`@worm-vue3-print/core/browser` 导出执行器与 iframe driver；`@worm-vue3-print/core/node` 的
  `loadExecutorBundle()` 供 Node 宿主读取 `dist/dom-executor.iife.global.js` 注入页面。

### 子路径导出

| 子路径 | 内容 | 运行环境 |
| --- | --- | --- |
| `@worm-vue3-print/core` | 表达式引擎 + 同构渲染管线（零运行时依赖） | Node / 浏览器 |
| `@worm-vue3-print/core/designer` | 设计器模型类型、通用工具、纯交互逻辑 | 任意（交互中的 DOM 事件绑定需浏览器） |
| `@worm-vue3-print/core/browser` | 浏览器分页渲染（`renderHtmlPages`）、条形码/二维码渲染器 | 仅浏览器 |

> 注意：`/designer` 子路径的 `TemplateData` 等类型是设计器完整模型，与主入口渲染管线的简化同名类型有意分离，因此不从主入口转出。

## 使用

```ts
import { generateHtml, paginate, bindData } from '@worm-vue3-print/core'

const bound = bindData(templateJson, printData)
const pages = paginate(bound, measured, options)
const html = generateHtml(pages)
```

## 在 Vue 3 项目中使用（与 `@worm-vue3-print/canvas` 配合）

`core` 的同构渲染管线由 `@worm-vue3-print/canvas` 的 `PrintHtmlPreview` 组件内部调用，
浏览器端接入无需直接调用 `core` API。以下配置与仓库 `demo/App.vue` 保持一致：

```ts
import { PrintDesigner, PrintHtmlPreview, createDefaultTemplate } from '@worm-vue3-print/canvas'
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
// 设计器内部控件基于原生样式，需全局引入一次
import '@worm-vue3-print/canvas/native-controls.css'
```

```vue
<template>
  <PrintDesigner
    ref="designerRef"
    :initial-template="templateData"
    :fields="fields"
    :is-edit="true"
    :show-help="true"
    @preview="onPreview"
    @save="onSave"
  />

  <!-- 「加载默认布局」等业务入口由宿主自渲染，不在设计器工具栏内 -->
  <button type="button" @click="onLoadDefaultLayout">加载默认布局</button>

  <!-- 浏览器端免保存预览：直接使用当前画布 JSON + 业务数据 -->
  <Teleport to="body">
    <PrintHtmlPreview
      v-if="previewVisible"
      ref="htmlPreviewRef"
      :template-json="previewTemplateJson"
      :print-data="printData"
      @rendered="(n) => previewPages = n"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const templateData = ref<TemplateData>(/* 初始模板 TemplateData */)
const fields = ref<PrintBusinessField[]>(/* 业务字段 PrintBusinessField[] */)
const designerRef = ref<InstanceType<typeof PrintDesigner> | null>(null)
const previewTemplateJson = ref<Record<string, any> | null>(null)

function onPreview() {
  const json = designerRef.value?.getTemplateJson?.()
  if (!json) return
  previewTemplateJson.value = json
}

function onSave(json: string) {
  // 宿主持久化模板 JSON
}

/** 加载默认布局：宿主自实现；示例造空白默认模板，真实宿主可拉取服务端默认模板 */
function onLoadDefaultLayout() {
  if (!confirm('将覆盖当前画布内容，是否继续？')) return
  templateData.value = createDefaultTemplate()
}
</script>
```

关键 props / 事件 / 方法：

- `initial-template`：初始模板 `TemplateData`；`fields`：业务字段 `PrintBusinessField[]`；`is-edit`：是否编辑态。
- `show-help`：帮助入口开关，默认开启，传入 `false` 可关闭帮助按钮与帮助弹框。
- `getTemplateJson()`：通过 `ref` 获取当前画布模板 JSON，用于预览 / 保存。
- 模板加载 / 重置（如「加载默认布局」）属于宿主业务：把新的 `TemplateData` 赋给
  `initial-template` 即可重载画布并记录一次历史（撤销可回退），设计器工具栏不内置该入口。
- `@preview` / `@save`：预览与保存事件，具体业务（字段查询、持久化）由宿主实现。
- 需要服务端 / Node 输出时，直接调用 `core` 的 `bindData` / `paginate` / `generateHtml` 即可。

## 相关链接

- Gitee：https://gitee.com/liulong_oschina/worm-vue3-print
- GitHub：https://github.com/worm-longliu/worm-vue3-print

抖音码：

<p align="center">
  <img src="../../douyin.png" width="180" alt="抖音码" />
</p>

## 开发

```bash
npm run build   # tsup → dist/index.js + index.cjs + d.ts
npm test        # vitest
```
