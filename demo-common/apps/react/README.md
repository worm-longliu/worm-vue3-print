# apps/react · React 18 宿主集成示例

独立 npm 工程，只用公开包 `@worm-vue3-print/common` + `@worm-vue3-print/core`，
把集成过程全摊开：设计器挂载、模板/字段注入、宿主回调、事件、三条打印链路。
界面版式与 `../../../demo`（Vue 3 打印设计器示例）**完全一致**，样式为同源单一文件。

## 跑起来

```bash
npm install
npm run dev        # http://localhost:9335
```

可选（不装也能跑，「打印输出」弹窗会显示「离线」并给出可读提示）：
```bash
npm run dev -w @worm-vue3-print/render     # 服务端 PDF（3001）
# 客户端静默打印需要本机跑着 print-client 桌面客户端（ws 127.0.0.1:17521）
```

验收：`node demo-common/scripts/verify-demo.mjs http://localhost:9335/`（要求末行 `32/32 通过`）。

## 抄进 React 项目需要这几份文件

| 位置 | 内容 |
| --- | --- |
| `npm i @worm-vue3-print/common @worm-vue3-print/core` | 两个包，无 UI 组件库依赖 |
| `src/main.jsx` | `registerAll()` 一次 + `import './styles/demo-ui.css'` |
| `src/styles/demo-ui.css` | demo 同源样式（由 `demo-common/scripts/sync-demo-styles.mjs` 逐字抽取，四个工程同 MD5，**勿手改**） |
| `src/App.jsx` | 顶栏 + `<print-designer>` + 预览层 + property 注入 + 事件监听 + 出纸调用 |
| `src/components/*.jsx` | 打印输出 / 示例库 / 自定义字段三个弹窗，各自独立 |
| `src/SampleThumb.jsx` | 示例卡片版式缩略图（几何工具从 `@worm-vue3-print/core` 具名导入） |
| `src/render-client.js` | 服务端 PDF 链路封装（同源 `/render-api/*`，密钥由 dev 代理注入） |
| `src/browser-render.js` | 浏览器同构渲染 + 写入预览 iframe |

React 侧没有 `isCustomElement` 这种编译配置：未知标签 `print-designer` 直接按原生元素渲染，
所以只剩下面两条运行期约定。

## 四个必须知道的 React 专属坑

1. **对象/函数入参只能赋 property**。JSX 里 `template={obj}` 会被 React 当 attribute 字符串化成
   `[object Object]`，所以在 `useEffect` 里 `el.fields = ...`、`el.template = ...`、
   `el.uploadImage = fn`、`el.uploadDesignBackground = fn`。
   字符串开关（`is-edit="true"`、`show-help="true"`）写在 JSX 属性上即可。
   `fields` 只有 setter，读回看 `el.store.fields`。
2. **事件必须 `addEventListener` 且在 cleanup 里 `removeEventListener`**。
   JSX 的 `onSave` 不会绑定 CustomEvent。`main.jsx` 有 `StrictMode`，dev 下 effect 双跑，
   漏解绑会重复注册（同一次 `@save` 下载两份文件）。载荷在 `event.detail`（模板 JSON 字符串；
   例外：`dblclick-element` 的 detail **就是元素 id 字符串本身**、`dblclick-cell` 的是
   `{ elementId, r, c, cellId }` 对象，都**不要** `JSON.parse`）。
   旁路取模板用 `el.getTemplateJson()`，它绕过拼版校验，保存/导出前要先调 `el.validateTemplate()`。
3. **一次性注册的处理器要读最新状态需绕开闭包陷阱**。三条链路要用当前 `printData`（随批量开关变），
   若把 `printData` 放进事件 effect 依赖会导致频繁重绑；这里用 `printDataRef` 桥接，
   事件只注册一次、处理器读 `ref.current`。
4. **预览 iframe 条件渲染**。等 DOM 提交后再写 HTML（`await nextFrame()` 后取 `ref.current`）；
   Esc 关闭预览的 `keydown` 在打开时绑定、关闭时解绑；模板深拷贝用 `JSON.parse(JSON.stringify(...))`，
   别塞进会被 `structuredClone` 处理的响应式包装。

## 页面上可点的动作（与 vue3 子工程完全一致）

示例模板库切换（10 个与 demo 同源的示例：单据 / 标签拼版 / 连续纸小票）· 自定义字段与数据 · 导出/导入/清空模板 ·
设计器自身「预览」唤出的全屏预览层与浏览器打印 · 打印输出弹窗内的服务端 PDF 与客户端静默打印 ·
批量份数开关（把打印数据切成数组，三链路共用）。

批量数据在 `src/templates.js` 的 `batchData`，改成你的接口返回即可。端口：9335
（用 9335 是因为 9333 被无关进程占用）。
