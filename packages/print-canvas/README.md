# @worm-vue3-print/canvas

Vue 3 可视化打印模板设计器画布（`worm-vue3-print` monorepo）。纯 Vue 3 + HTML/CSS/SVG +
原生控件实现，**不依赖 Element Plus、不依赖宿主 API/路由/租户**。模板保存、字段查询、
截图、图片上传、消息提示等能力由宿主通过 props / 事件 / 适配器注入。

## 宿主接入

```vue
<PrintDesigner
  :fields="fields"
  :load-default-template="loadDefaultTemplate"
  :request-screenshot="requestScreenshot"
  :upload-image="uploadImage"
  @save="onSave"
  @preview="onPreview"
  @back="onBack"
/>
```

- `fields`：业务字段（宿主查询后传入，扁平 `PrintBusinessField[]`）。`fieldKey` 为打印数据中的
  完整路径（如 `supplier.name`、`receiver.phone`、`goods.spec`），字段树/表达式编辑器按首段
  自动分组；无点且作为其它字段前缀的记录为分组容器（如 `supplier`、`goods`），其中
  `fieldType: 'list'` 的容器（如 `goods`）作为表格「列表数据源」选项，拖拽/双击叶子字段插入
  的表达式即为完整路径 `{goods.spec}`。左侧字段树、表达式编辑器、绑定下拉均以此为唯一数据源。
- `loadDefaultTemplate()`：可选。返回默认布局 `TemplateData`（支持异步，返回 null/undefined
  视为无默认布局）；未注入时工具栏不展示「加载默认布局」按钮。
- `requestScreenshot({ templateJson, printData }) => Promise<Blob>`：叠层对比截图。
- `uploadImage(file) => Promise<string>`：图片元素上传，返回可访问 URL。

> 模板名称、业务类型、备注等元信息不属于设计器核心：模板 JSON 不含元信息，宿主在自己的
> 列表/保存流程中管理。

## 开发

```bash
cd worm-vue3-print
npm install
cd packages/print-canvas
npm test          # vitest（happy-dom + @vue/test-utils）
```

> 当前以**源码方式**被宿主 Vite 直接编译消费（宿主将 `@worm-vue3-print/canvas` alias 到
> `src/index.ts`）；发布 npm 前再补充 Vue 库模式构建（external vue、抽离 CSS、生成 d.ts）。
