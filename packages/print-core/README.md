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
```

`core` 无 Vue、无宿主依赖，可在 Node 服务端（`@worm-vue3-print/render`）与浏览器端（`@worm-vue3-print/canvas`）共用，
保证「浏览器预览」与「服务端 PDF」结果一致。

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
    :load-default-template="loadDefaultTemplate"
    :show-help="true"
    @preview="onPreview"
    @save="onSave"
  />

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

function loadDefaultTemplate() {
  return createDefaultTemplate()
}
</script>
```

关键 props / 事件 / 方法：

- `initial-template`：初始模板 `TemplateData`；`fields`：业务字段 `PrintBusinessField[]`；`is-edit`：是否编辑态。
- `load-default-template()`：可选。「加载默认布局」回调（支持异步，返回 null/undefined 视为无
  默认布局）；未注入时工具栏不展示该按钮。
- `show-help`：帮助入口开关，默认开启，传入 `false` 可关闭帮助按钮与帮助弹框。
- `getTemplateJson()`：通过 `ref` 获取当前画布模板 JSON，用于预览 / 保存。
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