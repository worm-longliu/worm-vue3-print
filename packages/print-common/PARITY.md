# 与 Vue3 版设计器（`@worm-vue3-print/canvas`）的一致性清单

> ⚠️ 本包为**实验性质**，不建议应用到生产中；Vue 3 项目的正式方案是 `@worm-vue3-print/canvas`。
> 验收口径：**功能清单逐项 + 截图逐张比对**（历史轮次），现为「逻辑单测 + 源码审计 + 宿主集成验收」。
> 早期成对截图脚本（`demo-common/scripts/compare.mjs`，输出 `demo-common/evidence/compare/`，两侧同名成对如
> `vue3-10-toolbar.png` / `common-10-toolbar.png`）依赖当时的共用壳层与 `#demo` 别名直连 `demo/src/samples/**`；
> 壳层拆除后这批脚本已删除，结论见下方各节的「✅ / 🟡 + 说明」。

状态记号：✅ 已实现且与 Vue3 版同口径 · 🟡 已实现但存在口径偏差 · ⬜ 未实现

## 〇、当前验收手段

| 手段 | 命令 | 覆盖 |
|---|---|---|
| 逻辑单测 | `npm run test -w @worm-vue3-print/common` | 354 项 / 31 个 spec（2026-10-30 实测，按文件计）：`store` 24（三区摊平与序列化往返、默认页名与重排、拼版闸门、对齐、层级、撤销重做、参考线、粘贴偏移与组 id 重映射、Ctrl+D 复制、方向键微移会话、落点归区与类型拒绝、拖拽结束归区、Alt 拖拽克隆、格式刷、混选 MIXED、字体只落文本元素、加粗回落）、`format-border` 13（格式栏边框预设/单边按上下文分流；「内部」那一格仅单元格上下文可点）、`flow-list` 13（含与 canvas 对齐的四条：步进框显解析值、提示行逐字同串、关开关不写 `flowMaxSpan`、折叠偏好落 `property-group-flowList`，另含图层 12 类图标表）、`code` 26（含静区两行改「留空靠占位 + 显式敲值才写键」与裸字符串字体不进候选）、`element-border` 17、`cell-border` 22、`crop-anchor` 23、`table` 13、`table-font` 4、`table-cell-reset` 10、`property-panel-reset` 16、`page-extras-reset` 4、`watermark-reset` 5、`reset-button` 11、`property-search` 17、`font-select` 18、`color-picker` 15、`help-modal` 14、`context-menu` 10、`drag-visuals` 9、`adsorb-drag` 3、`expression-dblclick` 9、`field-tree` 4（长字段两行显示 + 单击字段行复制中文名、拖拽起手不复制）、`expression-copy` 4（表达式弹窗字段复制按钮：挂点/复制中文名/不误触双击插入/`data-tip` 两态）、`toolbar-overflow` 8、`typography-issue4` 10（issue #4 排版契约：缩进 em、justify 纵向主轴 + `text-align-last:justify`、单元格两端对齐四档、image fit/锚点/放大比例）、`geometry-warnings` 4、`keep-line-breaks` 8、`element-rotate-gate` 10、`property-panel-cell-binding` 3、`tiling-rotation` 7（后五项随 V1.4.0 已提交改动入库，2026-10-30 一并实测计入）。原记「`store.spec` 三条因 happy-dom 无 `window.alert` 常红」已不复现，24 项全绿；`npm run typecheck -w @worm-vue3-print/common` 由 HEAD 的 8 条错误降到 **0**（本轮一并清掉测试文件的类型洞，vitest 不查类型，提交前须单独跑） |
| 类名覆盖率审计 | `node demo-common/scripts/class-audit.mjs` | 把 canvas 50 个组件模板里出现的类名逐个回查本包源码：「派生 CSS 有该规则 + 本包源码无挂点」= 掉样式或缺功能。当前 canvas 348 个类名、未命中 13 个（2026-10-24 实测），逐个核过：`print-html-preview*`（7，含 1.3.10 预览缩放新增的 `-zoom`/`-zoom-btn`/`-zoom-note`）属 §六「不移植」——本包源码不挂它们属预期，四个宿主 demo 自复刻的预览层已在 2026-10-24 补齐这三件（见 §六 该行与 `TODO.md` T-19）；`zone-header/content/footer`、`handle-top/bottom`（5）本包用模板串动态拼挂点（`shell/canvas.ts:106` 的 `zone-${zone}`、`shell/canvas.ts:95` 与 `shell/elements.ts:241` 的 `handle-${p}`/`handle-${dir}`，另有 `shell/elements.ts:253` 的 `zone-${zone}`），静态扫描读不到，属假阳性；`placement`（1）是扫描器把 `FontSelect.vue` 模板表达式 `placement === 'up'` 里的标识符当类名提取，真实类名是 `is-up` |
| 派生 CSS 泄漏审计 | `node demo-common/scripts/style-scope-audit.mjs` | 列两类嫌疑（纯泄漏：类只在一个组件 scoped 定义却被别处用；多组件同名声明不同），裁决须两侧实测 computed style |
| 宿主样式同源 | `npm run styles:demo-common` | `demo-common/scripts/sync-demo-styles.mjs` 从 `demo/src/App.vue` + `DemoTopbarMore.vue`（顶栏「更多」面板，10-24 补进抽取清单）+ 三个弹窗 + `SampleThumb` + 本仓 `PrintHtmlPreview` 逐字抽取 style，合成四个宿主工程同 MD5 的 `src/styles/demo-ui.css`（现 977 行）；四个子 demo 的宿主版式因此与 Vue3 版 demo **完全一致**（工程内不再写私有布局样式）。**改了 demo 任何一处 `<style>` 必须重跑本脚本**——产物此前漏收 `.demo-ou`/`.demo-spacer`/`.is-tight`/`.demo-more-*` 一组规则，宿主渲染这些类却拿不到样式（`TODO.md` T-19b） |
| 宿主示例库同源 | `npm run samples:demo-common` | `demo-common/scripts/sync-demo-samples.mjs` 在生成期求值 `demo/src/samples`（canvas 运行时别名到 `core/designer`、`BASE_URL` 固定为站点根、缺省 `batchData` 按 demo 的 `deriveBatchData` 展开成字面量），合成四个宿主工程同 MD5 的 `src/templates.js`（10 个示例），并把示例引用的 `demo/public/{images,fonts}` 资源拷进各宿主 `public/`（字体不入库）；四个子 demo 的示例库因此与 Vue3 版 demo **完全一致**（工程内不再手写第二份模板数据） |
| 宿主集成验收 | `node demo-common/scripts/verify-demo.mjs <url>` | 36 项 UI 级断言（2026-10-24 实测；该脚本断言数会随验收面增加，别照抄旧计数），四个宿主 demo（9331/9332/9335/9334）跑同一套、全部按 demo 类名判定：顶栏 6 个动作与徽章口径、顶栏「宿主示例」下拉两态（收起态五个工程入口含 demo 的 9303 且只标当前宿主；展开态菜单挂在顶栏下方并被 18 个采样点命中测试确认未被画布原子层遮挡）、画布真的撑满 `.demo-container`（防「DOM 全绿但布局塌陷」）、宿主侧栏已删除、示例库卡片与等比缩略图、页签筛选与应用、全屏预览层出纸（纸面数/文本/码值节点）与批量份数、自定义 JSON 非法拦截与应用生效、打印输出弹窗两条链路状态与离线置灰、导出模板真的下载、console 洁净 |

