# 更新日志 (Changelog)

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [1.3.2] - 2026-09-26

### 新增

- demo：新增**「分页极限测试」多页示例**（组合 + 表格的极端版式，用于复现与验证换页后的元素放置），纳入示例库；`SampleThumb` 缩略图兼容多页模板 wrapper。

### 变更

- `@worm-vue3-print/canvas`：设计台图标全面换为 **lucide 按需引入**（工具栏 / 图层面板共 17 个图标，统一补齐 tooltip），组合 / 取消组合改用 `Group` / `Ungroup` 专属图标。
- `@worm-vue3-print/canvas`：**组合与多选交互口径修正**：① 取消组合入口在任一选中元素属于组时即显示（旧「单选才显示」对整组多选是死分支）；② 元素拖拽起点不再重复发送 select，Ctrl/⌘ 逐个加选生效，画布与图层面板均可多选；③ 图层面板底部新增独立一行的组合 / 取消组合按钮，支持 Ctrl/⌘ 加选；④ 画布右键菜单移除此前并不生效的「编组/取消编组」入口，组合入口统一为：工具栏按钮、图层面板底部按钮、快捷键 `Ctrl+G` / `Ctrl+Shift+G`；⑤ 帮助文档补充框选规则（从空白区起拖：左上→右下=相交命中、右下→左上=完全包围命中）、组合强制同页与超高裁切警示，用户可见文案统一为「组合 / 取消组合」。

### 修复

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：**表格下方跟随元素的打印间距被拉大**。表格设计底部（`tableDesignBottom`）旧口径只取 `tableRows` 行高之和（min-height 语义），忽略设计器实测回写的 `options.height`——当行内容把表格撑高时，跟随偏移多算出「实测高 − 行高和」的虚假间距（实测模板最大达 3.77mm）。现改为 `top + max(options.height, Σ行高)`：以画布视觉底部为基准，行高之和保留为物理下界，避免脏数据把跟随元素反向叠压表格。**行为变更**：存量模板中「行内容把表格撑高」的模板，表下跟随元素的出纸间距会收回到与设计台所见一致；在设计器保存过的模板属纯修复，三端（浏览器预览 / 服务端 PDF / 桌面客户端）同源生效。
- `@worm-vue3-print/core`：**分页换页后区块一律锚 0，导致末页组合元素叠压表格**。换页后表格续片、组合、普通元素原本都从新页顶部 0 开始放置，应顺排的元素互相叠在一起。现改为流式光标（`pageCursorTop`）顺排放置，且表格切片起点在行组扣预算前提前捕获，保证跨页续片后跟随元素正确接排；并补充分页引擎极限回归测试（组合整组不拆分、多区块叠页场景）。
- demo：移除对 `@worm-vue3-print/canvas/native-controls.css` 的错误全局引入（该样式文件已不存在）。

### 维护

- `@worm-vue3-print/canvas`：修复测试间歇性 `localStorage` 未定义——新增全局 vitest setup 兜底。
- 仓库脚本：根 `package.json` 清理对已删除工作区 `@worm-vue3-print/client` 的残留引用。
- 文档：补充 Electron 客户端依赖 core **dist 子路径**（`@worm-vue3-print/core/client`）的构建约定——新增或改动 core 子入口后必须重建 core 的 dist。

## [1.3.1] - 2026-09-21

### 新增

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：表达式**数值运算与修约**。
  ① 四则函数：`ADD(a,b,…)`、`SUB(a,b,…)`、`MUL(a,b,…)`、`DIV(a,b)`，与运算符 `+ - * / %` 共用同一套数值语义，不便写运算符的场景可直接调函数。
  ② 修约函数：`ROUND(n,d)` 四舍五入、`ROUNDUP` / `CEIL` 进一法（远离零）、`ROUNDDOWN` / `FLOOR` 去尾法（朝零）、`ROUNDBANK` 四舍六入五成双（GB/T 8170）；`d` 缺省 2，传负数修约到整十 / 整百（`-2` → 百位）。修约按十进制字符串精确判定，不存在 `toFixed` 的浮点舍入陷阱，`ROUND` 与 `ROUNDBANK` 只在「恰好一半」时不同（前者进位、后者凑偶）。
  ③ 运算符补齐数值语义：字符串数字按数值参与运算、消除二进制浮点噪声、除零与空值兜底。详见下条「变更」。
  ④ 设计器表达式编辑器「函数」页新增「数值运算」分组，四则与修约函数可双击插入；帮助面板内置函数表同步补充。
- `@worm-vue3-print/core`：新增底层数值模块（`numeric.ts`），函数与运算符共用；主入口导出 `addNumbers` / `subtractNumbers` / `multiplyNumbers` / `divideNumbers` / `round` / `roundUp` / `roundDown` / `roundHalfEven`，宿主自有逻辑可复用。
- demo：新增**综合示例模板**（A4 横向、多级表头、表格单元格内图片 / 条形码 / 二维码混排），纳入示例库与 `print-template-json` 技能资源；顶栏「加载默认布局」改为「加载示例」，进入页面即自动载入该模板。
- demo：新增**「自定义字段与数据」弹窗**——直接在页面上增删打印数据字段、编辑多份打印数据，批量打印同步适配。
- demo：支持**静态托管在线预览**——新增 `edgeone.json`（EdgeOne Pages）与 `.github/workflows/pages.yml`（GitHub Pages，推送 master 自动构建部署，预览地址见 README）；字体基址与示例图片路径改用 `import.meta.env.BASE_URL` 与当前站点 origin，去掉 localhost 硬编码，适配子路径部署。

### 变更

