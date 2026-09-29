# @worm-vue3-print/common

> ⚠️ **实验性质（experimental）**：本包尚未定版，接口与产物形态仍可能调整，**不建议应用到生产环境**。
> Vue 3 项目请使用成熟方案 `@worm-vue3-print/canvas`；本包目前仅供评估与非生产环境的集成验证。

打印模板可视化设计器的 **通用宿主适配形态**：任意框架、或完全没有框架的宿主都能直接接入，
实现为零框架原生 Custom Element + Shadow DOM，**不依赖 Vue / React 等任何框架运行时**，
用于把 `@worm-vue3-print/canvas`（Vue 3 版设计器）的能力带给 Vue 2、React、jQuery 及任意非 Vue3 宿主。

- 功能与布局与 Vue 3 版对齐，逐项状态见 [PARITY.md](./PARITY.md)
- 样式与图标从 canvas 构建产物**派生**（`scripts/gen-styles.mjs` 剥离 `[data-v-*]`、
  `scripts/gen-icons.mjs` 抽取 lucide 图标），因此 canvas 改版后重新构建即自动跟随
- 运行时体积：`dist/index.js` 348.14 kB（gzip 99.99 kB），零框架依赖
- 浏览器直挂形态：`dist/common.js`（UMD，core 与码制库已内联）+ `dist/common.css`，见下节

## 安装

```bash
npm i @worm-vue3-print/common @worm-vue3-print/core
```

## 浏览器直挂（jQuery / 无打包器宿主）

`vite.bundle.config.ts` 额外产出两个文件，子路径 `@worm-vue3-print/common/browser` 指向它们：

- `dist/common.js`（474.96 kB / gzip 145.34 kB）：UMD，把 `@worm-vue3-print/core` 与条形码、二维码库
  全部内联，并挂出全局 `window.WormPrintCommon`。除了本包 `index` 的那套 API
  （`registerAll` / `createDefaultTemplate` / `DesignerStore` / `PrintDesignerElement`），
  还一并挂出出纸要用的 `renderHtmlPages` / `browserCodeRenderer` / `PrintClient` / `WormPrintError`，
  以及宿主自绘模板缩略图所需的纸张几何工具 `getPaperDimensions` / `isContinuousPaperSize` / `getByPath`
  —— 直挂宿主拿不到裸包名 `@worm-vue3-print/core`，没有这些入口就无法在同一个 `<script>` 里
  完成「浏览器渲染 → 打印 / 静默打印」
- `dist/common.css`：即 `src/styles/designer.css`（由 `gen-styles.mjs` 从 canvas 派生，含 `:host` 块级基线）。
  Shadow DOM 形态用不到它——样式由组件内联注入；只有把设计器渲染进 **light DOM** 时才需要 `<link>` 它

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
以及 `/render-api` 透传的 40 行静态服务器）；Vue3 / Vue2 / React 三种 NPM 接入形态见
`demo-common/apps/vue3`、`demo-common/apps/vue2`、`demo-common/apps/react`。

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

## 与 canvas 版的边界

| | canvas（Vue 3） | common（本包） |
|---|---|---|
| 运行时 | Vue 3.5 | 无框架 |
| 宿主注入 | `provide/inject`、props | element property / attribute + CustomEvent |
| 样式 | `dist/style.css` 或源码 CSS | 内置 Shadow DOM（`?inline`），无需引样式文件 |
| 适用 | Vue 3 项目 | React / Vue 2 / jQuery / 原生 |

Vue 3 项目应继续用 `@worm-vue3-print/canvas`，功能面更全；本包面向非 Vue3 宿主。