> **历史说明**：本包早期靠 13 套 Playwright「与 Vue3 版逐像素对拍」脚本（分区成对截图、交互链路、
> 表格 / 表达式编辑器 / 自动缩小 / 操作链路 / 导出 JSON / 拼版面板 / 属性台 computed style / 12 类元素渲染 /
> 状态成对截图）把差异逐项清零，本文下方各节的「✅ / 🟡 + 说明」结论就是那轮对拍的产物。
> 2026-09-29 `demo-common` 改为「四个独立宿主 demo、不共用壳层」后，这批脚本依赖的那套壳层 UI 已不存在，
> 脚本随之删除；下方清单里凡提到具体对拍脚本的条目，读作「当时由哪一类断言查出」的历史证据，
> 现在要复现同类结论请用上表的单测 + 审计工具 + `verify-demo.mjs`。

## 一、几何基线（1440×900 视口，两侧设计器可用宽度对齐）

| 分区 | Vue3 | Common | 结论 |
|---|---|---|---|
| 外壳 `.designer-container` | 1440×855 | 1440×854 | ✅ 宽完全一致，高 ±1px |
| 工具栏 `.designer-toolbar` | 1440×51 | 1440×51 | ✅ 完全一致 |
| 页签 `.page-tabs` | 1440×36 | 1440×36 | ✅ 完全一致 |
| 素材台 `.left-panel` | 225×737 | 225×736 | ✅ 宽完全一致，高 ±1px |
| 画布 `.canvas-area` | 934×737 | 934×736 | ✅ 宽完全一致，高 ±1px |
| 纸张 `.hiprint-printPaper` | 1123×794 | 1123×794 | ✅ 完全一致 |
| 属性台 `.property-panel` | 281×737 | 281×736 | ✅ 宽完全一致，高 ±1px |
| 状态栏 `.status-bar` | 1440×31 | 1440×31 | ✅ 完全一致 |

宽度已逐像素对齐；1px 级高度差来自 demo 页面自身外壳（两侧顶栏/边栏高度不同）与滚动条取整，不来自设计器样式。
样式来源同一（`scripts/gen-styles.mjs` 从 canvas 构建 CSS 剥离 `[data-v-*]` 派生，517 条规则 / 68.5 kB，末尾追加手写泄漏修正层 `styles/scope-patches.css`），
`:host` 基线只补块级尺寸（见 §八 第 7 条）。

## 二、外壳与编排

| 能力 | 状态 | 说明 |
|---|---|---|
| 工具栏分组顺序（文件标识 / 撤销重做 / 格式区段 / 排列 / 视图 / 缩放 / 剪贴板 / 帮助 / 预览保存） | ✅ | lucide 图标由 `scripts/gen-icons.mjs` 从 canvas 的导入清单派生，35 个同名图标 |
| 排列下拉：对齐 8 + 层级 4 + 组合 2，无选中常驻置灰 | ✅ | `data-tip` 全量覆盖（含禁用原因） |
| 视图下拉：标尺/网格/虚框/吸附 | ✅ | 1.3.5 起不再有「首页专属」与「叠层对比」 |
| 格式刷：单击刷一次、双击连续刷、Esc 退出 | ✅ | `core/format.ts`（移植自 `useFormatToolbar` + `useFormatPainter`） |
| 字体 / 字号 / 粗 / 下划线 / 删除线 / 字色 / 底色 / 对齐 / 边框面板 | ✅ | 混选占位、单元格上下文、hline/vline 只吃边框等口径照抄。单元格上下文的对齐面板与属性台「水平对齐」同为 左/中/右/两端 四档，`justify` 三端成对输出 `text-align-last:justify`（`TableCellGroup` / `table-props.ts` / core `matrixCellStyle` / 本包 `table.ts` 单元格样式）。**边框三行回读（2026-10-24 第三轮）**：单元格上下文下，单格取 core `resolveCellBorderDisplay`（四边不一致的字段留空：线型图标全不亮、粗细占位「混合」、颜色空块并出常驻提示；未改项批写按缺省档），多选落缺省档作批写源；只在选区 key 变化时回填，同一选区的用户草稿不被重绘冲掉；预设/单边用回读规格落盘；单格无边框时线型无、粗细 0（选非无线型自动补 0.75）。元素上下文不变 |
| 颜色选择 | ✅ | `shell/color-picker.ts` 整段移植 `PresetColorPicker.vue`：`.preset-color-trigger` + `.preset-color-panel`（`.picker-preview` / `.picker-current` / `.picker-hex` / `.picker-area` + `.picker-handle` / `.picker-hue` / `.picker-heading` / `.picker-clear` / `.preset-color-grid` 逐项同结构同类名），单测 15 项覆盖 hex↔hsv 往返、非法输入不回写、清除/收起/Esc/外部点击与重绘保活 |
| 字体候选列表 | ✅ | `shell/font-select.ts` 直接消费 core `print/fonts.ts` 的 `normalizeFontCatalog` / `filterFontOptions` / `findFontOption` / `fontOptionLabel` / `normalizeFontQuery`（**2026-10-24 单点化**：canvas 的 `useFontCatalog.ts` 只留 Vue 侧包装并转导同一批函数，本包原先那份等价实现 `core/font-catalog.ts` 已删，不再有两套分档匹配算法）；族名大小写不敏感去重、保留声明顺序、相等>前缀>子串>子序列的档位与「label 与 family 取更优一档」只有一份实现；候选来自宿主 `designer.fonts` 注入，**条目必须是字体声明对象——裸字符串族名两侧都静默丢弃**（本包此前比 canvas 宽容一档，已按 vue3 收紧；`controls.ts` 的 `host.fonts` 类型同步成 `readonly PrintFontDeclaration[]`，与 canvas 的 `fonts` prop 同类型），未注入时仍可自由输入并保留「清除 / 自定义」行 |
| 页签：新增/复制/删除/重命名/前移后移、拼版模板拦截 | ✅ | 拦截文案与 canvas 同串 |
| 多页导出格式与新增页继承 | ✅ | `getTemplateJson()` 与 canvas 同口径：单页直接导出该页对象，多页导出 `{ version: 1, pages: [...] }` 外层包装（早期本包直接吐数组，宿主拿到的是非法模板）。`addPage()` **继承当前激活页的纸张尺寸与方向**（`paperSize/orientation/customWidth/customHeight`）并用 `nextDefaultPageName()` 取不重复的默认页名 —— 早期本包塞的是竖版 A4 默认页，在横版模板里新增一页后「保存」会被拼版闸门拦住（`多页面模板各页纸张尺寸必须一致（第 2 页「页面 2」 210×297mm 与首页 297×210mm 不同）`） |
| 素材台：元素 12 类 / 字段树（分组、搜索、折叠、拖拽、单击复制字段名）/ 图层（选中、层级、组合） | ✅ | 字段分组走 core `groupFields`；工具箱类型与顺序逐项等于 canvas `LeftPanel`（`text/barcode/qrcode/image/table/flowList/longText/hline/vline/rect/oval/html`，`pageNumber` 两侧都不进工具箱）；图层行的 12 类图标表两侧同字面量（canvas `LayerPanel.elementIconMap` ↔ 本包 `panels.LAYER_ICON`，`flowList` 为 `⊟`，2026-10-24 补齐 canvas 缺的那一项）。**单击字段行复制字段中文名**（Gitee #IKRIZM：拖字段只带取值绑定，字段名称要能当静态文本用）：复制件统一走 core `copyTextToClipboard`（安全上下文 `navigator.clipboard`，否则 textarea + `execCommand` 回退），成功后行内出现「已复制」1.2s，拖拽起手不复制（canvas 用 `dragging` 守卫，本包 `draggable` 行被拖时不派发 click）|
| 图层行的可见 / 锁定按钮 | ✅ | canvas `LayerPanel.vue` 本身就没有逐行眼睛/锁（只有两组批量 `.layer-actions`），锁定与隐藏入口在属性台「高级」组，两侧一致 |
| 状态栏：坐标读数、缩放、元素数、未保存、纸张 | ✅ | |
| 帮助弹窗 `HelpModal` | ✅ | `shell/help-modal.ts` + `shell/help-content/`（章节文案逐字复制 canvas）：`.help-modal-overlay > .help-modal > 头部(标题+项目名+关闭) / 侧栏 .help-tab(.active) / .help-content` 类名同 canvas，记住页签复用同一 localStorage 键 `worm-print-help-tab`；单测 14 项 |
| 属性搜索 `PropertySearch` | ✅ | `shell/property-search.ts`：命中算法与分组直接消费 core 的 `PROPERTY_REGISTRY` / `searchProperties`，字段门控沿用 canvas 的 `matchedKeys`/`showItem` 口径（收起节点留在 DOM 只切 display）；单测 14 项。色板面板 / 字体下拉 / 帮助弹窗 / 属性搜索命中四类弹层已有成对状态截图与结构签名断言（§〇 `states.mjs` 的 G–J） |

