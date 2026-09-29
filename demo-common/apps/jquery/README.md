# apps/jquery · jQuery 宿主直挂集成示例（无打包器）

这一份演示的是**传统项目最原始的接法**：插件不进 `import`，页面上只挂一个 `<link>` 和一个 `<script>`，
业务代码用 `window.WormPrintCommon` 全局 + jQuery 操作 DOM。界面版式与 `../../../demo`（Vue 3 打印设计器示例）
完全一致，宿主样式来自同源生成的 `src/styles/demo-ui.css`。

## 跑起来

```bash
npm install        # postinstall 会执行 scripts/sync-assets.mjs
npm run dev        # http://localhost:9334（node server.mjs：纯静态 + /render-api 透传）
```

验收（另起终端）：

```bash
node ../../scripts/verify-demo.mjs http://localhost:9334/
```

可选（不装也能跑，弹窗里显示「离线」并给出可读提示）：

```bash
npm run dev -w @worm-vue3-print/render     # 服务端 PDF（3001）
# 客户端静默打印需要本机跑着 print-client 桌面客户端（ws 127.0.0.1:17521）
```

`sync-assets.mjs` 只干一件事——把 npm 包里两份「浏览器可直接用」的文件拷进 `public/vendor/`：

| 取自 | 拷到 | 作用 |
| --- | --- | --- |
| `@worm-vue3-print/common/dist/common.js` | `public/vendor/worm-print-common.js` | UMD，core 与码制库已内联，挂出 `window.WormPrintCommon` |
| `@worm-vue3-print/common/dist/common.css` | `public/vendor/worm-print-common.css` | 设计器样式（light DOM 兜底 + `:host` 基线） |
| `jquery/dist/jquery.min.js` | `public/vendor/jquery.min.js` | jQuery 本体 |

真实项目里这一步等价于「从制品库下载这两个文件丢进 `static/`」，本仓库为了 CI/离线复现才用脚本拷。

## 目录

```
index.html                  demo 版式骨架：顶栏 + .demo-container + 四个弹层（hidden 控制显隐）
src/app.js                  状态与交互：设计器挂载/注入/事件、顶栏、预览链路、自定义字段与数据
src/gallery.js              示例模板库：页签筛选 + JS 生成卡片 DOM
src/thumb.js                卡片缩略图：按模板坐标等比绘制版式示意（getPaperDimensions 等）
src/print-dialog.js         打印输出弹窗：服务端 PDF + 客户端静默打印两条链路
src/render-client.js        /render-api 调用封装（只用 fetch，无 bare import）
src/browser-render.js       WormPrintCommon.renderHtmlPages + browserCodeRenderer 的薄封装
src/ui.js                   弹层显隐、提示文案、JSON 下载等零碎 DOM 工具
src/templates.js            三个示例的模板 / 字段 / 数据 / 批量数据
src/styles/demo-ui.css      宿主样式（sync-demo-styles.mjs 从 demo 逐字抽取，勿手改）
```

浏览器原生 ESM 只走相对路径：`src/*.js` 之间互相 `import`，npm 包名一律不出现，
插件能力全部从全局 `WormPrintCommon` 上取。

## 直挂抄这 4 件事

1. **两份静态资源 + 一份宿主样式**（`index.html` 的 head，顺序即引用顺序）

   ```html
   <link rel="stylesheet" href="/vendor/worm-print-common.css" />
   <link rel="stylesheet" href="/src/styles/demo-ui.css" />
   <!-- body 末尾 -->
   <script src="/vendor/jquery.min.js"></script>
   <script src="/vendor/worm-print-common.js"></script>
   <script type="module" src="/src/app.js"></script>
   ```

2. **注册元素并把标签挂进容器**（`src/app.js` 的 `mountDesigner`）

   ```js
   WormPrintCommon.registerAll()                                    // 全局只调用一次
   $('#host').html('<print-designer id="designer" is-edit="true" show-help="true"></print-designer>')
   ```

3. **对象/函数入参只能赋 property**（`setAttribute` 会把它们字符串化）

   ```js
   const el = document.getElementById('designer')
   el.fields = fields                       // 数组：attribute 装不下
   el.template = template                   // 对象：同上；读回当前画布用 el.getTemplateJson()
   el.uploadImage = file => upload(file)    // 函数：只能走 property
   el.uploadDesignBackground = file => upload(file)
   ```

4. **听事件 + 出纸**（CustomEvent 的载荷在 `e.originalEvent.detail`，三条链路都吃 `getTemplateJson()` 的 JSON）

   ```js
   $(el).on('save', e => persist(JSON.parse(e.originalEvent.detail)))   // jQuery 包了一层事件对象
   const rendered = await WormPrintCommon.renderHtmlPages(                  // 浏览器端两遍渲染
     JSON.parse(el.getTemplateJson()), data, location.origin, WormPrintCommon.browserCodeRenderer)
   new WormPrintCommon.PrintClient({ timeoutMs: 20000 }).printHtml(rendered) // 直送本机客户端静默出纸
   ```

## 直挂形态必须写对的几点

1. **自定义元素默认 `display:inline`**：不给块级宽高，设计器会整体塌成一坨。本工程在
   `demo-ui.css` 末尾的「Web Component 宿主补充」段里由 `.demo-container print-designer` 统一给
   `display:block; width:100%; height:100%`，照抄时记得连这段一起拿。
2. **`fields` 没有 getter**：读回宿主字段看 `el.store.fields`；`el.template` 的 getter 返回的是当前画布 JSON。
3. **jQuery 包了一层事件对象**：`$(el).on('save', ...)` 里 `e.detail` 是 `undefined`，必须取 `e.originalEvent.detail`。
4. **弹层显隐用 `hidden` 属性**：`.print-mask` / `.gallery-mask` / `.custom-mask` 在样式里是 `display:flex`，
   作者样式会盖掉 `[hidden]` 的 UA 规则，所以 `src/ui.js` 的 `setVisible()` 在切 `hidden` 的同时同步一行内
   `display`（不改样式文件）。
5. **无打包器 ⇒ 无 bare import**：`src/*.js` 只能相对路径互引，插件与 core 能力全部来自 `WormPrintCommon` 全局；
   缩略图用的 `getPaperDimensions / isContinuousPaperSize / getByPath` 也从这个全局取。
6. **密钥不进前端**：服务端 PDF 只请求同源 `/render-api/*`，由 `server.mjs` 透传到本地 3001 并注入
   `x-render-key`；生产环境换成宿主自己的反向代理。

## 页面上能点的动作

自定义字段与数据（粘贴 JSON · 格式化 · 非法拦截）· 加载示例（页签筛选 + 版式缩略图 + 应用）·
导出模板（先 `validateTemplate()` 拦非法拼版再下载）· 导入模板（结构校验）· 清空 ·
批量打印开关（数据在对象/数组间切换）· 打印输出（服务端 PDF / 客户端静默打印，含状态探测与离线降级）·
设计器自带「预览」→ 全屏预览层出纸与浏览器打印（Esc 关闭）。

端口：9334。批量数据在 `src/templates.js` 的 `batchData`，改成你的接口返回即可。
