# demo-common · 四个宿主的打印设计器集成示例

> ⚠️ 演示对象 `@worm-vue3-print/common` 为**实验性质**，不建议应用到生产环境；Vue 3 项目请使用 `@worm-vue3-print/canvas`（配合仓库根部的 `demo/`）。

`@worm-vue3-print/common`（`<print-designer>`）在 **Vue 3 / Vue 2.7 / React 18 / jQuery** 四种宿主里的接入示例。
每个 `apps/<宿主>` 都是一个独立 npm 工程，把自己宿主的集成代码全部写在自家文件里，
**没有任何共用壳层**——想接哪个宿主，就把那个工程整份抄进你的项目改数据源。

四个工程的**界面版式与 `../demo`（Vue 3 canvas 版示例）完全一致**：同一份顶栏动作、同一个全屏打印预览层、
同一套「打印输出 / 加载示例 / 自定义字段与数据」弹窗。样式不各写各的，而是由
`scripts/sync-demo-styles.mjs` 从 `demo/` 逐字抽取成一份 `apps/<宿主>/src/styles/demo-ui.css`
（四份同 MD5，758 行），宿主工程内不再有任何私有布局样式。
示例库也不各写各的：`scripts/sync-demo-samples.mjs` 把 `demo/src/samples` 求值展开成
`apps/<宿主>/src/templates.js`（四份同 MD5，10 个示例），与 demo 用同一批模板、字段与数据。

> 这里刻意不做逻辑抽象：demo 的价值在于读者能在一个文件里看完「注册元素 → 注入模板与字段 → 听事件 → 出纸」，
> 而不是跳到某个 shared 包里去看封装。四个工程的重复是有意为之；同源只有样式与示例库两处，因为它们必须与 demo 一致。

## 工程与端口

| 工程 | 端口 | 接入形态 | 集成代码所在 |
| --- | --- | --- | --- |
| `apps/vue3` | 9331 | NPM 包 + SFC | `src/App.vue`（版式骨架 + property 注入 + 事件 + 三条打印链路）、`src/SampleThumb.vue`、`src/{render-client,browser-render}.js` |
| `apps/vue2` | 9332 | NPM 包 + SFC（`@vitejs/plugin-vue2`，runtime-only 构建，Options API） | 同上（`src/App.vue` + `src/SampleThumb.vue`；入口 `src/main.js` 只做注册与挂载） |
| `apps/react` | 9335 | NPM 包 + hooks | `src/App.jsx` + `src/components/*.jsx`（三个弹窗）+ `src/SampleThumb.jsx` |
| `apps/jquery` | 9334 | **JS + CSS 直挂**（无打包器、不 import 插件） | `index.html`（demo 版式骨架，弹层用 `hidden` 切换）+ `src/{app,gallery,thumb,print-dialog,ui}.js` |

`index.html` 是**五个**示例工程（这四个 + `../demo` 的 Vue 3 canvas 版，端口 9303）的静态导航页；
`node scripts/serve-nav.mjs`（或根目录 `npm run nav:demo-common`）把它挂在 **:9300**，`dev-all.mjs` 会顺带起它。
五个页面的顶栏都有同一个「宿主示例」下拉（`.demo-host-switch`，无 JS 的 `<details>`，菜单项用 `<a>` 不占按钮位），
收起时只显示当前宿主名，展开即可跳到其余四个。

## 跑起来

```bash
node scripts/install-all.mjs   # 四个工程各自 npm install（file: 依赖指向本仓库 packages/）
node scripts/dev-all.mjs       # 一次起四个 dev server + :9300 总览页
```

或者只跑一个：

```bash
cd apps/vue3 && npm install && npm run dev
```

jQuery 那份没有构建步骤：`npm install` 的 postinstall 会把包里的 `dist/common.js`、`dist/common.css`
拷进 `public/vendor/`，`npm run dev` 用一个 40 行的 `server.mjs` 提供静态服务 + `/render-api` 透传。

## 每个 demo 都摊开了什么

- **设计器挂载**：字符串开关（`is-edit`、`show-help`）走 attribute，`fields` / `template` / `fonts` /
  `uploadImage` 等对象与函数一律赋 property（宿主模板绑对象会被字符串化，这是最常见的接错方式）
- **宿主回调**：`uploadImage` / `uploadDesignBackground`（demo 用 Data URL 模拟上传）
- **事件**：`save`（detail = 模板 JSON，demo 里下载成文件）、`preview`（detail 同为 JSON，用来唤出全屏预览层）、
  `help`、`dblclick-element`（detail **就是元素 id 字符串本身**，不是 JSON，别 `JSON.parse`）、
  `dblclick-cell`（detail 为 `{ elementId, r, c, cellId }` 对象）；与 demo 同口径写 `console.log` + 下载 + `alert`，不再另设宿主侧栏面板
- **旁路 API**：`getTemplateJson()`、`validateTemplate()`（保存/导出前必须自己调，旁路不经拼版闸门）、
  `loadTemplate()`、`save()`
