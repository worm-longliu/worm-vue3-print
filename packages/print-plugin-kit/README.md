# @worm-vue3-print/plugin-kit

> [!IMPORTANT]
> **【迁移公告】** `worm-vue3-print` 已进入维护状态，稳定主版本 1.5.x 已迁至 **worm-print-platform**（[Gitee](https://gitee.com/liulong_oschina/worm-print-platform) ｜ [GitHub](https://github.com/worm-longliu/worm-print-platform)）；npm scope `@worm-vue3-print/*` → `@worm-print-platform/*`。
> **本包迁移去向**：[`@worm-print-platform/plugin-kit`](https://www.npmjs.com/package/@worm-print-platform/plugin-kit)，升级为 npm 正式包，契约与注册表同名同形。完整步骤见[新仓迁移指南](https://github.com/worm-longliu/worm-print-platform/blob/master/docs/migration-worm-vue3-print.md)。

打印模板自定义元素的**框架无关设计器 UI 契约与注册表**。

插件作者只写一份 DOM 渲染能力（返回 HTML 字符串或 DOM 节点），即可同时被两类宿主消费：

| 宿主 | 消费方式 |
| --- | --- |
| `@worm-vue3-print/common` | 零框架原生挂载：素材卡、画布、属性台「自定义属性」页签直接使用 UI |
| `@worm-vue3-print/canvas` | Vue 3 桥接：`useElementExtensionRegistry` 自动生成画布组件与属性页签组件 |

> 状态：随工作区主线开发，**尚未发布到 npm**；通过 workspace / `file:` 依赖接入。

## 与 core 插件描述符的关系

- **元素语义**（kind 类型、标签、图标、专属属性元数据、默认值、绑定、出图、校验、AI/MCP 可见性）仍由
  `@worm-vue3-print/core/designer` 的 `defineElementPlugin` + `registerElementPlugin` 声明。
- **设计器 UI**（画布长什么样、属性台怎么改）由本包的 `defineElementUI` + `registerElementUI` 声明。
- 两者用元素 `type` 关联：宿主只展示「core 注册表里有 kind 且 plugin-kit 里有 UI」的元素，避免出现无法渲染的素材卡。

## 契约

```ts
import { defineElementUI, registerElementUI } from '@worm-vue3-print/plugin-kit'

export const MY_ELEMENT_UI = defineElementUI({
  types: ['myElement', 'myElementBold'],
  renderCanvas: ({ element }) => `<svg data-type="${element.printElementType.type}"></svg>`,
  renderProperty: ({ element, update }) => {
    const form = document.createElement('form')
    form.className = 'pd-form'
    // …原生 DOM 构建，控件类名与 canvas / common 的 .pd-* 一致即可复用两侧样式
    const input = document.createElement('input')
    input.className = 'pd-input'
    input.value = String(element.options.myText ?? '')
    input.addEventListener('change', () => update({ myText: input.value }))
    form.appendChild(input)
    return form
  },
  hasProperties: element => element.options.myText !== undefined,
  // 素材卡分组：core 描述符的 designer.materialCard.group 优先，缺省回落到这里
  group: '我的元素',
  searchKeywords: ['我的元素', 'myElement'],
  styles: '.my-element-row { display: flex; gap: 6px; }',
})

// 包入口 import 即注册；返回注销句柄
registerElementUI(MY_ELEMENT_UI)
```

### 渲染结果

`renderCanvas` / `renderProperty` 返回以下三种形态之一：

| 形态 | 宿主行为 |
| --- | --- |
| `string` | 作为 HTML 注入宿主容器（插件负责保证内容安全、可信） |
| `Node` | 直接挂载 |
| `{ node, dispose? }` | 挂载前者的内容，宿主重绘/卸载时调用 `dispose` 释放监听或实例 |

### 设计态上下文：`data` 与 `fields`

两个渲染函数都会收到 `data`（数组信封，`data[0]` 是数据根对象）；属性台还额外收到 `fields`：

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `data` | 宿主注入的设计态示例数据；未注入时回落 core 的 `DEFAULT_DEMO_DATA` | 画布预览按真实业务数据出图（图表类插件的柱子/扇区由此而来） |
| `fields` | 宿主的业务字段清单（`fieldKey` / `fieldLabel` / `fieldType`） | 生成「数据源 / 类目 / 数值字段」下拉，不必从 demo 数据的键里猜 |

`@worm-vue3-print/common` 宿主用 `el.designData = {...}`（或 `design-data` attribute 的 JSON 串）注入示例数据，
单对象会自动归一成 `[对象]`；`fields` 来自 `el.fields`。未注入时 `fields` 为空数组，插件应回落 `data[0]` 的键。
Vue 3 的 `@worm-vue3-print/canvas` 属性台透传宿主的 `fields`，画布组件则透传宿主的 `printData`。

### 属性写回

属性上下文只提供 `update(partial)` / `repaint()`（`data` / `fields` 是只读上下文）：

- `update(partial)`：宿主把补丁合并进 `element.options`、记一条历史并重绘（canvas 由桥接组件 emit `change`）。
- `repaint()`：只请求重绘，不写数据、不记历史。
- 插件不得绕过宿主直接改 store；嵌套字段（如 `chartOption`）由插件归一后整体写回。

### 事件建议

- **common** 的属性台是整树重绘模型，文本输入用 `change`（失焦/回车提交）而不是 `input`，否则每次提交都会重建 DOM、丢失焦点。
- **canvas** 的桥接组件对「自身 update 引起的变化」不做重渲染，对撤销/外部程序化修改会重渲染，因此同一份 UI 在两侧都可连续输入。

## 注册表 API

| API | 说明 |
| --- | --- |
| `defineElementUI(ui)` | 校验并返回描述符（不注册） |
| `registerElementUI(ui)` | 注册；同 type 后注册者覆盖，返回只注销自己这一版的句柄 |
| `getElementUI(type)` | 按元素类型取 UI |
| `getElementUIEntries()` | `{ type, ui }[]`，供宿主生成素材卡/属性页签 |
| `getElementUIs()` | 去重后的 UI 列表（一份 UI 覆盖多 type 时只返回一次） |
| `getElementUITypes()` | 已注册类型 |
| `subscribeElementUIRegistry(fn)` | 订阅注册态变化，宿主据此刷新素材台/属性台 |
| `clearElementUIs()` | 清空（单测/热重载） |

注册态挂在 `globalThis` 的固定 `Symbol` 上，与 core 元素插件注册表同一约定，避免 monorepo / 多打包副本
出现「注册在这份、查询在那份」的漂移。因此 common 的 UMD 直挂形态与插件的 ESM 形态可以共享同一份注册态。

## 边界

- 本包纯 TS，不依赖 Vue / React / 任何 UI 组件库；DOM 操作只在渲染函数被宿主调用时发生。
- 插件 UI 用样式串注入宿主样式作用域（common 的 Shadow DOM / canvas 的 `document.head`），不提供独立 CSS 文件。
- 宿主与插件包都不负责出纸：打印仍走 core 的通用渲染协议（`render.html` / `createRenderer` / `executorBundle`）。