- **静默打印浏览器端 SDK 并入 core，不再单独发布**：原独立包 `@worm-vue3-print/client`（`0.1.0`，从未发布到 npm）迁移为 `@worm-vue3-print/core` 的子路径导出 `@worm-vue3-print/core/client`，导入方式由 `import { PrintClient } from '@worm-vue3-print/client'` 改为 `from '@worm-vue3-print/core/client'`。SDK 零运行时依赖（仅用浏览器 WebSocket），core 不新增依赖；`PrintClient`、`WsTransport`、`WormPrintError`、`MESSAGE_TYPES` 等全部导出符号与能力保持不变。`packages/print-client-sdk` 目录删除；桌面客户端（Electron）内部引用同步改走 core。
- `@worm-vue3-print/core`：**行为变更** 算术运算符（四则与一元正负号）改为数值语义，存量模板在以下场景结果会变（都是朝「符合直觉」的方向修）：
  ① 两侧都是数字或数字字符串时按数值运算——`'3' + 4` 由 `'34'` 变为 `7`，`{qty + price}` 不再拼出 `312.5`；
  ② 消除二进制浮点噪声——`0.1 + 0.2` 由 `0.30000000000000004` 变为 `0.3`，`12.5 * 3 * 1.13` 由 `42.37499999999999` 变为 `42.375`；
  ③ 除数为 0 或无法解析为数字时返回 `0`，不再输出 `Infinity` / `NaN`；`null` / 空串参与算术按 0、拼接时按空串（此前拼接会印出 `null`）；
  ④ 任一侧不是数字时 `+` 仍保持字符串拼接（`name + '有限公司'` 行为不变）。
- demo：打印预览弹框改为**全屏**（内容区占满视口），移除「点击空白处关闭」，新增 Esc 关闭。

### 修复

- `ROUND(n, d)` 此前由 `Number.toFixed` 实现，存在浮点舍入错误：`ROUND(1.005, 2)` 得到 `1`（应为 `1.01`）、`ROUND(2.675, 2)` 得到 `2.67`（应为 `2.68`）。现按十进制精确修约。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：系统变量**无法在表达式内参与运算或函数调用**——`{pageIndex + 1}`、`{ADD(pageIndex,1)}`、`{DATE(printDate,'YYYY')}` 求值失败后会被当作原文印出（模板求值失败的降级行为），只有「整个花括号就是一个变量」的 `{pageIndex}` 能出结果（靠出图后的文本替换）。原因是绑定阶段的表达式上下文里只有业务数据，不含系统变量，而页码要等分页后才有值。现改为：① `printDate` / `printTime` 在数据绑定时并入上下文（业务数据同名时优先）；② 引用 `pageIndex` / `totalPages` 的表达式在绑定阶段保留原始表达式（测量趟按原始文本测量），最终渲染时按所在页页码重新求值——元素、页眉/页脚、首页叠加与表格单元格四者一致，三端（浏览器预览 / 服务端 PDF / 桌面客户端）同源。**存量模板产物不变**：无 rawFormatter 的模板走快速路径，不做任何重算。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：**多级表头分页续片会丢掉下面几级表头**。多级表头的各行由 `rowspan` / `colspan` 连成一个结构整体，而「每页重复」此前按行独立判定——只勾选首行时，续片只重复首行，第二级及以后的表头整段丢失，首行的跨行主格还会越界吃掉数据行的位置。现改为：① 表头区（第 0 行起的连续标题行）内任一行勾选即**整个表头区**重复；② 重复行数按 `rowspan` 完整性对齐到最近的闭合边界，跨出表头区的主格在续片渲染时裁剪到边界内，不再越界吞格；③ 插入标题行、把行改为标题行时自动继承相邻标题行的重复设置，避免漏勾；④ 属性面板开关更名为「表头每页重复」，作用于整个表头区。单行表头行为不变，存量单行表头模板产物逐字一致。

## [1.3.0] - 2026-09-20

- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**多页面模板**——一份文书由多篇**版式不同**的页面按固定顺序组成，全部绑定**同一份数据**（如「封面 + 正文 + 条款」）。此前一份模板只能描述单页版式，多页只能来自内容溢出切片或同模板多份拼接，无法在同一份文档里组合不同版式。
  ① 数据模型：新增 wrapper 类型 `MultiPageTemplateData`（`{ version?: 1, pages: TemplateData[] }`），`RenderRequest.templateJson` 与 `PrintJob.templateJson` 放宽为 `TemplateData | MultiPageTemplateData`；`TemplateData` 新增可选 `name`（页面名，页签显示与错误上下文用，渲染端忽略）。
  ② 新增 `print/multi-template.ts`（主出口导出）：`normalizeTemplate`（归一化 + 统一校验）、`isMultiPageTemplate`、`mergeFontDeclarations`（各页声明的字体按族名去重合并）、`composeMultiPageDocument`（多页面拼接为单文档）。
  ③ 渲染语义：每个页面模板**各自独立跑一遍完整的「绑定 → 测量 → 分页」**，共用同一份数据；「下一模板必须新开一页」由各自产出的整页 `.print-page` 天然保证，无需额外分页指令；页码 `{pageIndex}` / `{totalPages}` 在**份内全局连续**（按前序模板页数累计 `pageOffset`）；`firstPageOverlay` 的生效条件由「文档第 1 页」改为「**各模板自身的首页**」（单模板时两者等价，行为不变）；`pageCount` 为份内全部模板页数之和，整份文档**一次出图**（单次 `page.pdf()`）。
  ④ CSS 随之作用域化拆分为 `buildBasePageCss()`（模板无关部分）+ `buildPageGeometryCss(template, '.mt-N')`（各页几何）；**单模板产物与旧版逐字一致**，由护栏测试锁死，存量模板零迁移。
  ⑤ 三条硬校验由 `normalizeTemplate` 统一抛出，设计器保存/预览、render 服务共用：至少 1 页；各页纸张尺寸（含方向）必须一致；**不支持连续纸与标签拼版**（二者与「必须新开一页」语义冲突）。错误信息带页面名，如 `多页面模板不支持标签拼版（第 2 页「条款」）`。
