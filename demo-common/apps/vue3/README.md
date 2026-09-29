# apps/vue3 · Vue 3 宿主集成示例

一个独立 npm 工程，只用公开包 `@worm-vue3-print/common` + `@worm-vue3-print/core`，
页面里把集成过程全摊开：设计器挂载、模板/字段注入、宿主回调、事件、三条打印链路。

界面版式与 `demo/`（Vue 3 打印设计器示例）**完全一致**：顶栏 + 全屏画布 + 四个弹层
（打印预览 / 打印输出 / 示例库 / 自定义字段与数据）。宿主样式是各工程同源的
`src/styles/demo-ui.css`（由 `demo-common/scripts/sync-demo-styles.mjs` 从 demo 逐字抽取生成，勿手改），
本工程的 `.vue` 不写任何私有布局样式。

## 跑起来

```bash
npm install
npm run dev        # http://localhost:9331

# 可选：不装也能跑，弹窗里显示「离线」并给出可读提示
npm run dev -w @worm-vue3-print/render     # 服务端 PDF（3001，dev 代理注入密钥）
# 客户端静默打印需要本机跑着 print-client 桌面客户端（ws 127.0.0.1:17521）
```

验收：`node demo-common/scripts/verify-demo.mjs http://localhost:9331/`（应末行 `32/32 通过`）。

## 抄进自己项目只需要四处

| 位置 | 内容 |
| --- | --- |
| `npm i @worm-vue3-print/common @worm-vue3-print/core` | 两个包，无 UI 组件库依赖 |
| `src/main.js` | `registerAll()` 一次，注册 `<print-designer>`（设计器样式在组件 Shadow DOM 内，不必引 css） |
| `vite.config.js` | `@vitejs/plugin-vue` 的 `template.compilerOptions.isCustomElement: tag => tag.startsWith('print-')` |
| `src/App.vue` | 版式骨架 + property 注入 + 事件监听 + 三条出纸链路；`src/SampleThumb.vue` 为示例库卡片缩略图（几何工具取自 core） |

## 三个必须知道的口径

1. **对象入参只能赋 property**。Vue 的 `:template="obj"` / `:fields="arr"` 会走 `setAttribute` 被字符串化，
   所以 `App.vue` 在 `onMounted` 里 `el.fields = ...`、`el.template = ...`、`el.uploadImage = fn`。
   字符串开关（`is-edit="true"`、`show-help="true"`）写在模板属性上即可。
2. **`fields` 没有 getter**。要读回宿主字段看 `el.store.fields`；`el.template` 的 getter 返回的是当前画布 JSON。
3. **事件是 CustomEvent**。`@save` 的 `event.detail` 是模板 JSON 字符串（宿主自己持久化，demo 里顺手下载成文件）；
   `@preview` 额外带同一份 JSON；另有 `@help`、`@dblclick-element`。
   旁路取模板用 `el.getTemplateJson()`，但它绕过拼版校验，保存/导出前要自己调 `el.validateTemplate()`。

## 页面上能点的集成动作

顶栏：自定义字段与数据 / 加载示例 / 导出模板 / 导入模板 / 清空 / 打印输出 / 批量开关。
示例库弹窗：分组页签（全部·单据·标签·小票）+ 版式缩略图卡片 + 双击或「使用该模板」应用。
自定义弹窗：粘贴字段/数据 JSON、格式化、非法拦截、应用即时生效。
预览：点设计器自身「预览」触发 `@preview` → 全屏预览层用 core 同构管线出纸（Esc 关闭，「打印」走 `contentWindow.print()`）。
打印输出弹窗：服务端 PDF（`/render-api` 代理，密钥不进前端）与客户端静默打印
（`PrintClient.connect/listPrinters/printHtml`），首次打开探测一次，离线自动置灰降级。

端口：9331。批量数据在 `src/templates.js` 的 `batchData`，改成你的接口返回即可。