## 三、画布与交互

| 能力 | 状态 | 说明 |
|---|---|---|
| 三区（页眉/内容/页脚） | ✅ | 区域矩形算法与 `CanvasPaper.zoneRectsMM` 一致 |
| 元素归区（拖拽/缩放结束 + 素材与字段落点） | ✅ | 全走 core `zone-layout`：`dragStart()` 存几何快照、`dragStop()` 只对**变化过**的元素按中心点 `finalizeElementZone`（跨区换算坐标并改写 `zone`、页眉页脚内 `clampToZone`、`ZONE_ALLOWED_TYPES` 之外退回内容区并 `alert('该元素类型不能放入页眉/页脚')`）；素材/字段拖入用 `placeAtDropPoint`（不允许的类型**不入元素池**）。早期本包完全不做归区：拖进页眉带的元素仍留在 `content`，纸面看着对、导出的模板 JSON 却把页眉元素留在正文区 —— 由 ops 第 10/11 步揭穿 |
| 拖拽/缩放期间自由跟手 | ✅ | 与 canvas `useDrag.computePos` 同：中途**不做 0 钳制**（可拖出纸面左上角），越界只在结束时由归区/clamp 收敛。早期 Common 把 live 坐标钳到 `>=0`，导致永远拖不进页眉带、护栏提示也永远不弹 |
| 坐标精度与缩放算式（导出逐字段对齐的前提） | ✅ | 拖拽/缩放/落点全部走 canvas 同一套浮点算式：像素→mm 一律 `deltaPx / (scale * mmToPx(1))`（先乘后除，与 canvas 的运算顺序一致；换写法会得到 `17.208333333333332` vs `17.208333333333343` 这类 1e-14 尾差），**全程不取整**（早期本包 `toFixed(1)` 到 0.1mm，纸面看不出、导出全变）。缩放矩形直接调 core `calcResizeRect(point, startRect, dx, dy, 3.5, 3.5)`，最小尺寸下限与 canvas 同为 **3.5mm**；落点 `pointToPaperMm` 返回原始 mm 且**负值返回 null**（canvas `toPaperPoint` 的语义是「越界即不落」，不是钳到 0） |
| 新增元素的默认尺寸 | ✅ | 落点新增只传落点，尺寸一律取 core `createDefaultOptions(type)` 的分类型默认（早期本包硬编码 60×12，横线/表格/条码落地尺寸与 canvas 不同）；写回历史粒度差异（见 §八.3） |
| 页眉/页脚高度拖拽 + mm 提示 | ✅ | |
| 缩放（transform scale + wrapper 占位）/ 适应窗口 / Ctrl+滚轮 | ✅ | 与 canvas 同一套算式：滚轮与工具栏按钮都是**乘性步进** `nextWheelScale`（×1.1/÷1.1，交互下限 25%），放大不设上限；`applyZoom` 以「鼠标点 / 视口几何中心」为不动点，按 `.canvas-area` 的实际 padding（44/28/32/44）校正 `scrollLeft/Top`。适应窗口按 canvas 同口径扣两侧 padding、纸张 mm→px 后再算 `computeFitScale`，可低到 5% |
| 网格背景、水印瓦片、设计背景底图 | ✅ | 水印走 core `resolveWatermarkLayout` |
| 视口固定标尺（canvas 绘制、DPR、刻度密度、纸张边界） | ✅ | `shell/ruler.ts`，刻度函数走 core `buildRulerTicks`；画布区尺寸变化（字体到位重排、面板折叠、宿主改宽）后由 `ResizeObserver` 重画，同 canvas |
| 参考线：从尺拖出、预览虚线、拖动、双击删除 | ✅ | 两处口径由 ops 第 13-15 步揭穿并修正：① **落点 mm 换算**必须与 canvas `Ruler.vue` 的 `(clientX - rulerRect.left - originPx)/pxPerMM` 等价，两项相消后即「相对纸张本体的像素距离 / (mmToPx(1)×paperScale)」，早期用 `.canvas-area` 左沿减 `originX` 漏掉尺宽与滚动量，同一屏幕点算出 79mm vs canvas 97mm；② 拖向 —— 从**横向尺**拖出的是**竖线**（位置取 x），拖动只能左右拖（脚本按 `g1` 的方向决定垂直于线的拖拽轴）。拖动量走 `pxToMm(delta/scale)`，`moveGuide` 夹到 `[0, 纸宽/高]` |
| 空白判定（决定「点哪里算空白 → 清空选中并起框选」） | ✅ | 与 canvas `CanvasArea.isCanvasBackground` 同口径的**白名单**：`.canvas-area` 本体 / `.canvas-scroll` / `.hiprint-printPaper` / `.hiprint-printPaper-content` / `.zone-layer` / `.grid-bg` / `.watermark-layer`。早期本包用黑名单（「不在 `.print-element`/`.tb-dd`/`.context-menu` 上」即算空白），结果点标尺、点参考线、点设计背景都会清空选中并起框选，而 canvas 不会 —— 参考线对拍步骤暴露 |
| 元素拖拽（只带动被点元素 + 同组元素）+ Alt 拖拽克隆 + 吸附引导线 | ✅ | `computeAdsorb`，同区吸附。**拖拽范围与 canvas 一致**：`BaseElement` 只拖自己 + 同 `groupId` 成员，Ctrl+A 全选后拖一个不会带动其它选中项（`store.dragIds()`，成对断言见 §〇 ops 第 7 步）。**Alt+拖拽克隆**（canvas `BaseElement.onDragEnd` 的 alt 分支 + `onCloneElement`）：按下即锁定 altKey，落点插入副本（新 id、`groupId` 置空、原元素留在原位不写坐标），选中收束到副本并记一条历史。拖拽视觉态与 canvas 逐项对齐：`.print-element.drag-ghost`（0.4 淡出）+ `.drag-preview`（虚线副本框）在 mousedown 即挂、mouseup 撤；吸附发生时在元素中心闪 `.snap-indicator`（300ms）；选中角标 `.position-label` 文本格式与 canvas 同串 `x:0 y:0 277×10mm`，且**拖拽期间不更新**（canvas 只用 transform 做视觉跟随、不写响应式坐标） |
| 格式刷激活态整壳标记 | ✅ | `.designer-container.format-painting`（画布区 cursor 由派生 CSS 变 `copy`），与 canvas `PrintDesigner` 同挂点；成对状态断言见 §〇 states M。**触发点与 canvas 的 `watch(selectedIds)` 对齐**：store 的选中集mutator（`select/selectOne/selectElement/selectAll/clearSelection/resetSelection`）统一走 `setSelection()` 并回调 `onSelectionChanged` → `painterSyncSelection()`，所以「单击目标元素」即刷、单击模式刷完自动摘掉 `.format-painting`。早期本包只在拖拽收尾时同步 → 单击目标根本不刷（ops 第 12 步揭穿，此前只有整壳类名断言所以一直绿）。双击锁定/Esc 退出与 canvas 同语义（单测 2 项） |
| 页签操作 tooltip、素材台长字段名 tooltip、表达式弹窗复制按钮 tooltip | ✅ | canvas 侧统一走 `useHoverTip`：事件委托 + 300ms 延迟渲染 `.pd-hover-tip`（fixed，不受页签列表、侧栏与表达式字段列表 overflow 裁剪），PageTabs、FieldTreePanel、ExpressionEditor 共用；本包同机制（监听挂 shadow root 才能拿到未重定向的 target，容器白名单 `HOVER_TIP_CONTAINERS` 现含 `.page-tabs`/`.field-tree-panel`/`.pd-dialog-overlay`——弹窗本就是 shadow root 里 `.designer-container` 的兄弟节点，只是白名单放行），文案/定位/夹取公式同串；复制按钮两态文案 `复制字段名「…」`/`已复制` 两侧同串、都不挂原生 `title`。工具栏与格式栏的 tip 两侧仍是 CSS `::after`，剥作用域后会在浮层容器上叠第二个气泡 → `scope-patches.css` 把 `.page-tabs`/`.field-tree-panel` 内的 `::after` 关掉；表达式弹窗不走 CSS 气泡（列表滚动会裁切），保持单一 JS 浮层机制 |
| 8 向缩放、锁定不可动、隐藏元素 | ✅ | |
| 框选、单击选中、Ctrl/⌘ 加选、Ctrl+A、右键菜单 | ✅ | 单击走组选（`selectElement` = canvas `selectElement` + `getGroupedIds`），增删选键两侧都是 **Ctrl/⌘ 而非 Shift**；右键只在「目标未被选中」时改选，避免 macOS 下 Ctrl+单击连带触发的 `contextmenu` 把多选打回单选。**菜单项点击先收起再派发**（canvas `emitAction` 先 `closeContextMenu()`）：早期本包只在 `fire()` 的 `paste-at`/`clear-selection` 两个分支里收起，复制/剪切/粘贴/删除/四向层级/全选点完菜单常驻，现统一到 `shell/canvas.ts` 的 `menuItem` 一处（点击即收起，置灰项只收起不派发，与 canvas `handlePaste` 的 `hasClipboard` 守卫同口径），见 `__tests__/context-menu.spec.ts` |
| 方向键微调（1mm / Shift 10mm / Ctrl 0.5mm） | ✅ | 与 canvas `useKeyboard` 同档位；跳过锁定元素、不做 0 钳制（可移出纸面）；300ms 内连按合并为一条历史（`MOVE_SESSION_GAP_MS` 同值） |
| 快捷键：Ctrl+Z/Shift+Z/Y/A/C/V/D/G/Shift+G、Delete/Backspace、Ctrl+1 复位 100%、Ctrl+0 适应窗口、Ctrl+L/R/E/T/B 五向对齐、Esc | ✅ | 与 canvas `useKeyboard` 逐项同映射（水平居中在 core 里叫 `vertical`），且只对本包处理过的组合键 `preventDefault`。**绑 document 而非宿主**：canvas 的 `useKeyboard` 就挂 document，早期本包挂宿主导致「点过工具栏按钮后焦点掉回 body，Ctrl+Z/Ctrl+1 全哑」；现按「最后交互的实例」接管（`PrintDesignerElement.active`），同页多实例仍互不抢键，见 §八.1 |
| 宿主字体 `@font-face` 双注入 | ✅ | `buildFontFaceCss` 同时写进 shadow root 与宿主文档 `head`：浏览器不从 shadow 作用域下载字体，只挂 shadow 会出现「computed font-family 正确但字形回落」的静默差异（成对截图才看得见） |
| 剪贴板与历史粒度 | ✅ | 粘贴偏移 **10mm 且不改动选中项**（canvas `paste()` 不 select，早期本包偏移 5mm 并选全副本）；组身份重映射：同组 ≥2 名成员一起粘贴才换新 `groupId`，只粘单个成员则剥离组身份；空选中 Ctrl+C 会清空剪贴板（canvas 的 `copy()` 无「有选中才复制」守卫）；Ctrl+D = 复用剪贴板 + 偏移 15mm 并选中副本；`loadTemplate` 只在装载后压一个检查点 → 「装载后第一次 Ctrl+Z 无可见变化」与 canvas 同序；ops 脚本第 9 步连撤 7 步必须回到基线签名 |
| 列宽拖拽手柄、行类型徽标 | ✅ | `.col-resize-layer` / `.row-badges`，`clampResizedColumnWidth` 同口径 |
| 表格单元格选区 / 双击编辑 / 右键菜单（插入删除行列、合并拆分、行类型） | ✅ | 矩阵算子全走 core（`mergeCells`/`insertRow`/`setRowType` 等） |

