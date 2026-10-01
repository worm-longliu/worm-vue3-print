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
| 逻辑单测 | `npm run test -w @worm-vue3-print/common` | 98 项（7 个 spec）：三区摊平与序列化往返、默认页名与重排、拼版闸门、对齐、层级、撤销重做、参考线、粘贴偏移与组 id 重映射、Ctrl+D 复制、方向键微移会话、落点归区与类型拒绝、拖拽结束归区、Alt 拖拽克隆、格式刷（选中集变化即刷 / 双击锁定 + Esc 退出）、混选 MIXED、字体只落文本元素、加粗回落、表格矩阵 9 项、取色器 15 项、字体下拉 13 项、帮助弹窗 14 项、属性台搜索门控 14 项、拖拽视觉态与步进/下拉细节 9 项 |
| 类名覆盖率审计 | `node demo-common/scripts/class-audit.mjs` | 把 canvas 50 个组件模板里出现的类名逐个回查本包源码：「派生 CSS 有该规则 + 本包源码无挂点」= 掉样式或缺功能 |
| 派生 CSS 泄漏审计 | `node demo-common/scripts/style-scope-audit.mjs` | 列两类嫌疑（纯泄漏：类只在一个组件 scoped 定义却被别处用；多组件同名声明不同），裁决须两侧实测 computed style |
| 宿主样式同源 | `npm run styles:demo-common` | `demo-common/scripts/sync-demo-styles.mjs` 从 `demo/src/App.vue` + 三个弹窗 + `SampleThumb` + 本仓 `PrintHtmlPreview` 逐字抽取 style，合成四个宿主工程同 MD5 的 `src/styles/demo-ui.css`；四个子 demo 的宿主版式因此与 Vue3 版 demo **完全一致**（工程内不再写私有布局样式） |
| 宿主示例库同源 | `npm run samples:demo-common` | `demo-common/scripts/sync-demo-samples.mjs` 在生成期求值 `demo/src/samples`（canvas 运行时别名到 `core/designer`、`BASE_URL` 固定为站点根、缺省 `batchData` 按 demo 的 `deriveBatchData` 展开成字面量），合成四个宿主工程同 MD5 的 `src/templates.js`（10 个示例），并把示例引用的 `demo/public/{images,fonts}` 资源拷进各宿主 `public/`（字体不入库）；四个子 demo 的示例库因此与 Vue3 版 demo **完全一致**（工程内不再手写第二份模板数据） |
| 宿主集成验收 | `node demo-common/scripts/verify-demo.mjs <url>` | 34 项 UI 级断言，四个宿主 demo（9331/9332/9335/9334）跑同一套、全部按 demo 类名判定：顶栏 6 个动作与徽章口径、顶栏「宿主示例」下拉两态（收起态五个工程入口含 demo 的 9303 且只标当前宿主；展开态菜单挂在顶栏下方并被 18 个采样点命中测试确认未被画布原子层遮挡）、画布真的撑满 `.demo-container`（防「DOM 全绿但布局塌陷」）、宿主侧栏已删除、示例库卡片与等比缩略图、页签筛选与应用、全屏预览层出纸（纸面数/文本/码值节点）与批量份数、自定义 JSON 非法拦截与应用生效、打印输出弹窗两条链路状态与离线置灰、导出模板真的下载、console 洁净 |

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
样式来源同一（`scripts/gen-styles.mjs` 从 canvas 构建 CSS 剥离 `[data-v-*]` 派生，500 条规则 / 61.5 kB，末尾追加手写泄漏修正层 `styles/scope-patches.css`），
`:host` 基线只补块级尺寸（见 §八 第 7 条）。

## 二、外壳与编排

