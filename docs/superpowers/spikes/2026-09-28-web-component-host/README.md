# Web Component 宿主适配验证（React / Vue2 / jQuery）

- 日期：2026-09-28
- 性质：**spike（一次性可行性验证）**，不作为产品代码维护
- **验证件状态（2026-09-29）**：`web-component-lab/` 与 `poc/react-print/` 两套验证件已随本次整理**删除**（其结论已由
  `packages/print-common` + `demo-common` 产品化取代）。本文是该轮验证的**唯一结论存证**；下文凡提到 lab / poc 的具体
  脚本与目录，读作当时得出该结论的证据来源，不要去仓库里找这些文件。截图证据（`evidence/`）本就不入库。
- 范围：只验证「设计器 `PrintDesigner` 能否被外部宿主挂载」，出纸链路（`core` 全家）本就框架无关，不在本次范围
- 执行代码：`web-component-lab/scripts/verify.mjs`（已删除），证据：`web-component-lab/evidence/*.json|png`（未入库，已随目录删除）
- 取证方式：DOM 断言 + 关键节点 `getBoundingClientRect` 量测 + **逐张人工可读截图复核**（每组 4 张：整页 / 设计器特写 / 打开弹层 / 断言结果）

## 一句话结论

**可行，但必须自己写一层薄封装；`defineCustomElement` 直接甩给宿主这条路不成立。**
封装层只需约 80 行（本 lab 的两个形态各一份），三生态宿主侧代码各约 20 行。

## 验证矩阵

3 宿主 × 2 封装形态 × 方法代理开关 = 12 组，每组 12–13 条断言，共 148 次断言执行；失败 8 条，全部是本次要暴露的结构性事实（Teleport 漏点 6 + Vue2 `:prop` 到达形态 2）。

| 断言 | 形态 A（shadow） | 形态 B（light DOM） |
|---|---|---|
| 设计器完成挂载 | PASS | PASS |
| 画布与纸张渲染 | PASS | PASS |
| 宿主收到 save 事件 | PASS | PASS |
| 宿主可读组件方法（save/getTemplateJson） | PASS（需封装层桥接） | PASS（原生即可） |
| 复杂数据双向（对象 / JSON 字符串） | PASS | PASS |
| 只写 attribute(JSON) 也能出图 | PASS（封装层自行 parse） | PASS |
| shadow/light 内画布交互可驱动（选中态 0→2） | PASS | PASS |
| 只存在一个设计器实例 | PASS | **修复后 PASS**（见结论 6） |
| 画布元素落在所属纸张内（偏移 151px） | PASS | PASS |
| 布局几何正确（designer 1411×1415 / toolbar 51px） | PASS（需封装层搬样式，见结论 5） | PASS（开箱即正确） |
| Teleport 弹层留在组件边界内 | **FAIL（结构性）** | 不适用 |
| 卸载后无残留 | PASS | PASS |
| Vue2 `:prop` 绑定到达形态 | **FAIL（string）** | PASS（object） |

12 组几何量测完全一致：`designer-container` 1411×1415（A）/1411×900（B）、`designer-toolbar` 1411×51、`canvas-area` 905 宽、
`hiprint-printPaper` 794×1123（A4@96dpi）各 1 张、元素相对纸张偏移 151px、零尺寸节点 0、失控图标 0/26。
截图复核确认 A/B 两形态与 demo 原生设计器在工具栏、素材台、属性台、标尺、状态栏上视觉一致。

产物体积（IIFE，含 Vue 3.5 运行时 + canvas + core）：
- 形态 A `print-designer-shadow.js` 596,160 B / gzip 181,260 B
- 形态 B `print-designer-light.js` 587,693 B / gzip 178,576 B
- 纯 `<script>` 无打包加载两形态均挂载成功且视觉正常（`evidence/plain-{shadow,light}.png`）

## 实测得到的硬结论

### 1. `defineCustomElement` 的声明式 attr convert 在 Vue 3.5.42 不生效

`@vue/runtime-dom` 的 `VueElement._setAttr()` 只做 `Number` 转换：

