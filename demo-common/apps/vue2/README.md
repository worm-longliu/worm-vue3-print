# apps/vue2 · Vue 2.7 宿主集成示例（SFC 单文件组件 · demo 同版式）

独立 npm 工程，只用 `@worm-vue3-print/common` + `@worm-vue3-print/core`。
界面版式与 `demo/`（Vue 3 打印设计器示例）**完全一致**：顶栏 + 全屏画布 + 四个弹窗
（打印预览 / 打印输出 / 示例库 / 自定义字段与数据），样式为各工程同源的 `demo-ui.css`，
本工程的 `.vue` 不写任何私有布局样式。用 runtime-only 构建（不需要 `vue/dist/vue.esm.js`）。

## 跑起来

```bash
npm install
npm run dev        # http://localhost:9332

# 可选：不装也能跑，页面显示「离线」并给出可读提示
npm run dev -w @worm-vue3-print/render     # 服务端 PDF（3001，dev 代理注入密钥）
# 客户端静默打印需本机跑着 print-client 桌面客户端（ws 127.0.0.1:17521）
```

验收：`node demo-common/scripts/verify-demo.mjs http://localhost:9332/`（应末行 `32/32 通过`）。

## 抄进 Vue 2 项目：这四份文件即可

| 文件 | 职责 |
| --- | --- |
| `src/App.vue` | 主界面：版式骨架 + `<print-designer>` 挂载 + property 注入 + 事件 + 四条交互链路（Options API） |
| `src/SampleThumb.vue` | 示例库卡片缩略图子组件（按模板坐标等比绘制，Options API） |
| `src/render-client.js` | 服务端 PDF 链路封装（`/render-api` 健康探测 / 生成 / 打开） |
| `src/browser-render.js` | 浏览器同构渲染封装（两遍渲染出 HTML、写入预览 iframe） |

外加两处一次性配置：

| 位置 | 内容 |
| --- | --- |
| `src/main.js` | `registerAll()` + `Vue.config.ignoredElements = ['print-designer']` + `new Vue({ render: h => h(App) }).$mount('#app')` |
| `vite.config.js` | `@vitejs/plugin-vue2`（`plugins: [vue2()]`），`/render-api` 代理注入 `X-Render-Key` |

依赖：`npm i @worm-vue3-print/common @worm-vue3-print/core vue@2.7`；`npm i -D @vitejs/plugin-vue2`。
示例数据在 `src/templates.js`（3 个示例，带 group/paper/desc 元数据），改成你的接口返回即可。

## Vue 2 专属的坑（务必处理）

1. **必须声明 `ignoredElements`**，否则 Vue 2 把 `<print-designer>` 当未注册组件，
   报 `Unknown custom element`，画面是空壳（写在 `main.js`，只需一次）。
2. **对象/函数入参只能赋 property**。`:template="obj"` / `:fields="arr"` 会走 `setAttribute` 被字符串化，
   故 `mounted`/`syncDesigner` 里 `el.fields = ...`、`el.template = ...`、`el.uploadImage = fn`、
   `el.uploadDesignBackground = fn`；字符串开关（`is-edit="true"`、`show-help="true"`）写在模板 attribute 上即可。
   `fields` 只有 setter，读回看 `el.store.fields`；`el.template` 的 getter 返回当前画布 JSON。
3. **样式不要加 `scoped`**。`demo-ui.css` 是各组件 scoped 逐字抽取后合并成的一份全局 CSS，
   `.thumb-*` 属于子组件 `SampleThumb`；App.vue 若加 scoped 会带 data 属性命不中子节点。
   故用 `<style src="./styles/demo-ui.css"></style>` 全局引入。`print-designer` 默认 `display:inline`，
   该 CSS 里已给 `.demo-container print-designer` 块级宽高，否则设计器塌陷。
4. **`structuredClone` 会抛 `DataCloneError`**。Vue 2 把 `data` 里的对象深度响应式化成 Proxy，
   直接 clone 会失败。批量派生与示例载入统一用 `JSON.parse(JSON.stringify(...))` 深拷贝
   （见 `deriveBatchData`、`applySample`）。
5. **`v-if` 控制的预览 iframe 要等下一帧再写内容**。打开预览后 `await this.$nextTick()` 再
   `await requestAnimationFrame(...)` 两层，节点才真正可取，随后 `writeHtmlToFrame` 写入 HTML。
6. **事件是 CustomEvent**。`@save` / `@preview` 的 `event.detail` 是模板 JSON 字符串（`@preview` 已带当前模板），
   另有 `@help`、`@dblclick-element`；旁路取模板用 `getTemplateJson()`，但它绕过拼版闸门，
   保存/导出前需自己调 `validateTemplate()`。
7. **模板单根节点**。四个 mask 全部放在根 `.demo-app` 内（Vue 2 不支持多根 fragment）。

## 页面上能点的集成动作

顶栏：自定义字段与数据 / 加载示例 / 导出模板 / 导入模板 / 清空 / 打印输出 / 批量开关。
示例库弹窗：分组页签（全部·单据·标签·小票）+ 缩略图卡片 + 双击/确定应用。
自定义弹窗：粘贴字段/数据 JSON、格式化、非法拦截、应用即时生效。
预览：点设计器自身「预览」触发 `@preview` → 全屏预览层浏览器同构渲染出纸（Esc 关闭）。
打印输出弹窗：服务端 PDF 与客户端静默打印两条链路（首次打开探测一次，离线自动置灰降级）。
批量开关切数组数据，三条链路共用同一数据源。端口：9332。