- `@worm-vue3-print/canvas`：多页面设计能力。新增**页面栏**（`PageTabs`），支持新增、复制、删除、前移/后移、**双击重命名**、点击切换，操作按钮带上下文悬浮提示；删到只剩一页时自动回落单模板模式。纸张设置（纸型/方向/自定义尺寸）绑定当前页但**改一次即写入所有页**（多页面要求纸张一致，UI 只暴露一份纸张设置），页边距、页眉页脚、首页叠加、水印与内容元素则按页各自独立；多页模式下隐藏拼版配置、禁用连续纸纸型（与渲染端校验互为双保险）；`getTemplateJson()` 单页输出裸 `TemplateData`、≥2 页输出 wrapper，`initialTemplate` prop 放宽为联合类型并在载入时归一化；保存/预览前用 core 的 `normalizeTemplate` 同款校验，错误在 UI 内直接提示。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**页面内容旋转角度**（`TemplateData.outputRotation`，取值 `0 / 90 / 180 / 270`，属性面板「内容旋转角度」，缺省 `0`）——解决「横版设计、竖版出纸」：90/270 时出纸纸张宽高互换（`PreparedDocument.paperMm` 随之改变），页面内容整体旋转填满出纸版面，**不缩放、不裁切**；0/180 纸张不变。最终渲染层按角度追加 rotor 类包裹页面（测量趟不包裹，避免两次结果不一致）。单页与预览/服务端/客户端三端同源。
- `@worm-vue3-print/core`：打印管线支持**批量打印**——`printData` 传对象数组即按数组长度拼出同一个文档的多份副本（此前只能宿主页自己做 HTML 拼接）：同模板多份共用一次渲染管线，份间强制分页（`.print-copy` + 份间分页 CSS；连续纸走命名页，各份高度可不同）；`PreparedDocument` 新增 `copies` 与批量时每份的物理纸张尺寸 `copyPaperMm`。新增纯字符串合并器 `composeBatchHtml`（单份产物类型 `BatchCopyInput`）与 `normalizePrintData` / `MAX_BATCH_COPIES`（**上限 500 份**，空数组或含非对象项直接报错并给出 1 基项序号）。`@worm-vue3-print/render` 的 PDF 接口与桌面客户端 `print` 协议同步接受数组并按同一上限校验（截图接口同样接受数组，但按既有语义**只渲染首条**），浏览器预览回传渲染份数。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**设计背景（定位底图）**——`TemplateData.designBackground`（`src` + `rotation`，90° 步进），页面属性支持上传、旋转、移除；**只在设计画布显示**用于套打对位，预览、服务端 PDF 与静默打印一律忽略（不产出）。宿主通过 `uploadDesignBackground` 适配器提供上传实现（须返回完整可访问图片路径，不参与 `baseUrl` 拼接），也可由深层注入键 `UPLOAD_DESIGN_BACKGROUND_KEY` 提供。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：纸张尺寸切到**标签纸**（80×60 / 60×40 / 40×30mm）时，默认套用「整张纸都给内容区」的版面——四边页边距归零、页眉页脚高度归零（页眉页脚里已有的元素保留，把高度改回即可恢复）。该默认值**只在切换纸型时套用一次**，之后用户仍可在「页边距」「三区高度」里自行改回；存量标签纸模板打开时不会被改写。core 新增 `isLabelPaperSize` / `labelPaperDefaults` 两个纯函数，宿主与自建设计器可复用同一口径。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：**行为变更** 条形码（**元素**与**表格单元格**）不再拉伸填满可用框，改为同一套「条宽 → 打印机 dpi → 等比缩小」结算（`render/barcode-dot.ts` 的 `resolveBarcodeSize`）：
  ① **首选尺寸来自条宽**：每模块 `barWidth/2 × 0.25mm`，可用框装得下就按原样落纸、不再放大——放大到填满必然得到非整数条宽，正是出纸「忽宽忽窄」的根因；
  ② **设置了打印机分辨率时 dpi 优先适配**：首选尺寸吸附到「每模块整数个打印点」（DPI 优先于条宽的精确毫米值，如 0.25mm 在 300dpi 下取 3 点 ≈ 0.254mm），宽度足够即按此落纸；
  ③ **可用宽度不足时等比缩小**：有点阵时按整数点逐级缩小以保住点对齐，连 1 点/模块都放不下才退回连续等比缩放（此时已无法对齐，但不会溢出可用框）；宽高始终同比缩放，条码不会被拉变形。
  三端（设计器画布 / 浏览器出图 / 服务端渲染）的元素与单元格共用同一份常量与算法；尺寸统一由该
  结算函数给出后，条形码出图改为**恒内联 `<svg>`**（`<img>` 承载 SVG 时 Chromium 会把内在尺寸取整到 CSS px，结算出的 mm 会被改写），`maxWidth`/`maxHeight` 并入可用框参与结算；
  拉伸会把条宽变成非整数，故**条形码不再提供「缩放模式」**（条宽与 dpi 决定尺寸，需要上限用「最大宽高」），属性面板同步调整。**同一份旧模板的条码会变小**（缺省 barWidth=2 时约为元素框的一半），这是有意为之——放大条宽即可加大条码，换来的是出纸条宽稳定。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：文本元素与表格单元格支持**三种文字溢出显示形式**（属性面板「文字溢出」，模板字段 `textFit`）：
  `clip` 截断（不换行 `wordWrap:false` 时以省略号收尾）、`shrink` 自动缩小（下限 `shrinkMinFontSize`，缺省 6pt，缩到下限仍放不下则退化为截断）、
  `autoHeight` 自适应行高（元素高度/行高随内容增高）。**缺省值与既有行为一致，存量模板不受影响**（`text` 缺省截断、`longText` 与单元格缺省自适应行高）；
  自动缩小在测量趟用真实排版引擎二分求解并通过 `applyTextFit` 回写模板（会话原语 `measure` 返回值由 `RawMeasurement[]` 变为 `{ measurements, fits }`），
  三端字号一致；设计器画布复用同一份算法与可用高度换算（`fitTextNode`），设计态字号即出纸字号。DOM 执行器产物版本升到 `2`（新增 `applyTextFit`）。