```js
// node_modules/@vue/runtime-dom/dist/runtime-dom.cjs.js:1046
const camelKey = shared.camelize(key)
if (has && this._numberProps && this._numberProps[camelKey]) value = shared.toNumber(value)
this._setProp(camelKey, value, false, true)   // 原样字符串
```

因此 `defineProps({ template: { attr: { mode: 'prop', convert: JSON.parse } } })` 里的 `convert` 不会被调用，
宿主写 `template='{"paperSize":"A4"}'` 时组件收到的仍是字符串。
**做法**：封装层把 props 声明为 `String`，内部自己 `JSON.parse`，同时兼容宿主直接赋对象（见 `src/ce/PrintDesignerShadow.vue` 的 `_parseJson`）。

### 2. `defineExpose` 的方法不会透出到自定义元素，但 `instance.ce` 是官方后门

Vue 只在 `exposed` 上找方法（`runtime-dom.cjs.js:880`），而 `defineExpose` 的对象在 `_instance.exposed`，
宿主 `el.save()` 直接 `undefined`（React 页实测 `__NO_METHOD__`）。
封装层在 `onMounted` 里用 `getCurrentInstance().ce` 拿到元素本体，再把方法 `defineProperty` 上去即可，
同一句柄也用来 `dispatchEvent` 把 `save/preview` 转成原生 `CustomEvent`。

### 3. `<Teleport to="body">` 是形态 A 的结构性漏点，修在组件侧比修在封装侧划算

`PresetColorPicker` / `HelpModal` / `TableContextMenu` 三个组件把弹层传送到 `body`。
shadow 形态下弹层必然落到宿主文档（实测 `body > .preset-color-panel`，宽 212px，作用域 `data-v-636b7670`），
且此时样式**恰好还能生效**，是因为 canvas 的 scoped CSS 被注到 `document.head`——
即「隔离」只隔离了组件自身 DOM，没隔离弹层，也没隔离全局样式表，两头的收益都没拿到。

### 4. `PrintDesigner.getTemplateJson()` 返回的是对象，不是字符串

名字与返回类型不符（`defineExpose({ getTemplateJson: templateJsonWithFonts })`，而 `templateJsonWithFonts()` 返回 `TemplateData | MultiPageTemplateData`）。
封装层若按名字当字符串用，宿主会拿到 `"[object Object]"`，或 `JSON.parse` 直接抛
`SyntaxError: "[object Object]" is not valid JSON`（lab 内实测踩过一次）。
**这是跨端契约，本次没动它**，封装层做归一处理；要改需单独评估对 demo / render / 客户端的影响。

### 5. 形态 A 的布局会整体塌陷，必须把作用域样式搬进 shadow（看图才发现）

只测 DOM 存在性时这条完全隐形（元素都在、`paper` 节点也都在），截图一看就是满屏巨型图标、无任何布局：

- 自定义元素默认 `display: inline`，宿主不给块级 + 高度时，`.designer-container` 的 `display:flex` 规则拿不到，
  实测根节点高 **291,970px**、工具栏选中成外层网格；
- lucide 图标在 demo 里靠宿主全局 CSS 兜尺寸，进 shadow 后 26 个图标里 1 个撑到视口宽（其余被 `flex` 布局掩盖）；
- 直接注入预编译的 `dist/canvas.css` **也没用**：dev 下 scopeId 由文件路径算出，
  别名/源码消费路径与包内构建路径不同，实测 DOM 上是 `data-v-8b0e4cd0`、产物里是 `data-v-fbba4a1c`，永不匹配。

可用做法（lab 内 `syncScopedStyles()`）：运行时收集 shadow 子树里出现的 `data-v-*`，
把 `<head>` 中命中的 `<style>` 克隆进 shadow root，并延迟补一次（子组件样式表在 head 里稍后才齐）。
副作用要说清楚：**这一步让形态 A 的「样式隔离」名不副实**——它依赖宿主 head 里存在同一份样式表，
只是把 DOM 边界关住了，CSS 来源仍是全局的。

### 6. Vue2 宿主会把形态 B 挂成两份设计器实例