## 四、元素渲染（12 类）

| 元素 | 状态 | 说明 |
|---|---|---|
| text / longText | ✅ | 设计态显示 `testData \|\| formatter`，与 canvas `displayText` 同口径；`textFit` 三态 |
| hline / vline / rect / oval | ✅ | 线宽 pt、`borderStyle`、椭圆 50% 圆角 |
| barcode | ✅ | 条宽→模块→dpi 吸附→框内等比缩，全部复用 core；`shape-rendering: crispEdges`；设计态码值走 core `resolveBarcodeDesignValue`（见下「设计态码值」一行） |
| qrcode | ✅ | `browserCodeRenderer` 出同源 SVG `<img>` 铺满元素盒，与出纸同参数；设计态码值走 core `resolveBarcodeDesignValue`（见下「设计态码值」一行） |
| 设计态码值（barcode / qrcode，元素级 + 单元格级） | ✅ | 单一来源 core `resolveBarcodeDesignValue`：`{字段}` 按 demo 数据求值，求不到才回退 `testData`（单元格回退通用示例码值）。2026-10-28 前元素级两侧都是 `testData \|\| formatter`，而工厂给每个码元素预置了 `testData` 占位码值，属性台「内容」写的却是 `formatter`——占位值把作者内容永久遮住（改内容画布不动，Gitee PR #1 报告）；出纸路径本就是 `formatter ?? testData`，现设计态与出纸态同优先级 |
| image | ✅ | `{字段}` 表达式经 core `evaluateTemplate + DEFAULT_DEMO_DATA` 求值，与 canvas ImageElement 同口径 |
| table | ✅ | 矩阵渲染 + 选区 + 合并拆分 + 行类型 + 单元格内嵌码图/图片；`table-parity.mjs` 同脚本跑两侧 12/12 对拍通过 |
| html | ✅ | `evaluateTemplate` 后走 `dompurify` 消毒注入，与 canvas HtmlElement 同链路 |
| pageNumber | ✅ | 设计态显示 `options.title \|\| '{pageIndex}/{totalPages}'`，与 canvas PageNumberElement 一致 |
| 自动缩小（shrink）实测回写 | ✅ | `fitTextNode`（core/browser）实测遍挂在 `paint()` 末尾，元素级与单元格级共用；探针属性 `data-fit/base/min/mm` 与 canvas 同集合。`shrink-parity.mjs` 同脚本对拍：18pt 基准 → 两侧同为 16.19pt，切回截断均复原 18pt |

## 五、属性台