- `@worm-vue3-print/core`：新增打印管线模块（driver 契约 + 共享 DOM 宿主 runtime + 三端 driver），
  浏览器、服务端、桌面客户端统一使用同一份测量、分页、连续纸推导、码制渲染与出图规格；
  新增 IIFE 执行器产物与 `@worm-vue3-print/core/node` 出口（`loadExecutorBundle`）。
- `@worm-vue3-print/render`：**行为变更** ① 连续纸模板按内容推导纸高（此前固定 `80×297mm`）；
  ② 条码/二维码渲染基线由 `bwip-js` 切换为 `jsbarcode`/`qrcode`（与浏览器预览一致）；
  ③ 就绪等待由 `networkidle` 改为 `domcontentloaded` + 5s 就绪等待；服务端不再依赖 `bwip-js`。
- `print-client`：**行为变更** 测量就绪等待由 3s 调整为 5s；渲染 worker 与 IPC 桥删除，
  改由主进程装配 core 管线与 Electron driver（`print.submit` / `print.submitHtml` 协议与出纸行为不变）。
- 已知缺口（本次未实现）：协议接受 `color` 与 `pageRanges`，但 PDF→系统打印链路从未应用这两个参数。
- `@worm-vue3-print/core`：**行为变更** 表格单元格此前已存有 `fontFamily` 的模板，渲染时该字段被静默丢弃（`data-binder` 的字段映射表未收录）；本次修复后单元格字体会真正生效，**同一份旧模板的呈现会发生变化**。同时修复 `font-family` 输出未加引号、未带兜底栈的问题（含空格的族名如 `Microsoft YaHei` 此前不生效）。
- `@worm-vue3-print/canvas` / `@worm-vue3-print/core`：新增 `PrintDesigner` 的 `fonts` prop（`PrintFontDeclaration[]`）——**模板级字体声明**，宿主配置后设计器注入 `@font-face`、在字体下拉中列出，保存/预览/截图时同步写入模板 JSON 的 `fonts` 字段，服务端与桌面客户端据此出图，三端不再依赖各自系统里装了什么字体。字体的 `url` 以 `/` 开头时按渲染端 `baseUrl` 解析（复用图片相对路径那套规则），绝对 URL 原样使用。
- `@worm-vue3-print/core`：渲染出的 HTML 会带上模板声明字体的 `@font-face`（`font-display: block`），且第一遍测量与最终出图都注入；DOM 执行器在就绪等待时**显式加载**文档里声明的字体，避免只等 `fonts.ready` 提前 resolve、按兜底字体度量导致分页与出图错版。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：字体声明新增可选 `label`（业务名，如「马善政毛笔楷书」），字体输入框与下拉优先展示 label 并在括号里附上真实族名（如「马善政毛笔楷书（Ma Shan Zheng）」），搜索同时匹配 label 与族名；**写入模板与 `@font-face` 的始终是 `family`**，输入 label 回车会映射回族名，避免把展示名写进模板导致字体静默失效。
- 字体基址与图片基址解耦（**修复自定义字体只在设计稿生效**）：模板声明字体的相对 URL 此前被拼到图片 `baseUrl` 上（如业务 OSS 域名），出图端因此 404、静默回退系统字体。现改为 `bindData(template, data, baseUrl, fontBaseUrl)`——`fontBaseUrl` 独立指定，缺省回落 `baseUrl`，传空串表示不拼接（浏览器端按文档 origin 解析，缺省行为）；`PrintJob`、render 服务的请求体与 `FONT_BASE_URL` 环境变量、SDK `print(..., { fontBaseUrl })`、客户端校验与渲染、`PrintHtmlPreview` 均支持。另外 **字体站点/CDN 必须返回 `Access-Control-Allow-Origin`**：出图端加载模板 HTML 时的 origin 为 `null`/应用协议，缺 CORS 头字体同样会被拦下。
- `@worm-vue3-print/canvas`：文本元素与表格单元格属性面板的「字体」下拉只列出模板声明字体（展示 label，模板当前值不在声明内时保留并标注「（未知）」）；声明之外的字体名仍可直接输入，不做静默清除。
- `@worm-vue3-print/core`：分页引擎支持**元素堆叠与显式编组同页**。此前内容区每个非表格元素各自扣减一次实测高度，纵向重叠的元素会被重复计高（触发本不需要的换页），且放不下时单个元素被独自推到下一页，导致设计器里的层叠组合在打印时被静默拆散。现改为：① 纵向区间相交的元素按并查集聚为「堆叠单元」，纵向只按并集占用一次版面、放不下时整组一起换页（上下边相切不算重叠，顺序流式排版结果不变）；② `options.groupId` 相同的显式编组成员强绑定同页，不参与表格跟随区归属，组内含 `pageable:false` 成员时整组锁定首页；③ 换页后整组平移到内容区顶部，组内相对偏移保持设计值；④ 内容区层序排序由仅按 `top` 改为 `top → zIndex → 模板数组序`，无 zIndex 时与设计器 DOM 层序确定一致。
- `@worm-vue3-print/canvas`：单击已编组元素的任一成员即选中整组（此前只选中单个成员），整组拖拽移动、Ctrl+G 编组、Ctrl+Shift+G 取消编组、右键菜单与图层层级保持一致；Ctrl/⌘ 多选仍按单元素切换。
- **破坏性变更：移除字体查询功能（含服务端与桌面客户端）** 不再获取两端系统字体清单——删除 `PrintDesigner` 的 `serverFonts` / `clientFonts` / `loadFonts` props 与「查询字体」按钮、离线与缺失字体提示；删除 `@worm-vue3-print/render` 的 `GET /fonts` 与 `X-Font-Warnings` 响应头、`@worm-vue3-print/client` 的 `fonts.list` 协议与 `PrintClient.listFonts()`、桌面客户端 `print.submit` 的缺字 `warn` 日志，以及 core 的 `readSystemFonts` / `mergeFontSources` / `findMissingFonts` 等清单合并与缺失校验能力。字体可用性完全由模板 `fonts` 声明与 `@font-face` 决定。

