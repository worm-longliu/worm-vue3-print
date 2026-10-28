# @worm-vue3-print/common

> ⚠️ **实验性质 · 以预览版发布到 npm**：dist-tag 为 `next`，安装必须写 `@worm-vue3-print/common@next`；
> 版本号形如 `1.3.7-beta.N`（与主线同号 + 预发布后缀）。npm 上还没有 `latest`，转正时才发 stable。
> 本包尚未定版，接口与产物形态仍可能调整，**不建议应用到生产环境**；
> Vue 3 项目请使用成熟方案 `@worm-vue3-print/canvas`，本包目前仅供评估与非生产环境的集成验证。

打印模板可视化设计器的 **通用宿主适配形态**：任意框架、或完全没有框架的宿主都能直接接入，
实现为零框架原生 Custom Element + Shadow DOM，**不依赖 Vue / React 等任何框架运行时**，
用于把 `@worm-vue3-print/canvas`（Vue 3 版设计器）的能力带给 Vue 2、React、jQuery 及任意非 Vue3 宿主。

- 功能与布局与 Vue 3 版对齐，逐项状态见 [PARITY.md](./PARITY.md)
- 样式与图标从 canvas 构建产物**派生**（`scripts/gen-styles.mjs` 剥离 `[data-v-*]`、
  `scripts/gen-icons.mjs` 抽取 lucide 图标），因此 canvas 改版后重新构建即自动跟随
- 运行时体积：`dist/index.js` 368.28 kB（gzip 106.68 kB），零框架依赖
- 浏览器直挂形态：`dist/common.js`（UMD，core 与码制库已内联）+ `dist/common.css`，见下节

## 安装

```bash
npm i @worm-vue3-print/common@next @worm-vue3-print/core
```

`@next` 是预览版的 dist-tag，安装必须带上它。注意 `latest` 目前被 npm 在首次发布时自动打在了同一个预览版上（红灯判据：`npm run publish:common:check`），所以省略 `@next` 不会报错，而是**静默装到实验包**；维护者摘除 `latest` 后省略才会显式失败。
`core` 装正式版即可（本包依赖 `^1.4.0`），出纸链路也要直接用它。

四种宿主形态各自的依赖与插件（本包零框架运行时，宿主框架按需装）：

| 宿主 | 安装 | 框架插件 |
|---|---|---|
| Vue 3 | `npm i @worm-vue3-print/common@next @worm-vue3-print/core vue` | `@vitejs/plugin-vue`，须配 `isCustomElement` |
| Vue 2.7 | `npm i @worm-vue3-print/common@next @worm-vue3-print/core vue@2.7` | `@vitejs/plugin-vue2` |
| React 18 | `npm i @worm-vue3-print/common@next @worm-vue3-print/core react react-dom` | `@vitejs/plugin-react`，无需自定义元素配置 |
| jQuery / 无打包器 | 取本包 `dist/common.js` + `dist/common.css` 直挂 | 无，见下节 |

## 浏览器直挂（jQuery / 无打包器宿主）

`vite.bundle.config.ts` 额外产出两个文件，子路径 `@worm-vue3-print/common/browser` 指向它们：

- `dist/common.js`（499.07 kB / gzip 154.83 kB）：UMD，把 `@worm-vue3-print/core` 与条形码、二维码库
  全部内联，并挂出全局 `window.WormPrintCommon`。除了本包 `index` 的那套 API
  （`registerAll` / `createDefaultTemplate` / `DesignerStore` / `PrintDesignerElement`），
  还一并挂出出纸要用的 `renderHtmlPages` / `browserCodeRenderer` / `PrintClient` / `WormPrintError`，
  以及宿主自绘模板缩略图所需的纸张几何工具 `getPaperDimensions` / `isContinuousPaperSize` / `getByPath`
  —— 直挂宿主拿不到裸包名 `@worm-vue3-print/core`，没有这些入口就无法在同一个 `<script>` 里
  完成「浏览器渲染 → 打印 / 静默打印」
- `dist/common.css`：即 `src/styles/designer.css`（由 `gen-styles.mjs` 从 canvas 派生，含 `:host` 块级基线）。
  Shadow DOM 形态用不到它——样式由组件内联注入；只有把设计器渲染进 **light DOM** 时才需要引它，
  公开子路径为 `@worm-vue3-print/common/style.css`（打包器 `import '@worm-vue3-print/common/style.css'`，
  无打包器则复制成文件后 `<link>`），不要深路径引 `dist/`