| 分组 | 状态 | 说明 |
|---|---|---|
| 位置与尺寸 X/Y/W/H | ✅ | `.position-grid` + 步进框；`stepper()` 与 canvas `StepperInput.vue` 同口径：小数位由 step 推导（0.5→1 位、0.25→2 位、1→0 位），显示与提交都按该精度取整（存量模板的 0.35 显示为 0.3），夹取到 [min,max]，值未变化不提交；**提交后一律把夹取/规范化结果写回输入框**（canvas 是 `draft.value = String(next)`）—— 早期本包只在值变化时重绘，越界输入被夹回原值后框里仍留着刚打的数字（如列数上限 1 时输入 6 显示 6） |
| 外观（字体、字号、粗细、对齐、垂直对齐、颜色/背景色、行高、字间距、文字溢出、最小字号、自动换行） | ✅ | 字段与顺序逐项对齐 `AppearanceGroup.vue`：`.color-row` 两色并列；「字体粗细」沿用 canvas 的 `v-model` 语义 —— 未设置时 `selectedIndex = -1`，下拉框留空而不是擅自显示「正常」（其余下拉两侧都显式给默认值）；「文字溢出」三选（截断 / 自动缩小 / 自适应行高）取值走 core `resolveElementTextFit`，选中 shrink 才出现「最小字号」；不支持外观的元素类型渲染 `当前元素不支持外观设置` 空态（canvas 同串），分组本身常驻不隐藏 |
| 码制设置（条码 / 二维码分支） | ✅ | 从 `CodeGroup.vue` 逐项移植：条码为码制（6 选项，选 CODE128 写 `undefined`）+ 打印机分辨率（203/300/600 及提示）+ 条宽（倍率）（2–8，步长 .5；填了打印机分辨率后，下方提示行追加推荐倍率与当前档折算，**只提示不回写 `barWidth`**，文案取自 core 的 `barcodeBarWidthRecommendText`）+ 静区 (模块)（0–20，占位「默认 10」＝一维码码制要求下限）+ 条高 (mm)（1–100，占位「默认 30 模块」，与元素台共用 `propertyTip('cd-bar-height')`）+ 显示文本 + 文本字号（5–24，占位「默认 10」）；二维码为纠错级别 + 静区 (模块)（0–8，占位「默认 0」＝码面铺满）；**两条静区都不走 `numField`**，它经 `orUndef` 会把 0 归成 `undefined`，而 0 恰是「不留白边」那一档（条码同理）；说明的单一来源是 core 的 `PROPERTY_REGISTRY`（`propertyTip('cd-bar-quiet-zone')` / `propertyTip('cd-quiet-zone')`），挂在标签后的 `button.pd-help` 上、悬浮或点击聚焦才浮出，不再常驻 `.pd-hint` 行；共用 `自定义设置` 分隔线 + 缩放模式（非条码）+ 最大宽/高（1–200）。码制统一大写归一化，存量小写模板下拉框不会空选。**两条静区行的显示形态已与 canvas 收口一致（2026-10-24）**：未设置时两侧都留空靠占位提示（本包此前回填缺省值 10/0），连带把「把缺省值原样再敲一次要不要落键」也统一成 canvas 判据——画布 `StepperInput` 比的是原始值，所以显式敲 10 会写键、清空则不写；本包 `controls.stepper` 同源同判据，导出 JSON 的键存在性两侧不再不同 |
| 图片缩放与裁剪锚点 | ✅ | 「缩放模式」档位表与「剪裁」文案唯一来源 core `IMAGE_FIT_OPTIONS`（值仍是 CSS 原值，只有 `cover` 的用户可见名改成「剪裁（等比铺满后裁边）」），canvas 三处下拉与本包两处下拉共用同一份，改名不再需要六处同步。「裁剪锚点」= canvas `CropAnchorField.vue` 与本包 `shell/crop-anchor.ts` 成对实现（容器类名：元素台用本包 `.pd-crop-anchor`（canvas 该处无包层，`.pd-field` 直接进分组）、单元格台用与 canvas `TableCellGroup.vue` 同名的 `.pd-cell-anchor`；内部同为 `.pd-field + .pd-crop-note + .pd-crop-preview`），行模型/中文口径全取 core `crop-anchor`（`cropPresetOptions`、`cropAxisFields`、`cropAxisNote`、`cropWindow`、`parseCropAnchor`、`buildCropAnchor`）：位置档下拉 + **放大比例 (%)** + **水平／垂直两框常驻** + 原图可视窗示意；余量由 core `resolveCropTravel` 按缩放模式**逐轴**结算（cover 挪溢出、contain／原始尺寸／缩小 挪框内空位、fill 两轴都 0，拿不到图片尺寸给 null 而不是 0），`cropAxisNote` 逐轴报数、`cropPresetOptions` 只给能动轴的档位（两轴都能挪才出九宫格）；取不到业务图地址时，示意回落 core `CROP_SAMPLE_IMAGE`（120×120 方形九宫格 + 四边异色 + 中心靶心）并由 `CROP_SAMPLE_NOTE` 说破「这是示例图」——它只进属性台，不进画布/出纸当占位；`50% 50%` 写回 `undefined` 而不是空串。元素台与单元格台的锚点行**都只在 `fit === 'cover'` 出**（只有等比铺满才裁得出多余的边；单元格侧另因只有 cover 钉盒，见下一行）；出纸端不设门禁（存量模板已存的值照旧落纸）。放大比例 `fitScale`（100~400，仅 cover 消费）与取位声明的单一来源是 core `render/crop-style.ts`（`cropScalePct` / `cropStyleDeclarations` / `sanitizeObjectPosition`，经 `/designer` 再导出）：本包 `imageStyle` 与 `table.ts` 的单元格 img 都直接展开该函数结果，`transform-origin` 复用同一条净化后的 `objectPosition`，与 canvas `ImageElement.vue`/`CellImage.vue`、出纸 `html-generator` 三端同源；行内挂点 `data-field="ap-img-fit-scale"`，说明与关键字登记在 `PROPERTY_REGISTRY` 同 key。本包 `sizeCache` 按 src 缓存自然尺寸——宿主每改一次属性就整台重绘，不缓存会每次重新 load 形成回环；`onError` 时删掉该 src 的条目并重绘（canvas 侧对应 `:key="preview.src"` + `@error` 清 `size`），两端都不许把上一张图的可挪量留在破图上。三处说明文案单一来源 core `PROPERTY_REGISTRY`（`ap-long-text-indent` / `ap-img-fit` / `ap-img-object-position`，已去掉 CSS 属性名），搜索门控 `gateItem` 同 key |
| 单元格图片锚点 | ✅ | **只在「剪裁」档钉盒**：判据单点存在 core `cellImageBoxMm(fit, capMm)`（与 `cellFitCapMm`/`cellFitWidthMm` 同族），出纸 `html-generator`、本包 `shell/table.ts` 与 canvas `CellImage.vue`（由 `TableElement.vue` 传 `boxHeightMm`）三端同源，不再各写一遍。给出 `fit:'cover'` 时外框钉在可用框高（所跨行高之和扣内边距与塌陷边框）、`<img>` 补 `width/height:100%`，于是 `object-fit`/`object-position` 与独立图片元素同构生效；其余档（缺省／contain／fill…）逐字保持存量形态——外框 `height:100%`、img 不撑满，td 高度仍由内容决定。**行为变更**：含图单元格的出纸行高不再被图片撑高（真 Chromium 实测：声明 12mm 的行改前被 90px 图撑到约 23.8mm，改后回到 12mm；取顶打出图顶端红带 229,50,45、取底打出底端蓝带 45,91,229，见 `services/print-render/src/cell-crop.integration.test.ts`），分页预算与连续纸纸高据此重算。独立图片一侧口径不变。属性台报的可挪量与可视窗同样按可用内容框算——canvas `TableCellGroup.cellBoxMm` 与 common `table-props.cellBox` 都取 core `cellFitCapMm`/`cellFitWidthMm`，不再用原始行列尺寸和（实测：50×10 格配 1mm 内边距、60×90 图报 65mm 是虚高，应为 64mm） |
| 属性台字段帮助气泡（`.pd-help`） | ✅ | canvas 顶部栏的裸 `[data-tip]::after` 派生后会命中属性台 `.pd-help::after`（气泡居中/不换行/层级降低），`scope-patches.css` 已按 native-controls 逐条还原；A/B 同探针实测两侧 `left/transform/padding/white-space/width/z-index` 全等，`top` 差 1px 源于 `.pd-label` 行高既有 ±1px |
| 内容（core 绑定注册表驱动） | ✅ | `shell/binding.ts` = canvas 的 `bindingDescriptors` + `BindingControl` + `ImageContentUpload` 等价实现：项与标签由 `getElementBindings` / `getTableCellBindings` 给出（表格有选区时只出选中单元格），写回走同一 `parsePath` 末段赋值；双击打开表达式编辑器。DOM 壳同 canvas：绑定行直接进 `.group-content`，不套 `form.pd-form`。canvas 属性台本就没有「元素名称」输入，故本包不再自造该字段 |
| 表达式编辑器（三处入口） | ✅ | `shell/expression-editor.ts`：画布双击元素/单元格、内容框双击、水印「编辑表达式」；写回路径统一用注册表的 `targetPath`（含 `options.tableRows[r].cells[c].formatter` 下标形），成对验收 12/12。字段页签每个字段行右侧有 `.ee-copy-btn`（canvas 同位置同图标 `lucide Copy/Check`）：单击复制字段中文名、1.2s 内变对勾，`click`/`dblclick` 都 `stopPropagation` 以免误触「双击插入字段」；tip 走 `data-tip`（复制后变「已复制」） |
| 边框与背景（线型 + 宽、色 + 预设/单边 + 背景色） | ✅ | 线型行挂 `bb-border-style`，`.border-row` 内「边框宽度 / 边框颜色」并列 + 独立「背景色」行；「全部 / 外侧 / 内部 / 无」四档预设与上、右、下、左单边只对 `acceptsElementBorder` 的类型出（rect/oval/hline/vline/table 用 border 画自身本体，写分边不出效果），「内部」对元素恒置灰、原因走常驻 `.pd-hint`。三行显示**当前生效规格**（方案 B）：整圈宽度生效取整圈，未设或已归零取可见分边的一致值，各边不一给「混合」占位（线型行一个禁用项「混合」、宽度框 placeholder「混合」）；勾选框判据是「这条边到底有没有线」（core `elementBorderEdgeVisible` / `elementVisibleBorders`，与出纸 `resolveElementBorder` 同源，整圈生效＝四边都有）。落盘统一走 core `setElementBorderField`（已有可见边框时任改一行都铺满四边并清分边——留着分边改整圈等于「改了没反应」；本来一条线都没有时只写那一键）、`setElementBorderEdgeVisible`（整圈生效时撤一边会把其余三边展开成分边、整圈宽度归零）、`applyElementBorderPreset` / `effectiveElementBorderSpec`，与格式工具栏同一口径，两宿主不再各写一份；提示文案单点存 core `ELEMENT_BORDER_APPLY_HINT`。线型下拉含「无」，选项与工具栏图标同源 core `BORDER_LINE_STYLES`：**无 ⇔ 没有边框**——选无即清框（宽度归零、分边清空、`borderStyle` 记 none），选任一非无线型则用缺省 `0.75pt` 开一条框；工具栏图标可全不选中（再点已选中的那一档即取消），取消态下预设＝清边框、单边＝撤边 |
| 高级（锁定、每页重复、层级、删除） | ✅ | 与 `AdvancedGroup.vue` 逐项一致：`.advanced-row` 内两个开关 + `层级` 步进（0–999）+ `.pd-button.danger` 删除；canvas 无「可见」开关（`options.visible` 只在 `PrintDesigner.onToggleVisible` 里被图层面板的 dead listener 引用），本包不再自造 |
| 流式列表分组与元素层 | ✅ | `shell/flow-list.ts` + 属性台内联「流式列表」分组：列数/行高/间距/跨列开关/最多跨几列五行逐项对齐 `FlowListGroup.vue`，**步进框显示的是 core `resolveFlow*` 解析出的出厂值**（手写/存量模板缺字段时显 4/8/4，不留空框，2026-10-24 对齐）；「最多跨几列」两侧都在开关打开时才出现、且都钳到每行列数（canvas 用 `v-show` 隐藏、本包用条件渲染，行为一致、DOM 存在性不同）；**打开开关才补写 `flowMaxSpan`，关掉不动它**（与 canvas `onAutoSpanChange` 同分支，本包早期关开关也会凭空落一个值）；「列数挤不下」的提示行两侧**逐字同串含句末句号**（只提示不写值）；分组键取 `flowList` 与 canvas 的 `group-key` 同串，折叠偏好才真走同一个 `property-group-flowList`（本包早期写作 `flow-list`，属静默分叉）。两侧都**不配「列表数据源」**——单元模板是一条完整表达式，列表源由 `detectFlowListKey` 从表达式检出（单元模板行由「内容」分组经 `binding-registry` 提供）。元素层 `.print-flowlist` / `.print-flow-cell` 类名与画布、出纸三处逐字一致，设计态都不预演跨列。**原记的两处未收口已在 2026-10-24 按「补 canvas」方向合上**：canvas `FlowListGroup.vue` 的列数/行高/间距/最多跨几列四行补上 `button.pd-help`（消费 core 注册表里那五条 `fl-*` tip，此前它们在本包是没人消费的死文案），跨列开关行两侧都不挂；canvas `LayerPanel.elementIconMap` 补 `flowList: '⊟'`（此前落到 `'?'` 兜底）。两侧现逐行同形同值，由 `flow-list.spec.ts` 与 canvas `FlowListGroup.spec.ts` / `LayerPanelIcon.spec.ts` 按同一张字面量表锁住 |
| 表格行 / 单元格 / 表格设置 / 分页 | ✅ | `shell/table-props.ts` 四分组：行类型/行高/表头重复、单元格类型与码制/样式/边框预设/合并拆分、列表数据源与默认字号色/列宽（超限提示同串）、分页开关组；分组顺序与 canvas 逐项一致。单元格边框的「改完线型/宽度/颜色要点预设或勾单边才落盘」说明常驻一行（非 `pd-help` 图标），文案单点存 core `CELL_BORDER_APPLY_HINT`，两侧同源不各写一份。上/右/下/左四条边的**按下态一律从选区派生**（全有＝勾选、部分＝半选、全无＝不勾；`h()` 的 `indeterminate` 走 DOM 属性通道），单边写入调 core `setCellBorderEdge` 只动那一条；三态判定单点 `resolveBorderEdgeStates` 与工具栏按钮共用，「线型 / 宽度 / 颜色」三行也改成填进选区当前的真实规格（core `resolveCellBorderDisplay`：一致逐字回显；**单格四边不一致的字段显示「混合」**——线型禁用项、宽度留空占位、颜色空块，未改项批写按缺省档；多选或没画过框回缺省档 0.75pt 实线 #333），用户改动只在本选区暂存（common 按 store 存 `{key, patch}`，换选区即作废、切回来也不复活，与 canvas 的 watch 归零同语义），仍是点预设/勾单边才落盘（2026-10-24 修复：此前两侧都只读本地草稿，既不回显、勾一边还会把其余三边写没）。线型下拉同样含「无」（core `BORDER_LINE_STYLES`）：选无后点预设＝清掉对应边、勾单边＝撤该边，不写一条“勾着却看不见线”的隐形 `none` 边；下拉改用 `plainSelect` 显式赋 `select.value`（只靠 `<option selected>` 在内核不一致时会落到第二项，`dotted`/`double` 也会显示成实线）。**单选回显 / 多选只批写**（2026-10-24 第二轮）：判据为选区可写格数（core `resolveCellGroupMode`，跳过 `merged` 占位格；跨行/跨列的合并格只有一个主格，仍算单选）——单选照常回显；多选时所有值控件留空并出「多选」占位（下拉用禁用哨兵 `__multi__`，与「不指定」等真实空值区分），单选/复选不选中、四边不再三态（只记本次点过的边），类型专属行仅在全部可写格同类型时出现（core `resolveSharedCellType`），边框三行落缺省档作批写源；本次批写的值存按选区隔离的草稿（key 含元素 id），换选区即清；重置按钮加 `force` 档（多选恒可点、不显示单格脏点、写 `undefined` 并清草稿）；多选时「内容」绑定组整组让位（它按 `r1,c1` 单格读写）。**单格四边都无边框时三行回显「无 / 0」**（选非无线型自动补 0.75，选无且本来无框归零）。写入链路与三条出纸不变 |
| 页面：纸张预设（分组下拉）、自定义宽高、方向、内容旋转、页面背景色 | ✅ | |
| 页面：设计背景（上传、旋转、移除） | ✅ | 上传走宿主 `uploadDesignBackground`（与 canvas 同契约）；未注入时入口禁用，不再回落本地 data URL |
| 页面：拼版（开关、目标纸、留白、间距、列数、校验与摘要） | ✅ | 数字与告警全部走 core 纯函数；`tiling-parity.mjs` 12 步对拍（含连续纸禁用态与非法拼版的保存拦截文案）。三处 canvas 专属语义已补齐：**打开开关即按纸面收敛列数** `patch({ ...TILE_DEFAULTS, columns: min(2, columnMax) })`（否则小目标纸一开就非法到保存都被拦）、**切 CUSTOM 只补空值**（`sheetCustomWidth ?? current.width`，保留用户已填的自定义目标纸尺寸）、**拼版启用时仍显示「内容旋转角度」**（canvas `!continuousPaper`；两宿主提示都切到每格口径「90°/270° 时每格占位宽高互换，列数与行数按互换后重算」）。拼版摘要两侧同串追加「每格 W×H mm」，格尺寸与列上限随旋转重算（core `computeTileLayout` 消费 `getOutputPaperDimensions`） |
| 页面：页边距、页眉/页脚高度、水印 | ✅ | 「页眉/页脚高度 (mm)」与 canvas 同串同值域：页眉高度 / 页脚高度（0–100，**步长 0.1**）。本包早期是自造的「页眉 / 页脚 (mm)」两字段网格（max 200、无叠加高度），由 `tiling-parity` 的可见页签字段清单断言揭穿。水印整段移植 `WatermarkConfig.vue`（`shell/watermark.ts`）：表达式/测试值/旋转/颜色/透明度/密度预设/自定义瓦片，落盘口径与 canvas 的 `onChange` 一致（表达式写 `binding`、静态文本写 `content`） |

