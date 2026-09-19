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
- `show-help?: boolean`（默认 `true`，传 `false` 关闭帮助入口）

事件：

- `save: [json: string]`
- `preview: []`

暴露方法：

- `getTemplateJson(): TemplateData`
- `validateTemplate(): TilingIssue[]`：拼版配置校验（纯查询，不弹窗、不切页签），合法返回 `[]`。
  宿主若在「导出 / 另存」等链路上直接消费 `getTemplateJson()`，**必须自行调用它决定是否放行**——
  那条路径绕不过设计器保存按钮的闸门。

不要假设存在 `back` 事件；返回上一页等导航属于宿主业务层。组件只 expose 上述两个方法，不存在 `setTemplateMeta` 等方法——模板名称、业务类型、备注等元信息由宿主自行维护并随保存接口提交，不要试图写进设计器实例。

模板加载 / 重置（如「加载默认布局」）同样属于宿主业务：设计器工具栏不内置该按钮，宿主在自己的
页面 chrome 上渲染入口，把新的 `TemplateData` 赋给 `initial-template` 即可重载画布（设计器按
引用变化监听并记录一次历史，撤销可回退；注意必须赋新对象/新引用）。

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

## 拼版打印（多行多列）

标签尺寸的模板可以把多份数据按「列 × 行」铺到一张更大的纸上（如 70×40 标签铺满 A4，一张纸 12 个）。
**这是模板级配置**：写在 `templateJson.tiling` 里随模板保存，三端（浏览器 / 服务端 / 桌面客户端）自动一致，
**不需要改后端协议或客户端代码**——目标纸通过 `PreparedDocument.paperMm` 透出。

```ts
const templateJson = {
  // …纸张、元素等
  tiling: {
    enabled: true,
    columns: 2,                                    // 列数（手工指定）；行数按纸面自动推导
    sheetPaperSize: 'A4',                          // 目标纸：A4/A3/A5/Letter/Legal/CUSTOM
    sheetOrientation: 'portrait',                  // 只影响目标纸，不影响标签朝向
    sheetMargin: { top: 10, right: 10, bottom: 10, left: 10 }, // 目标纸留白（mm）
    gapX: 2, gapY: 2,                              // 格间距（mm）
    // sheetPaperSize: 'CUSTOM' 时另需 sheetCustomWidth / sheetCustomHeight
  },
}
```

要点：

- **行数自动、列数手工**；按「列 × 行」整块切片，**行不会跨页**，最后一张的空余格留白。
- 拼版要求**每份数据恰好 1 页**；超出时报错并指明第几份，请缩小内容或调高标签纸张高度。
- **连续纸模板不支持拼版**（设计器里开关置灰）。
- 开启拼版后 `PreparedDocument.pageCount` 表示**张数**（`copies` 仍是数据条数）。
- 设计器「页面属性 → 拼版打印」可配置；列数超出纸面宽度时**不允许保存**，提示「最多可放 N 列」。
  宿主自行消费 `getTemplateJson()` 的链路上，用 `designerRef.value.validateTemplate()` 做同样的拦截。
- 字段细节与错误码见 `docs/中文/接口/API文档.md` 的「拼版打印」小节。

## 仅使用 core 的服务端/同构管线

```ts
import { bindData, paginate, generateHtml } from '@worm-vue3-print/core'

const bound = bindData(templateJson, printData, baseUrl)

// measuredElements 是 Map<string, MeasuredElement>；
// 浏览器端可直接使用 canvas 的 renderHtmlPages；三端测量共用 core 的 DOM 执行器（服务端经 Playwright driver 执行）。
const measuredElements: Map<string, MeasuredElement> = await measureElements(bound)
const pageLayouts = paginate(bound, measuredElements)
const html = generateHtml(bound, pageLayouts, printData, { codeRenderer })
```

若用户要服务端 PDF 或截图，引导其查看/接入 monorepo 内的 `services/print-render` 服务（`@worm-vue3-print/render`）；在接入方业务仓库中不要虚构 `/render/pdf` 实现。