- **三条出纸链路**：
  1. 浏览器：`renderHtmlPages(template, data, baseUrl, browserCodeRenderer)` → 写进预览层 iframe → `iframe.contentWindow.print()`
  2. 服务端：`POST /render-api/render/pdf`（dev 代理注入密钥，前端代码不带密钥）→ PDF blob
  3. 桌面客户端：同一个 `renderHtmlPages` 产物 → `PrintClient.printHtml(..., { printerName })` 静默出纸
  后两条收进顶栏「打印输出」弹窗（与 demo 一致），首次打开才探测，离线自动置灰并给可读提示
- **示例模板库**：顶栏「加载示例」唤出卡片弹窗，缩略图按模板坐标等比绘制版式示意（与 demo 的 `SampleThumb` 同算法）
- **自定义字段与数据**：粘贴 fields/data JSON，格式化、非法拦截、应用即时生效
- **批量**：顶栏开关把数据换成数组传给同一条管线，份间分页并合并为一个作业

可选依赖没起时不报错、不白屏：`npm run dev:render`（:3001）没起 → 「渲染服务离线」；
本机 print-client（:17521）没起 → 「打印客户端离线」。

## 样式：单一来源，改 demo 之后重跑脚本

```bash
node scripts/sync-demo-styles.mjs   # 从 demo/ 与 canvas 的 PrintHtmlPreview 逐字抽 style → 四份 demo-ui.css
```

抽取范围是 `demo/src/App.vue` + 三个弹窗组件 + `SampleThumb.vue` + `packages/print-canvas/src/components/PrintHtmlPreview.vue`，
脚本不改一个像素值，只在末尾追加「Web Component 宿主补充」段（自定义元素默认 `display:inline`，
需要 `.demo-container print-designer` 给块级宽高，否则设计器整体塌陷）。
**产物 `apps/*/src/styles/demo-ui.css` 不要手改**，会被下次同步覆盖；需要样式变化就改 `demo/` 再重跑。

## 示例库：单一来源，改 demo 之后重跑脚本

```bash
node scripts/sync-demo-samples.mjs   # 求值 demo/src/samples → 四份 templates.js + public 下的示例图片/字体
```

宿主工程只依赖 `@worm-vue3-print/common` 与 `/core`，拿不到 demo 的 TS 源码，所以本脚本在生成期一次消解三处差异：
`@worm-vue3-print/canvas` 的运行时导出别名到真源 `core/designer`、`import.meta.env.BASE_URL` 固定为站点根、
标签类示例缺省的 `batchData` 按 demo 的 `deriveBatchData` 展开成字面量。产物是**无 import 的纯数据单文件**，
可以整份抄进业务项目当数据源；示例引用的 `demo/public/{images,fonts}` 资源（4 张占位图 + 3 个示例字体）一并拷进各宿主 `public/`，
其中 `public/fonts/` 单个 1.5~8MB、不入库（`.gitignore` 已排除，新克隆后重跑脚本补齐）。
**产物 `apps/*/src/templates.js` 不要手改**，会被下次同步覆盖；需要示例变化就改 `demo/src/samples` 再重跑
（`npm run samples:demo-common`）。

## 验收

```bash
node scripts/verify-demo.mjs http://localhost:9331/   # 逐个跑 9332 / 9335 / 9334
```

34 项 UI 级断言（四个宿主同一套，全部按 demo 的类名判定）：顶栏动作数与 `.demo-badge` 口径、
顶栏「宿主示例」下拉的收起态（五个工程入口齐备、只有当前宿主标 `.on`）与展开态
（菜单挂在顶栏下方，且 18 个采样点的命中测试全部归菜单——顶栏与画布容器是同级的 flex item，
浏览器按原子层整体绘制，层级不够菜单会被设计器整片盖住，只看元素尺寸会漏判）、
画布真的撑满 `.demo-container`（防「DOM 全绿但布局塌陷」）、宿主侧栏已删除、示例库卡片与缩略图、
页签筛选与应用、全屏预览层出纸（纸面数 / 文本 / 码值节点）与批量份数、自定义 JSON 的非法拦截与应用生效、
打印输出弹窗两条链路的状态与离线置灰、导出模板真的触发下载、全程 console 洁净。
其中示例库的卡片数、徽章示例名与标签页签计数直接读生成产物 `apps/vue3/src/templates.js`，示例增删后断言自动跟着走。

另有两份源码审计工具：`scripts/class-audit.mjs`（canvas 类名覆盖率）与
`scripts/style-scope-audit.mjs`（派生 CSS 的 scoped 泄漏嫌疑），它们查的是 `packages/print-common` 源码，与 demo 无关。

## 与 Vue 3 版 demo 的关系

`demo/`（9303）是 **canvas 版**（Vue 3 设计器）的集成示例；本目录是 **common 版**（零框架 Web Component）的
宿主集成示例，两者互不依赖。功能与样式一致性的逐项说明见 `packages/print-common/PARITY.md`。