## 六、宿主接口

| 通道 | 状态 | 说明 |
|---|---|---|
| `template` / `fields` property 与同名 attribute（JSON 或对象） | ✅ | |
| `getTemplateJson()` / `loadTemplate()` / `save()` | ✅ | |
| `save` / `preview` CustomEvent（bubbles + composed） | ✅ | |
| `dblclick-element` / `dblclick-cell` CustomEvent（bubbles + composed） | ✅ | 画布双击元素/单元格同时打开本包表达式编辑器（canvas `onDblClickElement`/`onDblClickCell` 同口径），宿主事件是旁路通知。**画布侧双击判定走 mousedown 双击检测**（`print-designer.isDoubleTap`，同目标 500ms/6px 内两击）：paint 是 `clear(shell)` 全量重建，第一击选中后旧节点被替换，Chrome 对「两击目标跨 detached/新节点」不再派发原生 dblclick（实测 30ms 间隔亦为空；canvas 侧 Vue 原地 patch 无此问题），所以 `elements.ts`/`table.ts` 画布节点**不挂** `onDblclick`，由判定器内部派发 `element-dblclick`/`table-cell-dblclick`；属性台输入框（内容分组、表格单元格、水印）不经选中重绘，仍用原生 `onDblclick`。两颗 `detail` 形态不同：前者为元素 id 字符串**本身**（与 canvas `@dblclick-element` 首参一致，不是 JSON 字符串，宿主**不要** `JSON.parse`）；后者为 `{ elementId, r, c, cellId }` 对象，画布单元格与属性台单元格输入框两条双击入口同形。回归覆盖 `__tests__/expression-dblclick.spec.ts`（9 项：弹出/预填/确定写回/取消不写回/锁定护栏/非白名单不弹/流式列表任意位置双击/单元格按下标写回/未选中表格跨重建双击只派 cell 事件；测试必须走两次 mousedown/up 的真实节奏，合成 dblclick 会假绿）。双击白名单 `DBL_EDITABLE_FIELD` 两侧逐项一致，已含 `flowList`（单元模板即 `options.formatter`，列表路径写在模板里） |
| 保存前校验：非法拼版弹提示并带到「页面属性」，多页模板走 core `normalizeTemplate` 归一化 | ✅ | 与 canvas `handleSave` 同口径，非法即阻断 |
| `validateTemplate()` | ✅ | 当前为拼版配置校验（canvas 同名方法亦仅此口径） |
| 选中元素即切到「元素属性」页签、清空即回「页面属性」 | ✅ | 对应 canvas 的 `selectedElement` watch |
| `isEdit` / `showHelp` | ✅ | attribute 口径 |
| `uploadImage` 注入（图片元素上传入口） | ✅ | 与 canvas 的 ImageContentUpload 同结构同文案：`.image-content-upload > label.pd-button.small.upload-label[.disabled] > svg.pd-icon + 文字 + input.visually-hidden`，另有 `.upload-tip`；未注入时置灰，四类提示（非图片 / 未配置 / 失败 / 抛错）逐字一致 |
| `uploadDesignBackground` 注入（设计背景上传） | ✅ | 同 canvas：未注入时入口 `.disabled`，提示文案「设计背景上传能力未配置」等逐字一致 |
| `fonts: PrintFontDeclaration[]`（property 或 `fonts` attribute 传 JSON） | ✅ | 与 canvas 同类型（2026-10-24 起连类型也收紧成 `readonly PrintFontDeclaration[]`，裸字符串族名两侧都不进候选）：① shadow root 内注入 `buildFontFaceCss(fonts)` 的 `@font-face`；② 字体下拉候选（含 `label` 展示名，候选整理调 core `normalizeFontCatalog`）；③ 保存 / 导出统一走 `templateJsonWithFonts()`，多页模板逐页写入 `fonts`；**四个宿主 demo 已演示**（2026-10-26 T-16：宿主把模板 `fonts` 交给元素，`verify-demo` 断言 3 条 `@font-face` 进文档、字体下拉 1 默认 + 3 候选） |
| 面板折叠持久化 | ✅ | 复用 canvas `useStudioChrome` 的 localStorage 键 `print-studio:left` / `print-studio:right`（值 `'1'/'0'`），同一浏览器里两侧设计器偏好互通 |
| `preview` 事件 | ✅ | canvas 无载荷；本包额外在 `detail` 放一份含字体声明的模板 JSON 字符串（载荷超集，宿主可忽略） |
| `PrintHtmlPreview`（canvas 的宿主侧打印预览组件） | ⬜ 不移植 | 它是 canvas 的**公开导出**（demo 的「打印输出」弹窗在用），不属于设计器界面；本包的预览口径是派发 `preview` 事件，宿主自行渲染。派生 CSS 里的 `.print-html-preview*` 规则因此在本包无挂点，属预期。**但四个宿主 demo 自复刻的预览层现已与它同形态**（2026-10-24）：档位条 `.print-html-preview-zoom{,-btn,.active,-hint,-note}`、默认落 100% 档（模板带 `printerDpi` 且当前不是点阵档时，条内追加 `core` 的 `viewZoomHint` 文案）、守卫样式 `html{zoom:N}@media print{html{zoom:1 !important}}` 全部到位，判据不在宿主各写一份而是共用 core 的 `designer/utils/preview-zoom`（`zoomPresets`/`resolvePrinterDpi`/`paperWidthPx`/`resolveZoomKey`/`zoomValueOf`/`applyPreviewViewZoom`）；直挂宿主从全局 `WormPrintCommon` 上取同一批函数（由 `src/browser-bundle.ts` 代挂）。五张页面实测同宽 203dpi：五档齐、默认 active=点阵 203dpi、iframe `zoom=2.11458`、切 100% 回到 1、print 复位规则在位、预览产物字节数一致（12716）。canvas 侧 `composables/usePreviewZoom.ts` 已删（无外部引用、未进公共导出），改由 `PrintHtmlPreview.vue` 直接引 core |
| 出纸与分页链路（core 单点） | ✅ | 本包不自研第二套分页/HTML 生成：预览与出纸一律走 core `/browser` 的 `renderHtmlPages`（UMD 直挂形态已内联），设计态表格的单元格钉盒判据同源 core `cellImageBoxMm`。所以 `pagination-engine` 的口径变更（如 Gitee #IKOUJI 的「按横向占用列记账」二维预算，替代原一维纵向累加导致的虚假换页与设计坐标丢失）与 `html-generator` 的出纸变更**不需要 common 侧同步改动**，重新构建即自动跟随；本包要跟着改的只有画布/属性台这两处 UI 侧实现 |