### 新增

- `@worm-vue3-print/core`：新增**条形码打印点对齐**（新模块 `render/barcode-dot.ts`）——把条码最终尺寸吸附到打印机点阵网格，修复热敏打印机出纸「条宽忽宽忽窄、边缘发灰」。根因（实测）：元素框 56.4×14.1mm、CODE128 编 8 位数字时单模块 0.318mm，在 203dpi（8 点/mm）下等于 **2.55 个打印点**；PDF 里条码是纯矢量且几何精确，但打印机/RIP 只能按整点成像，非整数条宽被各自取整成 2 点或 3 点。工具类软件之所以清楚，是因为它把窄条宽度定为整数打印点（如 3 点 = 0.375mm）。条形码元素新增 `printerDpi`（`options.printerDpi`，常见 203/300/600）；**表格单元格条形码同样支持**（`TableCell.printerDpi`，可用框 = 单元格内容区：所跨列宽/行高扣除内边距与塌陷边框，由新增的 `cellFitWidthMm` 与既有 `cellFitCapMm` 同一口径求出；表格未配置 `tableColWidths` 时宽度未知，不启用点对齐）——两者都在面板提供「打印机分辨率」下拉，且点对齐时隐藏缩放模式与最大宽高（叠加会把对齐结果重新缩成非整数点）；单元格类型切离条形码时清除该字段。同时修复另外两处清晰的元凶：① 条形码 SVG 补 `shape-rendering="crispEdges"`（二维码一直是这么设的；实测条边缘灰像素占墨迹 11.3% → 1.7%）；② 恢复**左右静区**（jsbarcode 缺省 10 模块，此前出图端写死 `margin:0`，EAN13/UPC/ITF14 会直接扫不出），且静区只留左右以免上下留白白白吃掉元素高度。设计器画布 `BarcodeElement` 与出图端共用同一份常量与算法（jsbarcode 参数统一以「模块」为单位表达），修掉此前设计态与出纸两套图形、`fontSize` 被当成 pt 的问题。**未设置 `printerDpi` 时几何与既有行为一致**（仅静区与去抗锯齿生效）。
- `@worm-vue3-print/canvas` / `@worm-vue3-print/core`：条形码/二维码**元素**补齐与表格单元格同口径的配置能力——属性台新增「条码设置」分组（此前该分组组件存在但未挂载，码制/条宽/显示文本/字号/纠错级别在界面上无处可改）：条形码可选码制（CODE128 / EAN13 / EAN8 / UPC / CODE39 / ITF14，存量大写归一化，选缺省码制时清字段）、条宽（倍率 2~4，启用打印机分辨率后隐藏并改为自动对齐）、显示文本（`hideTitle`）、文本字号（相对条高）；二维码可选纠错级别；「自定义设置」段与单元格一致：缩放模式（`fit`）、最大宽度/最大高度（mm，`ElementOptions` 新增 `maxWidth`/`maxHeight`）。新增字段经 `codeImgHtml` 透传到出图 `<img>` 的 `object-fit`/`max-width`/`max-height`，画布侧同步生效（内联 `<svg>` 用 `preserveAspectRatio` 等价映射，`fit='none'` 退化为 meet）。**未设置新字段时产物零变化。**另修复：单元格条形码在设计态默认不显示码值下方文本——`showText` 是布尔 prop，缺省会被 Vue 转成 `false`，而出图端 `showBarcodeText` 缺省为显示，两者不一致；现由 `TableElement` 显式传 `cell.showBarcodeText !== false`，画布侧 jsbarcode 参数（条高 30 / 字号 10 / 左右静区 10 模块 / 关抗锯齿）也与出图端同源。
- 打印客户端：新增「保留生成的 PDF」排查开关（配置窗口勾选，`config.json` 的 `keepGeneratedPdf` / `pdfOutputDir`，留空默认 `userData/pdf`）——保留每次打印生成的 PDF，任务记录显示其绝对路径并提供「打开目录」，用于判断问题出在 PDF 生成还是打印机/驱动。
- `@worm-vue3-print/client`：新增浏览器预渲染直提交通道——协议消息 `print.submitHtml` 与 SDK 方法 `PrintClient.printHtml(rendered, options, templateName)`。宿主页用 `@worm-vue3-print/core/browser` 的 `renderHtmlPages` 在浏览器内完成两遍渲染，把最终 HTML（含纸张/方向/边距/连续纸高度）直送客户端静默出纸，客户端不再执行模板渲染；旧 `print`（客户端内渲染）链路保留兼容。
- 打印客户端：`print.submitHtml` 入站校验（HTML 非空、≤20MB、`paperMm` 毫米正数、`continuous`/`pageCount` 类型），纸张/方向/边距覆盖项一律以 `INVALID_REQUEST` 拒绝；打印引擎重构为「准备（渲染或直取 HTML）→ 出纸」双路共用流程。
- demo：「客户端静默打印」改为浏览器侧渲染后经 `printHtml` 提交（新增 `src/browser-render.ts` 封装）。
- 新增仓库内技能 `skills/print-template-json`：**用简写 JSON 生成打印模板**。SKILL.md 定义工作流，`scripts/build_template.py` 把简写（box / size / align / code / cols / rows …）展开为完整 `TemplateData`（自动补骨架、元素 id、`printElementType`、表格合并占位格），`scripts/validate_template.py` 按管线硬规则出纸前校验（越界、2mm 安全余量、列宽行高和、每行列数、拼版列数上限、连续纸禁拼版、表达式花括号配对与函数白名单），`assets/templates/` 附 7 份成品模板与数据。
- demo：新增**示例模板库**（`src/samples/`）——7 份静态数据示例（采购收货单、称签、价签、快递面单、零售小票、资产标签、销售出库单），「加载示例」改为分组选择弹窗，卡片缩略图按元素坐标等比绘制；选中即载入模板、字段树与打印数据，批量数据按示例自带或安全派生。
- `@worm-vue3-print/canvas`：设计器多页面 API——`useDesignerState` 与 `PrintDesigner` 实例暴露 `pages` / `activePageIndex` / `switchPage` / `addPage` / `duplicatePage` / `deletePage` / `renamePage` / `movePage`；撤销历史与选区管理由单页扩展为按页收敛（页操作即清空当前页选区）。

