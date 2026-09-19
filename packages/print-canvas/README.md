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

- `initial-template`：初始模板 `TemplateData`；`fields`：业务字段（宿主查询后传入，扁平
  `PrintBusinessField[]`）。`fieldKey` 为打印数据中的完整路径（如 `supplier.name`、
  `receiver.phone`、`goods.spec`），字段树/表达式编辑器按首段自动分组；无点且作为其它字段
  前缀的记录为分组容器（如 `supplier`、`goods`），其中 `fieldType: 'list'` 的容器（如
  `goods`）作为表格「列表数据源」选项，拖拽/双击叶子字段插入的表达式即为完整路径
  `{goods.spec}`。左侧字段树、表达式编辑器、绑定下拉均以此为唯一数据源。
- `is-edit`：是否编辑态。
- `show-help`：帮助入口开关，默认开启，传入 `false` 可关闭帮助按钮与帮助弹框。
- `getTemplateJson()`：通过 `ref` 获取当前画布模板 JSON，用于预览 / 保存。
- `validateTemplate()`：拼版配置校验结果（`TilingIssue[]`，合法为 `[]`）。宿主在「导出 / 另存」等直接消费
  `getTemplateJson()` 的链路上应先调用它，拦截列数超宽等非法配置（该路径绕不过保存按钮的闸门）。
- 模板加载 / 重置（如「加载默认布局」）属于宿主业务：把新的 `TemplateData` 赋给
  `initial-template` 即可重载画布并记录一次历史（撤销可回退）；设计器工具栏不内置该入口。
- `requestScreenshot({ templateJson, printData }) => Promise<Blob>`：叠层对比截图。
- `uploadImage(file) => Promise<string>`：图片元素上传，返回可访问 URL。
- `uploadDesignBackground(file) => Promise<string>`：设计背景（定位底图）上传，返回完整图片路径；背景仅设计画布显示，不进入预览与打印。
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