```html
<link rel="stylesheet" href="/vendor/worm-print-common.css" />
<script src="/vendor/worm-print-common.js"></script>
<script>
  WormPrintCommon.registerAll()
  const el = document.querySelector('print-designer')
  el.fields = fields                 // 数组/对象只能赋 property
  el.template = templateJson
  el.uploadImage = file => uploadToServer(file)
  el.addEventListener('save', e => persist(e.detail))
  const out = await WormPrintCommon.renderHtmlPages(
    JSON.parse(el.getTemplateJson()), data, location.origin, WormPrintCommon.browserCodeRenderer)
</script>
```

两个硬约束：自定义元素默认 `display:inline`，宿主必须给它块级宽高，否则设计器整体塌陷；
`fields` 没有 getter，读回要看 `el.store.fields`。

完整可运行的直挂宿主示例见 `demo-common/apps/jquery`（含 `sync-assets.mjs` 如何从包 dist 取这两个文件、
以及 `/render-api` 透传的 40 行静态服务器）；Vue 3 / Vue 2 / React 三种 NPM 接入形态见下文
「在 Vue 3 / Vue 2 / React 中使用」，可运行工程在 `demo-common/apps/vue3`、`demo-common/apps/vue2`、`demo-common/apps/react`。

## 使用

```js
import { registerAll } from '@worm-vue3-print/common'
registerAll()   // 注册 <print-designer>，按需调用，不自动污染全局
```

```html
<print-designer id="d" style="height:100%"></print-designer>
```

```js
const d = document.getElementById('d')
d.fields = [{ fieldKey: 'orderNo', fieldLabel: '单号' }]   // 也接受 JSON 字符串
d.template = templateJson
d.addEventListener('save', e => save(e.detail))            // e.detail 为模板 JSON
d.addEventListener('preview', e => preview(e.detail))
d.getTemplateJson()
d.validateTemplate()      // 拼版/多页配置校验，宿主旁路导出前调用
d.loadTemplate(json)
d.save()
```

出纸链路不需要设计器，直接走 `@worm-vue3-print/core`（浏览器渲染 / print-render 服务端 /
桌面静默打印），与 canvas（Vue 3）宿主完全一致。

## 在 Vue 3 / Vue 2 / React 中使用

三种宿主消费的是**同一个 `<print-designer>` 自定义元素**，差异只有两处：编译期要不要放行未知标签、
对象入参在哪一帧赋 property。下面代码取自 `demo-common/apps/{vue3,vue2,react}` 三个可运行工程，
已剥掉示例库与弹层等 demo 噪音。

### Vue 3

> Vue 3 项目的生产首选仍是 `@worm-vue3-print/canvas`（功能面更全）；本节面向已定用 common 形态、
> 或要与 Vue 2 / React 共用同一套注入代码的场景。

```js
// vite.config.js —— SFC 编译期就要声明 print-* 是自定义元素，否则被当未注册组件
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue({
    template: { compilerOptions: { isCustomElement: tag => tag.startsWith('print-') } },
  })],
})
```

```js
// main.js
import { createApp } from 'vue'
import { registerAll } from '@worm-vue3-print/common'

registerAll()                        // 全应用调一次，不自动污染全局
createApp(App).mount('#app')
```

```vue
<template>
  <print-designer ref="designerRef" is-edit="true" show-help="true"
    @save="onSave" @preview="onPreview" @dblclick-cell="onDblclickCell" />
</template>

<script setup>
import { onMounted, ref } from 'vue'

const designerRef = ref(null)

/** 对象/函数入参只能赋 property（模板绑定会走 setAttribute 被字符串化） */
function syncDesigner() {
  const el = designerRef.value
  el.fields = fields.value
  el.template = template.value
  el.fonts = fontsOf(template.value)   // 可选：字体声明；demo 的 fontsOf() 取各页 /fonts 并按 family 去重
}
const onSave = e => persist(JSON.parse(e.detail))

onMounted(() => {
  const el = designerRef.value
  el.uploadImage = uploadToServer
  el.uploadDesignBackground = uploadToServer
  syncDesigner()
})
</script>
```

- **runtime-only 构建下 `app.config.compilerOptions.isCustomElement` 不生效**，配置必须落在 `@vitejs/plugin-vue` 里；
  只有自带运行时编译器的宿主才用 `app.config` 那条。

### Vue 2.7

```js
// main.js
import Vue from 'vue'
import { registerAll } from '@worm-vue3-print/common'

registerAll()
// 必须声明，否则报 Unknown custom element、画面是个空壳
Vue.config.ignoredElements = ['print-designer']

new Vue({ render: h => h(App) }).$mount('#app')
```