| 能力 | 状态 | 说明 |
|---|---|---|
| 工具栏分组顺序（文件标识 / 撤销重做 / 格式区段 / 排列 / 视图 / 缩放 / 剪贴板 / 帮助 / 预览保存） | ✅ | lucide 图标由 `scripts/gen-icons.mjs` 从 canvas 的导入清单派生，35 个同名图标 |
| 排列下拉：对齐 8 + 层级 4 + 组合 2，无选中常驻置灰 | ✅ | `data-tip` 全量覆盖（含禁用原因） |
| 视图下拉：标尺/网格/虚框/吸附 | ✅ | 2.0.0 起不再有「首页专属」与「叠层对比」 |
| 格式刷：单击刷一次、双击连续刷、Esc 退出 | ✅ | `core/format.ts`（移植自 `useFormatToolbar` + `useFormatPainter`） |
| 字体 / 字号 / 粗 / 下划线 / 删除线 / 字色 / 底色 / 对齐 / 边框面板 | ✅ | 混选占位、单元格上下文、hline/vline 只吃边框等口径照抄 |
| 颜色选择 | ✅ | `shell/color-picker.ts` 整段移植 `PresetColorPicker.vue`：`.preset-color-trigger` + `.preset-color-panel`（`.picker-preview` / `.picker-current` / `.picker-hex` / `.picker-area` + `.picker-handle` / `.picker-hue` / `.picker-heading` / `.picker-clear` / `.preset-color-grid` 逐项同结构同类名），单测 15 项覆盖 hex↔hsv 往返、非法输入不回写、清除/收起/Esc/外部点击与重绘保活 |
| 字体候选列表 | ✅ | `shell/font-select.ts` + `core/font-catalog.ts` 移植 `FontSelect.vue` / `useFontCatalog` 纯函数（族名大小写不敏感去重、保留声明顺序、相等>前缀>子串>子序列分档模糊匹配）；候选来自宿主 `designer.fonts` 注入，未注入时仍可自由输入并保留「清除 / 自定义」行 |
| 页签：新增/复制/删除/重命名/前移后移、拼版模板拦截 | ✅ | 拦截文案与 canvas 同串 |
| 多页导出格式与新增页继承 | ✅ | `getTemplateJson()` 与 canvas 同口径：单页直接导出该页对象，多页导出 `{ version: 1, pages: [...] }` 外层包装（早期本包直接吐数组，宿主拿到的是非法模板）。`addPage()` **继承当前激活页的纸张尺寸与方向**（`paperSize/orientation/customWidth/customHeight`）并用 `nextDefaultPageName()` 取不重复的默认页名 —— 早期本包塞的是竖版 A4 默认页，在横版模板里新增一页后「保存」会被拼版闸门拦住（`多页面模板各页纸张尺寸必须一致（第 2 页「页面 2」 210×297mm 与首页 297×210mm 不同）`） |
| 素材台：元素 11 类 / 字段树（分组、搜索、折叠、拖拽）/ 图层（选中、层级、组合） | ✅ | 字段分组走 core `groupFields` |
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
| 页签操作 tooltip | ✅ | canvas 的 PageTabs 用事件委托 + 300ms 延迟渲染 `.page-tabs-tip`（fixed，不受页签列表 overflow 裁剪）；本包同机制（监听挂 shadow root 才能拿到未重定向的 target），文案/定位/夹取公式同串，工具栏与格式栏的 tip 两侧都是 CSS `::after` |
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
| barcode | ✅ | 条宽→模块→dpi 吸附→框内等比缩，全部复用 core；`shape-rendering: crispEdges` |
| qrcode | ✅ | `toDataURL` 出 `<img>`，与出图端同参数 |
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
| 码制设置（条码 / 二维码分支） | ✅ | 从 `CodeGroup.vue` 逐项移植：条码为码制（6 选项，选 CODE128 写 `undefined`）+ 打印机分辨率（203/300/600 及提示）+ 条宽（倍率）（2–4，步长 .5）+ 显示文本 + 文本字号（5–24，占位「默认 10」）；二维码为纠错级别；共用 `自定义设置` 分隔线 + 缩放模式（非条码）+ 最大宽/高（1–200）。码制统一大写归一化，存量小写模板下拉框不会空选 |
| 内容（core 绑定注册表驱动） | ✅ | `shell/binding.ts` = canvas 的 `bindingDescriptors` + `BindingControl` + `ImageContentUpload` 等价实现：项与标签由 `getElementBindings` / `getTableCellBindings` 给出（表格有选区时只出选中单元格），写回走同一 `parsePath` 末段赋值；双击打开表达式编辑器。DOM 壳同 canvas：绑定行直接进 `.group-content`，不套 `form.pd-form`。canvas 属性台本就没有「元素名称」输入，故本包不再自造该字段 |
| 表达式编辑器（三处入口） | ✅ | `shell/expression-editor.ts`：画布双击元素/单元格、内容框双击、水印「编辑表达式」；写回路径统一用注册表的 `targetPath`（含 `options.tableRows[r].cells[c].formatter` 下标形），成对验收 12/12 |
| 边框与背景（宽、色 + 背景色） | ✅ | `.border-row` 内「边框宽度 / 边框颜色」并列 + 独立「背景色」行；canvas 该分组本就没有「线型」下拉（`borderStyle` 只由表格单元格边框预设写入），本包不再自造 |
| 高级（锁定、每页重复、层级、删除） | ✅ | 与 `AdvancedGroup.vue` 逐项一致：`.advanced-row` 内两个开关 + `层级` 步进（0–999）+ `.pd-button.danger` 删除；canvas 无「可见」开关（`options.visible` 只在 `PrintDesigner.onToggleVisible` 里被图层面板的 dead listener 引用），本包不再自造 |
| 表格行 / 单元格 / 表格设置 / 分页 | ✅ | `shell/table-props.ts` 四分组：行类型/行高/表头重复、单元格类型与码制/样式/边框预设/合并拆分、列表数据源与默认字号色/列宽（超限提示同串）、分页开关组；分组顺序与 canvas 逐项一致 |
| 页面：纸张预设（分组下拉）、自定义宽高、方向、内容旋转、页面背景色 | ✅ | |
| 页面：设计背景（上传、旋转、移除） | ✅ | 上传走宿主 `uploadDesignBackground`（与 canvas 同契约）；未注入时入口禁用，不再回落本地 data URL |
| 页面：拼版（开关、目标纸、留白、间距、列数、校验与摘要） | ✅ | 数字与告警全部走 core 纯函数；`tiling-parity.mjs` 12 步对拍（含连续纸禁用态与非法拼版的保存拦截文案）。三处 canvas 专属语义已补齐：**打开开关即按纸面收敛列数** `patch({ ...TILE_DEFAULTS, columns: min(2, columnMax) })`（否则小目标纸一开就非法到保存都被拦）、**切 CUSTOM 只补空值**（`sheetCustomWidth ?? current.width`，保留用户已填的自定义目标纸尺寸）、**拼版启用时隐藏「内容旋转角度」**（canvas `!continuousPaper && !tilingEnabled`） |
| 页面：页边距、三区高度、水印 | ✅ | 「页眉/页脚高度 (mm)」与 canvas 同串同值域：页眉高度 / 页脚高度（0–100，**步长 0.1**）。本包早期是自造的「页眉 / 页脚 (mm)」两字段网格（max 200、无叠加高度），由 `tiling-parity` 的可见页签字段清单断言揭穿。水印整段移植 `WatermarkConfig.vue`（`shell/watermark.ts`）：表达式/测试值/旋转/颜色/透明度/密度预设/自定义瓦片，落盘口径与 canvas 的 `onChange` 一致（表达式写 `binding`、静态文本写 `content`） |

