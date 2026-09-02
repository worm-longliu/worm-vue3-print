# @worm-vue3-print/canvas

Vue 3 可视化打印模板设计器画布（`worm-vue3-print` monorepo）。纯 Vue 3 + HTML/CSS/SVG +
原生控件实现，**不依赖 Element Plus、不依赖宿主 API/路由/租户**。模板保存、字段查询、
截图、图片上传、消息提示等能力由宿主通过 props / 事件 / 适配器注入。

## 宿主接入

```vue
<PrintDesigner
  :fields="fields"
  :business-type-options="businessTypeOptions"
  :request-screenshot="requestScreenshot"
  :upload-image="uploadImage"
  @save="onSave"
  @preview="onPreview"
  @back="onBack"
  @business-type-change="onBusinessTypeChange"
/>
```

- `fields`：业务字段树（宿主查询后传入）。
- `businessTypeOptions`：业务类型下拉选项（宿主定义，核心不内置业务类型）。
- `requestScreenshot({ templateJson, printData }) => Promise<Blob>`：叠层对比截图。
- `uploadImage(file) => Promise<string>`：图片元素上传，返回可访问 URL。

## 开发

```bash
cd worm-vue3-print
npm install
cd packages/print-canvas
npm test          # vitest（happy-dom + @vue/test-utils）
```

> 当前以**源码方式**被宿主 Vite 直接编译消费（宿主将 `@worm-vue3-print/canvas` alias 到
> `src/index.ts`）；发布 npm 前再补充 Vue 库模式构建（external vue、抽离 CSS、生成 d.ts）。