## 七、构建与体积

| 指标 | 值 |
|---|---|
| `dist/index.js` | 368.28 kB（gzip 106.68 kB） |
| `dist/index.cjs` | 292.22 kB（gzip 89.61 kB） |
| Vue 版 IIFE 封装（早期 spike 实测，验证件已删除，结论见 `docs/superpowers/spikes/2026-09-28-web-component-host/README.md`） | ≈178 kB gzip（含 Vue 运行时） |

> 数值取 vite 构建输出（1 kB = 1000 字节）；用 `stat`/`gzip -c` 按 KiB 复核会小约 2%，属单位差异不是体积变化。

零框架运行时：不打包 vue / lucide，样式与图标均从 canvas 构建产物派生。

## 八、与 canvas 的有意行为差异

以下 13 条是与 Vue3 版**功能等价但实现口径不同**的点，验收时按此判定，不算回归：

1. **快捷键的实例接管**：canvas 的 `useKeyboard` 绑在 `document`（页面任意处 Ctrl+Z 都生效）。本包也绑 `document`，但额外加一层「最后交互的实例」仲裁：宿主内 `pointerdown`/`focusin` 即接管，未有人接管时由最先连接的实例兜底，因此同页挂多个设计器不会互相抢键，而**焦点掉回 `body` 时快捷键仍然有效**（早期绑在宿主元素上，点过工具栏按钮后 Ctrl+Z/Ctrl+1 会整体失效 —— 由 ops 脚本揭穿）。判定「是否在为输入」用 `composedPath()[0]` 取 shadow 内真实 target（document 上拿到的 target 已被重定向成宿主）。
2. **文本输入的提交时机**：canvas 用 `@input` 实时提交；Common 的属性台文本框统一用 `change`（失焦或回车提交）。原因：无框架版每次 store 变更会整体重绘属性台，边打边提交会把光标顶回开头，无法连续输入。
3. **少数写回入口多一条历史**：canvas 直接改 `options.tablePagination/pagination`，不入撤销栈；Common 走 `updateElement`/`updateTemplateData` 必然记一条历史（改完可 Ctrl+Z）。终态与序列化结果两侧一致。
4. **表达式弹窗的层叠上下文**：弹窗渲染进 shadow root（`.designer-container` 的兄弟节点），保留 `position: fixed; z-index: 2000`。宿主页面若存在更高层叠元素、或祖先带 `transform/filter/contain`，需要宿主把遮罩改为 absolute 挂到自己 `position: relative` 的容器里（类名不变）。**浮层令牌对齐**：canvas 的弹窗渲染在 `.designer-container` 子树内（`ExpressionEditor.vue` 无 Teleport），能继承该容器 scoped 声明的 `--pd-*` 变量；本包浮层是其兄弟节点继承不到，早期整卡塌陷（底色透明/文字纯黑/页签无选中态，实测 24 个选择器 computed style 不一致）。现由 `gen-styles.mjs` 从 canvas CSS 提取同一 token 块在 `:host` 上再声明一次（同源零漂移），表达式弹窗 31 选择器 × 27 属性 computed style diff 归零；帮助弹窗同受其益。
5. **单元格表达式入口多一处**：canvas 只有纸面单元格双击；Common 在「单元格」分组的内容输入框上也挂了双击（同一编辑器、同一写回路径）。
6. **表达式写回后的撤销步数**：与 canvas 同序（先改后 `recordHistory`），因此 Ctrl+Z 第一次不产生可见变化、第二次才回到改动前 —— 这是两边一致的既有行为，不是 Common 独有偏差。
7. **`:host` 只给块级基线，不给排版**：canvas 的排版（字体族、字号、行高、颜色）从宿主页继承，各控件规则自带自己的字号；派生样式若给 `:host` 补 `font-size:13px/line-height:1.5/color`，会穿透到 `.print-element` 把长文本行高从 28px 压成 22px；若再补 `:host *{box-sizing:inherit}`，全局 border-box 会让 padding+border 少算一圈（右键菜单 144px 变 132px）。因此 `gen-styles.mjs` 的 `:host` 基线只保留 `display:block; width:100%; height:100%`，宿主想统一字号请在 `<print-designer>` 上设 `font-*`，会正常继承进 shadow。同一条继承链也解释了「面板总高差几像素」这类伪差异：`input[type=range]` 等行内级子元素会按**继承字体**撑出不同的行盒，色板面板在两个 demo 页里实测 268 vs 270px（两个 demo 的 `body` font-family 不同），逐子块高度则完全相同 —— 所以 `states.mjs` 对弹层比的是分区类名、预设格数与逐子块高度，不比总高。
8. **属性台滚动位置的保持**：canvas 的页签 pane 是 Vue 复用的 DOM，切换选中元素后仍停在原滚动位置；本包整体重绘会把 pane 滚回顶部。功能等价（内容完全一致），但成对截图必须先把两侧显式归位，`element-parity.mjs` 已内置（顶部一张 + 滚到底一张）。
9. **浮层不 Teleport 到 `document.body`**：canvas 的帮助弹窗、表达式弹窗、色板面板都 `<Teleport to="body">`；Common 一律挂在宿主元素的 shadow root 上（`.designer-container` 的兄弟节点，色板面板则挂在 `getRootNode()` 反查到的根）。原因：宿主样式/脚本不穿越 shadow，挂到 body 会被宿主 CSS 污染且拿不到本包派生样式表；同时天然支持同页多实例。层叠上下文与宿主页面更高层元素的处理见第 4 条。
10. **弹窗无进出场过渡**：canvas 有 `<Transition name="help-modal">` 的 0.2s 淡入淡出，Common 直接按 DOM 增删（外壳是整体重绘模型，过渡帧会被重绘打断）。视觉终态一致，仅少动画。
11. **属性台/页签的收起语义对齐 canvas 的 `v-show`**：canvas 收起的分组与非活跃页签节点常驻 DOM（只 `display:none`），Common 早期是「不建节点」，会让「DOM 里有几项」这类断言两侧对不上；现也改为节点常驻 + `display` 切换，但**过滤字段/输入联想**这类瞬时状态仍只做定点更新、不整体重绘（对应第 2 条）。分组展开态与面板折叠态都复用 canvas 的 localStorage 键（`property-group-<key>`、`print-studio:left|right`），同一浏览器两侧偏好互通。
12. **Ctrl+X 剪切**：canvas 的剪切只有工具栏按钮（`useKeyboard` 未接 `onCut`），本包额外把 Ctrl/⌘+X 也接到同一条 `cutSelected()`。属于「多做一步」，不影响其它键位。
13. **拖拽中同组成员即时跟随**：canvas 的 `BaseElement` 拖拽期间只给自己加 `transform`，同组兄弟在 mouseup 才一次性跳到新坐标；本包的 live 层让同组成员即时跟随。落点结果与历史记录完全一致（ops 逐步对拍通过），仅拖拽过程中的中间帧不同（本包无 150ms 过渡动画，见第 10 条）。
