# 接入 API 与数据契约

## 设计器 + 浏览器预览最小接入

```vue
<template>
  <div class="print-integration">
    <PrintDesigner
      ref="designerRef"
      :initial-template="template"
      :fields="fields"
      :is-edit="true"
      :load-default-template="loadDefaultTemplate"
      :upload-image="uploadImage"
      :request-screenshot="requestScreenshot"
      @save="onSave"
      @preview="onPreview"
    />

    <Teleport to="body">
      <div v-if="previewVisible" class="preview-mask" @click.self="previewVisible = false">
        <PrintHtmlPreview
          ref="previewRef"
          :template-json="previewTemplate"
          :print-data="printData"
          base-url="/files"
          @rendered="pageCount = $event"
          @error="previewError = $event"
        />
        <button type="button" @click="previewRef?.print()">打印</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  PrintDesigner,
  PrintHtmlPreview,
  createDefaultTemplate,
} from '@worm-vue3-print/canvas'
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'

const template = ref<TemplateData>(createDefaultTemplate())
const fields = ref<PrintBusinessField[]>([])
const designerRef = ref<InstanceType<typeof PrintDesigner>>()
const previewRef = ref<InstanceType<typeof PrintHtmlPreview>>()
const previewVisible = ref(false)
const previewTemplate = ref<Record<string, any> | null>(null)
const printData = ref<Record<string, any>>({})

function onSave(json: string) {
  // json 是完整模板 JSON 字符串；元信息由宿主一起保存
  console.info('保存模板', JSON.parse(json))
}

function onPreview() {
  previewTemplate.value = designerRef.value?.getTemplateJson() ?? null
  previewVisible.value = Boolean(previewTemplate.value)
}

function loadDefaultTemplate() {
  return createDefaultTemplate()
}

async function uploadImage(file: File) {
  const body = new FormData()
  body.append('file', file)
  const res = await fetch('/api/upload', { method: 'POST', body })
  const result = await res.json()
  return result.url as string
}

async function requestScreenshot(request: { templateJson: TemplateData; printData: Record<string, any> }) {
  const res = await fetch('/api/print/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return res.blob()
}
</script>
```

`request-screenshot` 和 `upload-image` 是可选宿主能力；未注入时设计器对应功能不可用，但基础设计、保存和预览仍可使用。

## 组件契约

### `PrintDesigner`

Props：

- `initial-template?: TemplateData`
- `initial-elements?: RuntimeElement[]`
- `fields?: PrintBusinessField[]`
- `is-edit?: boolean`
- `request-screenshot?: (request: ScreenshotRequest) => Promise<Blob>`
- `upload-image?: (file: File) => Promise<string>`
- `load-default-template?: () => TemplateData | Promise<TemplateData | null | undefined> | null | undefined`

事件：

- `save: [json: string]`
- `preview: []`

暴露方法：

- `getTemplateJson(): TemplateData | null | undefined`

不要假设存在 `back` 事件；返回上一页等导航属于宿主业务层。

### `PrintHtmlPreview`

Props：

- `template-json?: Record<string, any> | null`
- `print-data?: Record<string, any> | Record<string, any>[]`
- `base-url?: string`

事件：

- `rendered: [pageCount: number]`
- `error: [message: string]`

暴露方法：

- `print()`
- `rerender()`

## 业务字段契约

```ts
const fields: PrintBusinessField[] = [
  { id: 'supplier-group', fieldKey: 'supplier', fieldLabel: '供应商信息', fieldType: 'string', sortOrder: 1 },
  { id: 'supplier-name', fieldKey: 'supplier.name', fieldLabel: '供应商名称', fieldType: 'string', sortOrder: 2 },
  { id: 'goods-list', fieldKey: 'goods', fieldLabel: '商品明细', fieldType: 'list', sortOrder: 3 },
  { id: 'goods-name', fieldKey: 'goods.name', fieldLabel: '商品名称', fieldType: 'string', sortOrder: 4 },
]
```

规则：

- `fieldKey` 是打印数据中的完整路径。
- 无点且作为其他字段前缀的记录用于字段树分组。
- `fieldType: 'list'` 的记录是表格列表数据源；表格数据行通常设置 `dataSource: 'goods'`。
- 明细列表达式使用完整路径，例如 `{goods.name}`。

## 渲染数据结构

```ts
const printData = {
  supplier: { name: '供应商 A' },
  order: { no: 'SO-001', total: 100 },
  goods: [
    { name: '商品 A', qty: 2, price: 10, amount: 20 },
    { name: '商品 B', qty: 1, price: 30, amount: 30 },
  ],
}
```

模板表达式写 `{supplier.name}`、`{order.no}`、`{goods.name}` 等；表格 data 行按 `dataSource` 指向的数组迭代。

## 仅使用 core 的服务端/同构管线

```ts
import { bindData, paginate, generateHtml } from '@worm-vue3-print/core'

const bound = bindData(templateJson, printData, baseUrl)

// measuredElements 是 Map<string, MeasuredElement>；
// 浏览器端可直接使用 canvas 的 renderHtmlPages，服务端测量由 render 服务实现。
const measuredElements: Map<string, MeasuredElement> = await measureElements(bound)
const pageLayouts = paginate(bound, measuredElements)
const html = generateHtml(bound, pageLayouts, printData, { codeRenderer })
```

若用户要服务端 PDF 或截图，引导其查看/接入独立的 `worm-vue3-print-render` 服务；不要在本仓库中虚构 `/render/pdf` 实现。