- `@worm-vue3-print/core`：新增同构水印模块（`render/watermark.ts`）——`generateHtml` 在每页最底层输出 `.watermark-layer`（**显式矢量瓦片**，逐块 `<svg class="watermark-tile">`），设计模板、浏览器预览、服务端 PDF、静默打印四端水印渲染完全一致。
- `@worm-vue3-print/core`：`WatermarkOptions` 新增 `tileWidth`/`tileHeight`（瓦片尺寸，控制水印密度，默认 260×180）；导出 `WATERMARK_DEFAULTS`、`WATERMARK_DENSITY_PRESETS`、`PX_PER_MM`、`MM_PER_PX`、`isWatermarkVisible`、`resolveWatermarkText`、`formatTimestamp`、`resolveWatermarkLayout`、`renderWatermarkTileSvg`、`renderWatermarkLayerHtml`。
- `@worm-vue3-print/core`：水印表达式支持系统变量 `{printDate}`（打印日期 YYYY-MM-DD）、`{printTime}`（打印时间 HH:mm:ss）、`{pageIndex}`（当前页码）、`{totalPages}`（总页数），与表达式弹框「变量」一致；`injectSystemVariables` 同步支持 `{printTime}` 替换，并导出 `resolveSystemVariables` 供设计器预览复用（预览与打印取值同源）。
- `@worm-vue3-print/canvas`：水印配置面板合并为单一「水印表达式」输入——**纯文本即静态水印（`mode=fixed`）**，含 `{字段}`、函数调用（`CONCAT(...)`）或字段路径（`order.no`）则按表达式解析（`mode=binding`），无需再手选模式；表达式通过表达式弹框（按钮或双击输入框打开）编辑，弹框内可直接选业务字段与打印日期/时间等变量；移除预设绑定字段下拉与时间戳开关（时间戳改由表达式里的 `{printDate}`/`{printTime}` 表达）；测试值仅在表达式模式下展示；保留密度（密/中/疏/自定义瓦片尺寸）等设置。
- `@worm-vue3-print/canvas`：`WatermarkConfig`、`CanvasPaper` 水印渲染改用 core 同构模块，三端渲染一致。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：新增**标签拼版**（模板 `tiling` 配置）——小尺寸标签模板不再「一张纸打一个标签」：开启后按「列 × 行」把多份标签铺进目标纸（默认 A4 纵向、四边留白 10mm、格间距 2mm、列数手工指定、行数按纸面自动推导），单份数据同样走拼版（1 格 1 张）。core 新增 `print/tiling.ts`（`computeTileLayout`：纸面/列数/标签高度校验与行列推导，连续纸不支持拼版）与 `print/tile-compose.ts`（按格铺排合成 HTML）；拼版下 `renderPdf` 的 `pageCount` 改为**实际输出张数**（预览「共 N 页」与客户端任务历史同口径），`paperMm` 为目标纸尺寸。canvas 新增拼版配置面板（开关、目标纸与方向、自定义尺寸、四边留白、横纵间距、列数），实时显示行列数与可容纳格数；任一份标签底部超出其内容区时拼版直接报错，不静默裁切。`@worm-vue3-print/render` 新增拼版端到端集成测试（真实 Chromium 校验张数与格坐标）。
- `@worm-vue3-print/core` / `@worm-vue3-print/canvas`：纸张预设新增**针式打印纸**（`DOT_FULL` 全等分 241×279.4mm、`DOT_HALF` 二等分 241×139.7mm、`DOT_THIRD` 三等分 241×93.1mm）、**标签纸**（`LABEL_80X60` / `LABEL_60X40` / `LABEL_40X30`）、**小票纸**（`THERMAL_57` / `THERMAL_80` / `THERMAL_110`，连续纸：纸宽取预设值、可用 `customWidth` 覆盖如 58mm，出纸高度仍按内容推导、方向强制纵向）。`PaperSize` 与 `PAPER_DIMENSIONS`/`PAPER_PRESETS` 同步扩展，`isContinuousPaperSize(paperSize)` 判定连续纸（小票纸与 `CONTINUOUS` 均为真），拼版目标纸下拉仍排除连续纸；设计器「纸张尺寸」下拉按「常用纸张 / 针式打印纸 / 标签纸 / 小票纸 / 连续纸」分组显示中文名与尺寸。

### 修复