```vue
<template>
  <print-designer ref="designer" is-edit="true" show-help="true"
    @save="onSave" @preview="onPreview" @dblclick-cell="onDblclickCell" />
</template>

<script>
export default {
  data: () => ({ fields: [], templateData: null }),
  mounted() {
    const el = this.$refs.designer
    el.uploadImage = this.uploadImage            // 函数只能赋 property
    el.uploadDesignBackground = this.uploadImage
    this.syncDesigner()
  },
  methods: {
    syncDesigner() {
      const el = this.$refs.designer
      if (!el) return
      el.fields = this.fields                    // 数组只能赋 property
      el.template = this.templateData            // 对象同上
    },
    onSave(e) { persist(JSON.parse(e.detail)) },  // e.detail 为模板 JSON 字符串
  },
}
</script>
```

- **`structuredClone` 会抛 `DataCloneError`**：Vue 2 把 `data` 里的对象深度响应式化成 Proxy，
  模板/数据深拷贝统一用 `JSON.parse(JSON.stringify(...))`。
- 宿主页面是**单根节点**（Vue 2 不支持多根 fragment，预览层与弹层都得写在根节点内）；
  `v-if` 控制的预览 iframe 要 `$nextTick()` + `requestAnimationFrame()` 两层才拿得到节点。
- Vue 2 侧专属坑的完整清单见 `demo-common/apps/vue2/README.md`（共 7 条）。

### React 18

React 没有 `isCustomElement` 这类编译配置：未知标签 `print-designer` 直接按原生元素渲染，
所以只剩运行期两条约定。

```jsx
// main.jsx
import { registerAll } from '@worm-vue3-print/common'

registerAll()   // 一次即可；设计器样式在组件 Shadow DOM 内，宿主不必引 css
```

```jsx
// App.jsx
import { useEffect, useRef, useState } from 'react'

export default function App() {
  const designerRef = useRef(null)
  const [fields, setFields] = useState([])
  const [templateData, setTemplateData] = useState(null)

  function syncDesigner(nextFields, nextTemplate) {
    const el = designerRef.current
    if (!el) return
    el.fields = nextFields                  // JSX 里 template={obj} 会被字符串化成 [object Object]
    el.template = nextTemplate
  }

  useEffect(() => {
    const el = designerRef.current
    el.uploadImage = uploadToServer         // 函数同样只能赋 property
    el.uploadDesignBackground = uploadToServer
    syncDesigner(fields, templateData)      // 挂载后统一注入；换模板/换字段后再调一次

    const onSave = e => persist(JSON.parse(e.detail))
    el.addEventListener('save', onSave)     // JSX 的 onSave 不会绑定 CustomEvent
    return () => el.removeEventListener('save', onSave)   // StrictMode dev 双跑，漏解绑会重复注册
  }, [])

  return <print-designer ref={designerRef} is-edit="true" show-help="true" />
}
```

- 事件只注册一次：处理器要读最新 state 时用 `useRef` 桥接（demo 里的 `printDataRef`），
  把 state 放进 effect 依赖会导致频繁重绑。

### 三宿主共通的三条

1. **对象与函数只能赋 property**；字符串开关（`is-edit="true"`、`show-help="true"`）写在模板 / JSX 属性上即可。
   `fields` 只有 setter（读回看 `el.store.fields`），`template` 的 getter 返回当前画布 JSON。
   改字段/换模板后要**显式再调一次注入函数**（三个 demo 都在切示例、导入模板、清空、自定义字段四处调用），
   不去 `watch` element 本身。
2. **元素默认 `display:inline`，宿主必须给块级宽高**，否则设计器整体塌陷：
   `.容器 print-designer { display: block; width: 100%; height: 100% }`。
3. **事件是 CustomEvent**，载荷在 `event.detail`：`save` / `preview` 是模板 JSON 字符串；
   `dblclick-element` 就是元素 id 字符串本身、`dblclick-cell` 是 `{ elementId, r, c, cellId }` 对象，
   后两者**不要** `JSON.parse`。旁路取模板用 `getTemplateJson()`，它绕过拼版校验，
   保存/导出前要先调 `validateTemplate()`。

## 与 canvas 版的边界

| | canvas（Vue 3） | common（本包） |
|---|---|---|
| 运行时 | Vue 3.5 | 无框架 |
| 宿主注入 | `provide/inject`、props | element property / attribute + CustomEvent |
| 样式 | `@worm-vue3-print/canvas/style.css` | 内置 Shadow DOM（`?inline`），无需引样式文件；light DOM 形态引 `@worm-vue3-print/common/style.css` |
| 适用 | Vue 3 项目 | React / Vue 2 / jQuery / 原生 |

Vue 3 项目应继续用 `@worm-vue3-print/canvas`，功能面更全；本包面向非 Vue3 宿主。
