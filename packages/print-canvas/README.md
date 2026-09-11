# @worm-vue3-print/canvas

Vue 3 可视化打印模板设计器画布（`worm-vue3-print` monorepo）。纯 Vue 3 + HTML/CSS/SVG +
原生控件实现，**不依赖 Element Plus、不依赖宿主 API/路由/租户**。模板保存、字段查询、
截图、图片上传、消息提示等能力由宿主通过 props / 事件 / 适配器注入。

## 安装

```bash
npm install @worm-vue3-print/canvas @worm-vue3-print/core
```

## 宿主接入

接入配置与仓库 `demo/App.vue` 保持一致：

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

- `initial-template`：初始模板 `TemplateData`；`fields`：业务字段（宿主查询后传入，扁平
  `PrintBusinessField[]`）。`fieldKey` 为打印数据中的完整路径（如 `supplier.name`、
  `receiver.phone`、`goods.spec`），字段树/表达式编辑器按首段自动分组；无点且作为其它字段
  前缀的记录为分组容器（如 `supplier`、`goods`），其中 `fieldType: 'list'` 的容器（如
  `goods`）作为表格「列表数据源」选项，拖拽/双击叶子字段插入的表达式即为完整路径
  `{goods.spec}`。左侧字段树、表达式编辑器、绑定下拉均以此为唯一数据源。
- `is-edit`：是否编辑态。
- `load-default-template()`：可选。返回默认布局 `TemplateData`（支持异步，返回 null/undefined
  视为无默认布局）；未注入时工具栏不展示「加载默认布局」按钮。
- `show-help`：帮助入口开关，默认开启，传入 `false` 可关闭帮助按钮与帮助弹框。
- `getTemplateJson()`：通过 `ref` 获取当前画布模板 JSON，用于预览 / 保存。
- `requestScreenshot({ templateJson, printData }) => Promise<Blob>`：叠层对比截图。
- `uploadImage(file) => Promise<string>`：图片元素上传，返回可访问 URL。
- `@preview` / `@save`：预览与保存事件，具体业务（字段查询、持久化、截图适配）由宿主实现。

> 模板名称、业务类型、备注等元信息不属于设计器核心：模板 JSON 不含元信息，宿主在自己的
> 列表/保存流程中管理。

## 相关链接

- Gitee：https://gitee.com/liulong_oschina/worm-vue3-print
- GitHub：https://github.com/worm-longliu/worm-vue3-print

抖音码：

<p align="center">
  <img src="../../douyin.png" width="180" alt="抖音码" />
</p>

## 开发

```bash
cd worm-vue3-print
npm install
cd packages/print-canvas
npm test          # vitest（happy-dom + @vue/test-utils）
```

> 构建产物位于 `dist/`，使用 Vite Vue 库模式构建（external Vue，抽离 CSS，生成 d.ts）。