- `@worm-vue3-print/core`：修复水印经**真实打印机出纸**后被放大约 3 倍、位置偏移、平铺错乱的问题。根因是水印原先用 CSS 平铺背景（`background-image` + `background-repeat`）实现，Chromium 会把它编译成 PDF 平铺图案（tiling pattern），PDF 查看器正常但出纸链路的 RIP 忽略图案矩阵（其所在 form 的 CTM 为 3.125 = 300dpi÷96px，实测放大倍数吻合）。现改为显式矢量瓦片：`resolveWatermarkLayout` 按纸张尺寸（含连续纸探针推导的最终纸高）计算瓦片网格，逐块输出内联 `<svg>`，出纸几何回到设计值（A4 默认密度 68.8mm × 47.6mm）。删除 `buildWatermarkSvgDataUrl`，杜绝回归到平铺背景方案。
- 打印客户端：修复**出纸方向与浏览器/服务端预览不一致**（横向页面被打成纵向）。根因是出纸命令未声明纸张，CUPS 按队列默认纸张（多为纵向 A4）处理，`pdftopdf` 把横向页旋转 90°（产物 PDF 带 `/Rotate 90`）。现在按「宿主指定驱动纸型 → 标准纸型匹配 → `Custom.<宽>x<高>`（点）」显式下发 `-o media=…`，实测同一份横向 A4 页面由 `/Rotate 90` 恢复为 `/Rotate 0`，纵向页面不受影响。
- 打印客户端：修复静默打印「PDF 生成超时 → 后续任务全部 BUSY」——`webContents.printToPDF` 已移除回调重载（回调永不触发、Promise 拒绝被静默吞掉），且 `PrintToPDFOptions.pageSize` 单位是**英寸**而非微米（误传微米会得到 210000×297000 英寸纸张，Electron 44 直接生成失败）。改用 Promise + 超时兜底（`src/main/pdf-generator.ts`）、纸张微米→英寸换算、显式零边距与 `printBackground: true`；生成失败/超时统一以 `PRINT_FAILED` 返回并释放串行锁，客户端静默打印产物与服务端 PDF 的水印、纸张尺寸一致。
- 打印客户端：出纸链路文档同步为「HTML → printToPDF → 系统打印命令」（`clients/print-client/README.md`、`docs/中文/指南/静默打印.md`、静默打印技能参考）。
- `@worm-vue3-print/core`：修复小纸张模板输出**空白第一页**（如 80×60mm 自定义纸、边距 10mm、内容高 38mm）。两处根因：① 分页引擎 `finishPage()` 无条件把当前页入列，首个元素/单元判定放不下时会产出一张空纸、内容整体下移一页；现在空页不入列，内容按设计坐标留在本页；同时在 `PageLayout.overflow` 标记「内容底部超出内容区会被纸面裁掉」（按物理边界判定，不看分页预算里的 2mm 安全余量——贴着纸边排仍是合法排版），拼版「每份恰好 1 页」校验据此继续阻断真正超高的内容。② DOM 执行器测量元素高度用 `offsetHeight`（整数 px，向上取整），38mm 被读成 144px = 38.1mm，恰好越过 40mm 内容区扣除 2mm 安全余量后的 38mm 预算，把「放得下」误判为「放不下」；现改用 `getBoundingClientRect().height` 取亚像素真实高度（表格行高同理）。
- `@worm-vue3-print/canvas`：修复多页面模板**页面重排后页签名漂移、新增页重名**——首页（默认模板创建或宿主载入）没有存储 `name`，页签只能按位置回退显示「页面 N」，页面前移/后移后索引变化导致名字整体漂移，与已固化的页名冲突；现在初始化时给无名页补存固定默认名，`addPage` 改取第一个未占用的名字（删页后再新增也不会重名）。
- `@worm-vue3-print/core`：修复多页面模板**批量打印时份间分页失效**——批量拼接时每份虽已包 `.print-copy`，但 CSS 拼接漏了份间强制分页规则，每份最后一个 `.print-page` 命中 `:last-child`（`break-after: auto`），两份会连着排；现复用 `COPY_BREAK_CSS` 并在批量时追加（已导出该常量），render 集成用例验证「2 份 × 3 页 = 6 页」。
- `@worm-vue3-print/core`：浏览器适配器 `renderHtmlPages`（`@worm-vue3-print/core/browser`）入参类型放宽为 `TemplateData | MultiPageTemplateData`，浏览器侧可直接提交多页面模板。

### 变更

- 渲染微服务 `worm-vue3-print-render` 并入本 monorepo，落地为私有服务包 `services/print-render`（包名 `@worm-vue3-print/render` 保持不变，不发布 npm）；通过 npm workspace 本地软链依赖 `@worm-vue3-print/core`，不再从 npm registry 安装 core。
- 根工作区新增 `services/*` 分层；`npm run build` 同时构建 render，根 `npm test` 仍只覆盖 core/canvas，render 的浏览器集成测试由 CI 独立 job 执行。
- 新增根 `.npmrc`：Playwright 浏览器不随依赖安装自动下载，本地/CI 按需执行 `npx playwright install chromium`，Docker 镜像使用基础镜像内置 Chromium；Docker 构建上下文改为仓库根（`docker build -f services/print-render/Dockerfile .`）。
- demo（`demo/`）新增服务端 PDF 打印：顶栏显示渲染服务在线状态，「服务端 PDF」按钮经 Vite dev 代理（`/render-api/*`，代理层注入 `X-Render-Key`）调用 render 微服务，取当前画布 JSON + 示例数据两遍渲染出 PDF 并新标签页打开。
- `@worm-vue3-print/canvas`：**破坏性变更** 删除设计器内置的「加载默认布局」按钮与 `load-default-template` prop——模板加载/重置属于宿主业务。宿主在自有页面区域渲染入口，把新的 `TemplateData` 赋给 `initial-template` 即可重载画布（设计器按引用变化监听并记录一次历史，撤销可回退）。原注入 `load-default-template` 的宿主该 prop 会被忽略，需改为上述写法。
- demo：适配多页面模板——载入/导入/保存接受并处理 `MultiPageTemplateData`（存什么返回什么），预览与批量数据源按整份多页文档渲染。
- `@worm-vue3-print/render`：多页面模板端到端集成测试（真实 Chromium 校验 PDF 页数、各页纸张一致、「下一模板新开一页」的页边界），请求类型放宽为联合类型后逻辑全部落在 core 校验。

### 已知限制

- 多页面模板出纸时「内容旋转角度」取**首页**的 `outputRotation`（各页纸张尺寸已强制一致，但角度尚未纳入一致性校验）；每页独立旋转角度留作后续扩展。
- 多页面模板不支持连续纸与标签拼版，也不支持数据驱动的条件包含页（如金额超阈值才追加条款页）。

## [1.2.2] - 2026-09-11

### 变更

- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/designer`——框架无关的设计器内核，包含完整模板模型类型、通用工具（元素工厂、表格矩阵、单位换算、模板迁移、标尺等）与纯交互逻辑（对齐、分组、键盘、缩放、吸附计算），无 Vue/React 等框架依赖。
- `@worm-vue3-print/core`：新增子路径导出 `@worm-vue3-print/core/browser`——浏览器侧渲染适配器（`renderHtmlPages` 两遍分页渲染、`browserCodeRenderer` 条形码/二维码渲染）。
- `@worm-vue3-print/canvas`：设计器模型、工具与纯逻辑下沉至 core 子路径，canvas 仅保留 Vue 适配层；公共导出 API 保持不变，core 主入口仍保持零运行时依赖。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏放大/缩小按钮直接线性修改缩放比例、未做滚动锚点校正导致画面漂移的问题；按钮缩放改为与 Ctrl+滚轮一致的乘性步进，并以视口中心为锚点（与「适应窗口」同一缩放管线）。

## [1.2.1] - 2026-09-11

### 变更

- `@worm-vue3-print/canvas`：工具栏编辑区/层级区/视图区图标按钮统一使用 data-tip 自定义悬浮提示，补齐「网格」「吸附」缺失提示；提升提示层级，不再被画布顶部标尺遮挡。
- `@worm-vue3-print/canvas`：优化「适应窗口」——以视口中心为锚点一步缩放到位（与 Ctrl+滚轮同一缩放换算管线），缩放平滑过渡；允许低于交互缩放下限（最小可至 5%），超大纸张也能整版容纳，纸张在画布视口内水平垂直居中。
- `@worm-vue3-print/canvas`：新增 `showHelp` 配置——控制帮助入口（帮助按钮与帮助弹框）显示，默认开启，传入 `false` 即可隐藏。

### 修复

- `@worm-vue3-print/canvas`：修复工具栏悬浮提示气泡被画布顶部固定标尺遮挡无法显示的问题。
- `@worm-vue3-print/canvas`：修复「适应窗口」后超大纸张仍残留滚动条、纸张未在画布视口居中（垂直偏上）的问题。

### 文档

- 新增打印设计工作台布局线框图文档（`docs/中文/打印设计工作台-布局线框图.md`），标注各区域名称、功能与对应组件文件，便于后续布局调整。

## [1.2.0] - 2026-09-10

### 新增

- `@worm-vue3-print/canvas`：新增帮助文档模态框（HelpModal），包含功能介绍、快捷键一览、常见问题等帮助内容。
- `@worm-vue3-print/canvas`：标尺参考线增强——支持拖拽添加参考线、双击编辑、删除，参考线对齐吸附实时显示。
- `@worm-vue3-print/canvas`：表格列宽拖拽新增末列右边界手柄，可直接拖拽调整末列宽并受 `maxTableWidth` 钳制。

### 变更

- `@worm-vue3-print/canvas`：优化缩放逻辑，取消放大上限，支持滚轮乘性步进缩放，修复缩放锚点漂移问题。
- `@worm-vue3-print/canvas`：移除设计态元素左上角的 fx 绑定标签提示，简化元素视觉呈现。

### 文档

- 仓库根目录新增 `AGENTS.md` AI 代理行为规范文件，明确代理在本仓库工作时的语言、专家态度、协作约定等强制要求。
- 新增 `worm-vue3-print` 集成支持 skill（`skills/worm-vue3-print-integration/`），包含安装指南、集成 API、故障排查等参考文档。

### 修复

- `@worm-vue3-print/canvas`：修复表格列宽拖拽存在的多个缺陷——内部列边界向左拖时左列宽度不变导致边界线不跟随光标、px→mm 单位换算缺失导致拖拽距离存在约 3.78 倍偏差、`table-layout:fixed` 下拖拽过程中表格 CSS `width(100%)` 与列宽和失配导致浏览器按比例拉伸列使边界线与右侧内容偏离光标；同时删除 `onColResizeStart` 中残留的 `document.title` 调试代码。

## [1.1.0] - 2026-09-06

### 新增

- `@worm-vue3-print/canvas`：表格元素支持列宽拖拽——设计态选中表格后，在列边界悬停并拖动即可调整该列宽（左侧列），实时更新画布与元素尺寸；受打印范围宽度（`maxTableWidth`）与最小列宽（5mm）钳制，拖拽结束后计入一次撤销历史。属性面板的列宽数值输入保留作为精确输入兜底。
- `@worm-vue3-print/canvas`：表格单元格支持图片类型——单元格可切换为图片类型，设计态支持选择图片与设置 fit/maxWidth/maxHeight，预览与打印输出完整渲染。
- `@worm-vue3-print/canvas`：条形码与二维码单元格支持 fit/maxWidth/maxHeight 属性。
- `@worm-vue3-print/canvas`：属性面板位置尺寸改用 StepperInput 控件，支持按钮微调数值；StepperInput 支持可选值列表和小数步进。
- `@worm-vue3-print/canvas`：新增统一颜色选择器并重构属性面板字段分组。
- `@worm-vue3-print/canvas`：支持页面（纸张）背景色 `pageBackground`，预览与打印/PDF 输出一致。
- `@worm-vue3-print/canvas`：支持 canvas 库模式构建与 npm 发布。

### 修复

- `@worm-vue3-print/canvas`：打印/导出 PDF 保留元素背景色（`print-color-adjust: exact`）。
- `@worm-vue3-print/canvas`：打印预览保留元素重叠，表格下方跟随元素按设计坐标绝对定位并透传层级 z-index。
- `@worm-vue3-print/canvas`：打印页眉页脚区域贴页面底部，修复页边距失效。
- `@worm-vue3-print/canvas`：条形码渲染缺少 `object-fit: contain`。
- `@worm-vue3-print/canvas`：修复 canvas 测试在 vitest v4 + happy-dom 环境下 `localStorage` 未定义的问题，补充 mock 以兼容测试环境。

## [1.0.0] - 2026-09-02

### 新增

- 首次开源发布。
- `@worm-vue3-print/core`：模板表达式引擎与同构渲染管线（HTML 生成/分页/数据绑定）。
- `@worm-vue3-print/canvas`：Vue 3 可视化打印模板设计器画布。
- 渲染微服务拆分为独立仓库 `worm-vue3-print-render`（仅 Docker 部署，不上 npm）。