## 六、宿主接口

| 通道 | 状态 | 说明 |
|---|---|---|
| `template` / `fields` property 与同名 attribute（JSON 或对象） | ✅ | |
| `getTemplateJson()` / `loadTemplate()` / `save()` | ✅ | |
| `save` / `preview` CustomEvent（bubbles + composed） | ✅ | |
| `dblclick-element` / `dblclick-cell` CustomEvent（bubbles + composed） | ✅ | 画布双击元素/单元格同时打开本包表达式编辑器（canvas `onDblClickElement`/`onDblClickCell` 同口径），宿主事件是旁路通知。**画布侧双击判定走 mousedown 双击检测**（`print-designer.isDoubleTap`，同目标 500ms/6px 内两击）：paint 是 `clear(shell)` 全量重建，第一击选中后旧节点被替换，Chrome 对「两击目标跨 detached/新节点」不再派发原生 dblclick（实测 30ms 间隔亦为空；canvas 侧 Vue 原地 patch 无此问题），所以 `elements.ts`/`table.ts` 画布节点**不挂** `onDblclick`，由判定器内部派发 `element-dblclick`/`table-cell-dblclick`；属性台输入框（内容分组、表格单元格、水印）不经选中重绘，仍用原生 `onDblclick`。两颗 `detail` 形态不同：前者为元素 id 字符串**本身**（与 canvas `@dblclick-element` 首参一致，不是 JSON 字符串，宿主**不要** `JSON.parse`）；后者为 `{ elementId, r, c, cellId }` 对象，画布单元格与属性台单元格输入框两条双击入口同形。回归覆盖 `__tests__/expression-dblclick.spec.ts`（8 项：弹出/预填/确定写回/取消不写回/锁定护栏/非白名单不弹/单元格按下标写回/未选中表格跨重建双击只派 cell 事件；测试必须走两次 mousedown/up 的真实节奏，合成 dblclick 会假绿） |
| 保存前校验：非法拼版弹提示并带到「页面属性」，多页模板走 core `normalizeTemplate` 归一化 | ✅ | 与 canvas `handleSave` 同口径，非法即阻断 |
| `validateTemplate()` | ✅ | 当前为拼版配置校验（canvas 同名方法亦仅此口径） |
| 选中元素即切到「元素属性」页签、清空即回「页面属性」 | ✅ | 对应 canvas 的 `selectedElement` watch |
| `isEdit` / `showHelp` | ✅ | attribute 口径 |
| `uploadImage` 注入（图片元素上传入口） | ✅ | 与 canvas 的 ImageContentUpload 同结构同文案：`.image-content-upload > label.pd-button.small.upload-label[.disabled] > svg.pd-icon + 文字 + input.visually-hidden`，另有 `.upload-tip`；未注入时置灰，四类提示（非图片 / 未配置 / 失败 / 抛错）逐字一致 |
| `uploadDesignBackground` 注入（设计背景上传） | ✅ | 同 canvas：未注入时入口 `.disabled`，提示文案「设计背景上传能力未配置」等逐字一致 |
| `fonts: PrintFontDeclaration[]`（property 或 `fonts` attribute 传 JSON） | ✅ | 与 canvas 同类型：① shadow root 内注入 `buildFontFaceCss(fonts)` 的 `@font-face`；② 字体下拉候选（含 `label` 展示名）；③ 保存 / 导出统一走 `templateJsonWithFonts()`，多页模板逐页写入 `fonts` |
| 面板折叠持久化 | ✅ | 复用 canvas `useStudioChrome` 的 localStorage 键 `print-studio:left` / `print-studio:right`（值 `'1'/'0'`），同一浏览器里两侧设计器偏好互通 |
| `preview` 事件 | ✅ | canvas 无载荷；本包额外在 `detail` 放一份含字体声明的模板 JSON 字符串（载荷超集，宿主可忽略） |
| `PrintHtmlPreview`（canvas 的宿主侧打印预览组件） | ⬜ 不移植 | 它是 canvas 的**公开导出**（demo 的「打印输出」弹窗在用），不属于设计器界面；本包的预览口径是派发 `preview` 事件，宿主自行渲染。派生 CSS 里的 `.print-html-preview*` 规则因此在本包无挂点，属预期 |

## 七、构建与体积

| 指标 | 值 |
|---|---|
| `dist/index.js` | 348.14 kB（gzip 99.99 kB） |
| `dist/index.cjs` | 275.20 kB（gzip 84.08 kB） |
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