Vue2 的 `createElm` 先把元素插进游离 fragment、再整体插入文档，`connectedCallback` 因此触发两次；
只写 `if (this.app) return` 挡不住（第一次触发时 `app` 还没赋值完），
实测宿主元素下出现两个 `.wc-host--light`、两份设计器、两张纸，可见那张是空的、有内容的那张滚到视野外。
**做法**：`connectedCallback` 里 `requestAnimationFrame` 等一帧，确认 `isConnected` 再挂，并用 `mountQueued` 标志防重入。
这条在 React/jQuery 宿主下不出现，只有 Vue2 会。

### 7. 方法论：这类验证必须看图，DOM 断言会全绿地骗你

本轮三个真 bug 全都是「DOM 断言全 PASS、截图一眼假」：

| 问题 | DOM 断言表现 | 截图表现 |
|---|---|---|
| 形态 A 布局塌陷 | 挂载 PASS、paper 节点存在 | 满屏巨型图标、无布局，根节点高 29 万 px |
| 形态 B 多包无定位容器 | 元素存在、可选中 | 元素跑到纸张之外的空白处 |
| 形态 B 双实例 | 元素数=2、纸张数=2 看着都对 | 可见画布是空的，内容在视野外 |

因此 `verify.mjs` 现在每组固定产 4 张图 + 关键节点 `getBoundingClientRect` 量测，
并加了「设计器实例数」「元素相对所属纸张偏移」两条几何断言——它们正是靠看图才发现该测什么。

## 推荐落地方案

**形态 B 的挂载方式 + 形态 A 的桥接写法**，即：自定义元素作为生命周期容器（`createApp` 挂 light DOM），
统一提供 attribute(JSON) + property(对象) 双通道、`CustomEvent` 事件出口、`save()/getTemplateJson()` 方法代理。

理由：
1. React/Vue2/jQuery 拿到的都是「标准自定义元素」，无需各生态 wrapper；
2. 样式与全局选择器行为与现在 demo 完全一致，零回归风险；
3. 只有形态 B 让 `el.xxx = 对象` 直接可用（形态 A 会反射成 `"[object Object]"`，宿主容易踩坑）。

真要做样式隔离，光注入 `dist/canvas.css` 不够（见结论 5 的 scopeId 不匹配），正式改造有两条路：
一是让 canvas 包发布一份「可注入 shadow 的样式入口 + 与消费路径无关的稳定 scopeId」（例如 `__VUE_PROD_DEVTOOLS__` 式的固定 hash 或改用 CSS 层/命名空间），
二是把三处 `Teleport to="body"` 改成 `:disabled` 可回退到组件内部。两条都属于 canvas 包的正式改造，不属于本次 spike 范围。

## 与既有 React POC 的关系

同日另有 `poc/react-print/`（已删除）：**用 React 重写设计器 UI、直接消费 `core`**，结论是 core 零改动可行。
两者定位不同，别混：

| | `poc/react-print` | `web-component-lab` |
|---|---|---|
| 路线 | 原生 React 重写设计器 UI | 复用 Vue3 画布，包成 Web Component |
| 成本 | 需长期维护一套 React 版设计器 | 约 80 行封装层，随 canvas 演进 |
| 体验 | 与宿主同一渲染范式，无 Vue 运行时 | 宿主多带 ~177 KiB gzip（含 Vue 运行时） |
| 适用 | React 是主技术栈、要长期演进 | 多宿主并存 / 老项目 / 快速给 designer 开接口 |

## 未覆盖项（如实说明）

- 视觉复核只覆盖「默认态 + 打开预置色弹层」两个画面，未逐一走预览/截图对比/拼版等分支弹窗；
  像素级差异（字体渲染、间距细微走形）没有做基线 diff，只做了「与 demo 同构」的定性判断。
- 未验证 SSR（Next/Nuxt）下的自定义元素水合时序。
- 未验证同页同时存在 Vue2 + Vue3 运行时的场景（形态 B 会引入第二份 Vue）。
- 拖拽从宿主字段面板进画布（跨边界 drop）未测，本次只覆盖组件内部拖拽与选中。
- 未测大数据量模板下的性能（样例模板仅 2 个元素）。
- 形态 A 的 `syncScopedStyles` 是 spike 级实现（克隆 head 样式表），未评估样式表数量/顺序对宿主性能与层叠的影响。
