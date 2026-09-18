# 元素与单元格字体设置（含动态字体清单）设计

日期：2026-09-18
范围：`packages/print-core`（字体模块 + 渲染断链修复 + 校验）、`packages/print-canvas`（注入与 UI）、`packages/print-client-sdk`（WS 门面）、`clients/print-client`（本机字体枚举）、`services/print-render`（容器字体上报）、`demo`（宿主取数示例）。

## 1. 背景与目标

### 现状缺陷（本次一并修复）

1. **单元格字体是断链的**。`TableCell.fontFamily` 存在（`packages/print-core/src/designer/types.ts:147-149`），设计器也能选（`packages/print-canvas/src/components/property/TableCellGroup.vue:80-90`），但渲染侧 `RenderCell`（`packages/print-core/src/render/types.ts:115-117`）没有 `fontFamily` 字段，`data-binder.ts:175` 只透传 `fontWeight`、把它丢弃，`html-generator.ts:356-379` 的 `matrixCellStyle()` 也不输出 `font-family`。**用户给单元格选字体，预览与打印均不生效。**
2. **文本元素没有字体名 UI**。`AppearanceGroup.vue:4-17` 的 `isTextType` 分支只有字号与粗细；`fontFamily` 仅在画布元素组件里以 `|| 'inherit'` 透传（`TextElement.vue:26`、`LongTextElement.vue:26`）。
3. **字体名清单硬编码**在 `TableCellGroup.vue:81-89`（6 项 `<option>`）。
4. **全局兜底字体栈硬编码**在 `packages/print-core/src/render/css-builder.ts:40`。
5. **既有缺陷**：`table-matrix.ts:175-186` 的 `copyCellStyle()` 复制样式时漏掉 `fontFamily`，格式刷会丢字体；`TableCellGroup.vue:81` 的 `<select placeholder="继承默认">` 中 `placeholder` 对 `<select>` 无效，且无空选项，导致单元格字体**一旦设置就无法清除**。

### 目标

1. 文本元素（`text`/`longText`）与表格单元格可设置字体，且该设置在浏览器预览、服务端 PDF、桌面客户端打印中**行为一致**。
2. 字体按**字体名引用**，模板只存 `font-family` 字符串，不内嵌字体文件。
3. 可用字体清单由**出图端动态上报**：服务端容器 + 桌面客户端本机。
4. 设计器将两端清单**并集展示并标注可用范围**，让设计者在设计期看见跨端差异。
5. 出图端缺少模板指定字体时**校验并告警，但不阻断出图**。

### 非目标

- 不做字体文件上传 / 模板内嵌字体 / `@font-face` 注入（方案选型阶段已否决）。
- 不做模板级与表格级默认字体，仅做元素级与单元格级。
- 不做跨语言字体别名归一（见第 10 节）。
- 不为 `pageNumber` 元素新增字体 UI（见第 7.5 节）。
- 不做远端客户端连接（SDK 仍只连本机 `127.0.0.1`）。

## 2. 决策摘要

| 决策点 | 结论 |
|---|---|
| 字体来源 | 只按字体名引用系统字体，模板不含字体资产 |
| 清单来源 | 服务端容器 + 桌面客户端本机，两端动态上报 |
| 设计器展示 | 两端并集，逐项标注可用范围 |
| 缺字体行为 | 校验 + 告警，**不阻断**出图 |
| 设置粒度 | 元素级 + 单元格级，不新增模板级/表格级默认字体 |
| 清单语义 | 客户端上报代表**当前浏览器所在机器** |
| 浏览器 `queryLocalFonts` | **不使用**（见第 5.3 节） |

## 3. core 字体模块契约

新增 `packages/print-core/src/print/fonts.ts`，归属 `print/` 是因为它属于「出图参数」，与 `pdf-spec.ts`/`ports.ts` 同级。从 core 根入口 `.` 导出（服务端与客户端只依赖根入口）。

```ts
export type FontSource = 'server' | 'client';

/** 单端上报结果。available=false 表示未连接/不可达，与「已连接但清单为空」语义不同 */
export interface FontSourceReport {
  available: boolean;
  fonts: readonly string[];   // 原始名单，未规范化
}

export const UNAVAILABLE: FontSourceReport;  // { available: false, fonts: [] }

export interface FontCandidate {
  family: string;
  sources: FontSource[];      // 只含 available: true 且包含该字体的端
}

/** 全局兜底字体栈，由 css-builder.ts:40 上移而来，成为唯一真实来源 */
export const FALLBACK_FONT_STACK: readonly string[];

/** 合并两端上报，按 sources.length 降序 → family 升序稳定排序 */
export function mergeFontSources(input: {
  server: FontSourceReport;
  client: FontSourceReport;
}): FontCandidate[];

/** trim、去空、去重（大小写不敏感，保留首次出现的写法）、剔除 '.' 开头的隐藏字体、稳定排序 */
export function normalizeFontList(raw: readonly string[]): string[];

/** 生成 `"SimSun", "Microsoft YaHei", <FALLBACK_FONT_STACK...>`，含空格的族名加引号；family 为空时返回纯兜底栈 */
export function toFontFamilyStack(family?: string): string;

export interface MissingFont {
  family: string;
  targets: string[];          // 引用该字体的元素/单元格位置标识
}

/**
 * 遍历 elements / header / footer / firstPageOverlay，收集元素 options.fontFamily
 * 与表格单元格 fontFamily，找出 available 中不存在的项。
 * available 由调用方按单端过滤；该端 available=false 时必须跳过校验（见第 8 节）。
 */
export function findMissingFonts(
  template: TemplateData,
  available: readonly FontCandidate[],
  source: FontSource,
): MissingFont[];
```

`normalizeFontList` 剔除 `.` 开头族名**不是防御性猜测，是实测结论**：macOS 系统字体枚举返回的 283 个去重族名中，大量为 `.Al Bayan PUA`、`.Apple Color Emoji UI`、`.Apple SD Gothic NeoI` 这类系统内部隐藏字体，不剔除会直接污染下拉列表。

**规则**：`findMissingFonts` 的 `available` 参数由调用方传入**已按 `source` 过滤**的候选列表；若该端未成功上报，调用方直接跳过调用，不传入空列表——否则会把「拿不到清单」误判为「字体缺失」。

## 4. 渲染侧断链修复

不依赖任何选择，本次一并修：

1. `packages/print-core/src/render/types.ts:115-117`：`RenderCell` 新增 `fontFamily?: string`。
2. `packages/print-core/src/render/data-binder.ts:158-181`：**在该处重建 `RenderCell` 的显式字段清单中补一项 `fontFamily: cell.fontFamily`**。注意这不是"漏传一个参数"，而是一份逐字段枚举的映射表——`fontFamily` 根本没进这张表，所以在绑定阶段凭空消失（实测：绑定后单元格 `fontFamily` 为 `undefined`）。同处 `fontSize`/`fontWeight`/`color` 均在表中，可对照补齐。
3. `packages/print-core/src/render/html-generator.ts:356-379`：`matrixCellStyle()` 输出 `font-family`（经 `toFontFamilyStack`），空值时不下发该属性、由 CSS 继承。**该函数当前完全没有任何 font-family 分支**（已由源码直读与渲染实证双重确认）。插入位置参照同函数内既有兜底写法（`cell.fontSize ?? opts.tableDefaultFontSize`）的所在段落。注意该函数拼接时**不追加末尾分号**（与 `textStyle` 不同），新增项须与既有风格一致。
4. `packages/print-core/src/render/html-generator.ts:241`：`textStyle()` 的 `if (opts.fontFamily) parts.push(\`font-family:${opts.fontFamily}\`)` 改走 `toFontFamilyStack()`——现状是裸值输出，既无引号处理也无任何兜底。
5. `packages/print-core/src/designer/utils/table-matrix.ts:175-186`：`copyCellStyle()` 补复制 `fontFamily`。
6. `packages/print-core/src/render/css-builder.ts:40`：改为引用 `FALLBACK_FONT_STACK`。

**字体栈必须在 core 生成**，两端只做采集。依据：`scripts/check-print-architecture.mjs` 禁止 render 与 electron 源码出现硬编码出图参数；同时符合 CLAUDE.md「出图参数的唯一真实来源在 core」。

## 5. 两端字体采集

分工原则：**采集是平台适配（各端自己做），清洗与合并是纯逻辑（core 做）**。

### 5.1 服务端（`services/print-render`）

- 新增 `GET /fonts` → `{ fonts: string[] }`，路径与错误包装对齐既有路由风格。
- 新增 `services/print-render/src/font-catalog.ts`：容器内执行 `fc-list --format='%{family}\n'`，按行、按逗号切分，交给 core 的 `normalizeFontList`。
  - **必须取全部族名，不能取 `%{family[0]}`**。`fonts-noto-cjk` 的 `NotoSansCJK-Regular.ttc` 是单个文件承载多族名（JP/SC/TC/KR），取首族名会让容器里明明能渲染的「Noto Sans CJK SC」从清单中消失，直接误导设计者。`fc-list` 的 `%{family}` 输出为逗号分隔的族名列表，切分即可。
  - 镜像不变则清单不变 → **启动时采集一次并 memo**，不在请求路径上 spawn 进程。
  - 采集失败（命令不存在/非零退出）→ 返回 500，宿主记为 `available: false`。**不返回空清单**，以免与「容器确实没有字体」混淆。
  - Dockerfile `services/print-render/Dockerfile:13-14` 已显式安装 `fonts-noto-cjk` 与 `fontconfig`，`fc-list` 可用，无需新增系统依赖。
- 「命令行输出 → 字体名数组」的解析抽为纯函数，单独单测。

### 5.2 客户端（`clients/print-client`）

- 新增 `src/main/platform-fonts.ts`，**枚举全部在主进程**（沙箱 renderer 无 fs）：

| 平台 | 手段 | 已知坑 |
|---|---|---|
| Windows | PowerShell + GDI+ `InstalledFontCollection`，失败降级 `reg query` | 注册表值名带 `(TrueType)` 后缀，中文系统还有 `宋体 & 新宋体` 这类 `&` 合族名——故 GDI+ 优先，注册表仅作降级 |
| macOS | `system_profiler -json SPFontsDataType` | 顶层 `_name` 是**字体文件名**（如 `Times New Roman Bold.ttf`），族名在嵌套的 `typefaces[].family`。实测本机 278 个文件条目 → 283 个去重族名，取的必须是 `typefaces[].family`，并对 `typefaces` 缺失/为空的条目跳过 |
| Linux | `fc-list` | 同服务端 |

- 结果交 core `normalizeFontList`，memo 缓存 TTL 60s。
- 解析层（命令输出 → 字体名数组）抽为纯函数单独单测，exec 适配层保持最薄。
- **不新增 IPC 通道**：设计器在宿主浏览器中运行、走 WebSocket 取客户端清单；客户端自身设置窗口不展示字体列表，新增 `LIST_FONTS` IPC 属于无人消费的接口面。

### 5.3 为什么不用浏览器的 `queryLocalFonts()`

- `window.queryLocalFonts()`（Local Font Access API）仅 Chromium 系支持，Firefox/Safari 均无；MDN 标记为 Limited availability / Experimental，非 Baseline。
- 需要 HTTPS、首次调用弹 `local-fonts` 权限且**必须由用户手势触发**，会打断设计流程；宿主将设计器嵌入 iframe 时还需 Permissions Policy 放行。
- 而 Electron 主进程枚举既准确又无权限约束。桌面客户端既然已纳入范围，浏览器侧枚举即无必要。

## 6. WebSocket 通道与 SDK

- `clients/print-client` WS 协议新增一对 `list-fonts` 请求/响应消息，WS 服务侧补 handler，内部调 `platform-fonts.ts`。
- `packages/print-client-sdk` 新增 `listFonts(): Promise<string[]>`，复用既有端口探测、退避重连与 `WormPrintError` 错误码机制；未连接或枚举失败时 **reject**（不复用空数组表达失败——空数组是「已连接且没有字体」），由宿主捕获后记 `available: false`。
- 宿主取得失败（未连接/超时/报错）时记为 `{ available: false, fonts: [] }`，**不视为致命错误**。

## 7. canvas 接入与 UI

### 7.1 取数与注入

沿 `packages/print-canvas/src/composables/useHostAdapter.ts` 的既有约定（「开源核心不直接发请求，能力由 PrintDesigner 经 props 接收后 provide」）：

- `PrintDesigner` 新增两个 props：`serverFonts?: FontSourceReport`、`clientFonts?: FontSourceReport`；缺省视为 `UNAVAILABLE`。
- 新增 `packages/print-canvas/src/composables/useFontCatalog.ts`：调 core `mergeFontSources`，产出 `{ fonts: FontCandidate[]; serverAvailable: boolean; clientAvailable: boolean }`。
- 新增 `FONT_CATALOG_KEY` injection key，与 `UPLOAD_IMAGE_KEY` 并列；深层组件 inject 使用。

### 7.2 文本元素面板（`AppearanceGroup.vue`）

在 `isTextType` 分支内、「字体大小」之前插入「字体」下拉，写入 `element.options.fontFamily`，选默认项时置 `undefined`，并套 `v-show="showItem('ap-font-family')"`。

属性搜索索引在 core 中定义，须同步登记：`packages/print-core/src/designer/utils/property-search.ts:28` 的 `appearance` 组（`groupLabel: '外观'`）新增一项 `{ key: 'ap-font-family', keywords: ['字体', '字体名', 'fontfamily'] }`。未登记时搜索态下该字段会被隐藏。

单元格面板的字段不接入属性搜索（`TableCellGroup.vue` 现有字段均无 `showItem`），故该侧无需登记。

### 7.3 单元格面板（`TableCellGroup.vue`）

- `:80-90` 的 6 项硬编码 `<option>` 改为由注入清单生成，`write(...)` 逻辑不变。
- 补 `<option value="">继承默认</option>`（并移除无效的 `placeholder` 属性），修复「单元格字体无法清除」的既有缺陷。

### 7.4 展示与标注

- 选项文本 = `family` 原名 + 标注：两端都有则无标注；仅服务端标`（仅服务端）`；仅本机标`（仅本机）`。
- 排序沿用 `mergeFontSources`（两端都有的在前），最安全的选择最先出现。
- 下拉上方一行状态提示，**仅异常时出现**：`clientAvailable === false` → 「桌面客户端未连接，本机字体未知」；`serverAvailable === false` → 「服务端字体清单不可用」。
- 下拉必须包含模板中的当前值，即使它不在任何清单内（导入的模板可能使用 `Comic Sans MS`），显示为 `Comic Sans MS（未知）`；否则原生 `<select>` 会错位成空选中。
- **不做逐项字体预览**：原生 `<option>` 无法可靠地按各自字体渲染（各浏览器实现不一致），而画布本身就是实时预览。

### 7.5 范围边界

`pageNumber` 元素渲染层已支持 `fontFamily`（`PageNumberElement.vue:22`），但本次不给它加 UI——它不属于「文本元素」，且 `isTextType`（`PropertyPanel.vue:199-202`）现仅含 `text`/`longText`。后续如需，把 `'pageNumber'` 加进 `isTextType` 即可。

## 8. 校验与告警

`findMissingFonts` 是**唯一**校验实现，三处调用点，**按端分别校验、不使用并集**（校验要回答的是「这个出图端有没有」，并集是给人看的）：

| 调用点 | 时机 | 结果去向 |
|---|---|---|
| canvas 设计器 | 实时（清单已在内存，零网络） | 字段内联标注 + StatusBar 汇总 |
| `services/print-render` | 出图前 | 出图接口响应体新增**可选**字段 `warnings: Array<{ code: 'FONT_MISSING'; family: string; targets: string[] }>`（可选即不破坏既有消费者） |
| `clients/print-client` | 任务开始时 | 复用既有 job history 与 `LOG_EVENT`；**不新增 SDK 错误码**（不阻断就不该走失败路径） |

### 告警呈现

- 字段级：字体下拉下方一行标注，如「服务端无此字体」「本机无此字体」「两端均无」。
- 汇总：`StatusBar.vue` 左侧组新增一项「N 处字体缺失」，仅在有缺失时出现，点击展开「字体名 → 缺失端」列表；样式与既有 `.status-dirty` 同源，不引入新视觉语言。

### 渐进增强与降级（硬约束）

- **字体清单绝不阻塞设计器首屏**：宿主先挂载设计器，清单后到后填充下拉。
- 取数超时 3s 即记 `available: false`；SDK 侧复用既有退避重连，不为字体新增重试逻辑。
- 清单不可用 ≠ 字体缺失：该端 `available: false` 时**跳过**校验（见第 3 节规则）。
- 任一端失败**不阻断另一端**的展示与校验。

## 9. 兼容性与行为变更

只新增可选字段（两个 `fontFamily` 字段本就存在），**不新增模板版本号、不改 `packages/print-core/src/designer/utils/migrate.ts`**——该文件仅在 unit 迁移时遍历，不受影响。旧模板加载后字体为 `undefined`，走全局兜底栈，行为与现状一致。

**必须写进 CHANGELOG 的行为变更**：旧模板中单元格若已存有 `fontFamily`，此前被静默丢弃，本次之后会**真正生效**，同一份模板的呈现会发生变化。需在中文 CHANGELOG、英文 CHANGELOG 与 canvas 帮助弹窗（`help-content/changelog.ts`）三处同步。

## 10. 已知限制

1. **不做跨语言字体别名归一**。「宋体」与「SimSun」是同一字体的两个名字：中文系统上 GDI+ 可能报「宋体」，而容器 `fc-list` 报「SimSun」，并集里会各出现一条。**刻意不合并**——别名合并只能合并显示，却会让来源标注失真（服务端实际并没有 SimSun），比重复更糟。`normalizeFontList` 只做大小写与空白的规范化。
2. **由此产生的假阳性**：模板存 `SimSun`、工位机报「宋体」时会误报缺失。因为策略是「校验不阻断」，假阳性只制造提示噪音，不产生打印事故——这正是选择不阻断的额外价值。
3. **客户端清单只代表当前浏览器所在机器**。SDK 连接 `127.0.0.1`，因此清单代表运行该浏览器的工位机。部署形态为「工位机打开宿主页面」时语义完全正确；若「设计机设计、多台工位机打印」，清单对工位机没有预测力。这是部署/管理策略问题，代码不解决，但必须写入文档，且 UI 必须区分「客户端未连接」（本机字体未知）与「已连接且确实没装」两种状态。
4. **字体同源的部署前提不变**：容器需安装模板所用字体，工位机需在客户端系统安装。`docs/中文/指南/三端渲染一致性方案.md:158-159` 的既有要求继续有效。

## 11. 测试

- **core** `packages/print-core/tests/fonts.test.ts`（新增）：`mergeFontSources` 三态（两端可用 / 单端 / 单端不可用）、`normalizeFontList`（去重、大小写、隐藏字体）、`toFontFamilyStack`（含空格族名的引号、空值回落兜底栈）、`findMissingFonts`（元素与单元格均覆盖；**该端 `available: false` 时必须跳过**）。
- **core 渲染**：`html-generator.test.ts` 补单元格 `font-family` 输出与文本元素兜底栈；`table-matrix` 既有测试补 `copyCellStyle` 复制 `fontFamily`。
- **canvas** `packages/print-canvas/src/__tests__/`：新增 `useFontCatalog.spec.ts`（合并与降级）与字体下拉组件 spec（下拉渲染、「当前值不在清单内」用例），对照既有 `TableSettingsGroup.spec.ts` 的写法。
- **render 服务**：`font-catalog.ts` 的解析纯函数单测（喂入固定的 `fc-list` 输出），**不依赖 Playwright**。
- **client**：`platform-fonts.ts` 的解析纯函数单测（三平台输出各一份固定样本）。
- **架构守卫**：收尾跑 `npm run lint:print-architecture`，确认字体栈落在 core、两端仅做采集。

## 12. 受影响文件清单

新增：`core/src/print/fonts.ts`、`core/tests/fonts.test.ts`、`canvas/src/composables/useFontCatalog.ts`、`services/print-render/src/font-catalog.ts`、`clients/print-client/src/main/platform-fonts.ts`。

修改：`core/src/render/{types,data-binder,html-generator,css-builder}.ts`、`core/src/designer/utils/{table-matrix,property-search}.ts`、`canvas/src/components/property/{AppearanceGroup,TableCellGroup}.vue`、`canvas/src/components/{StatusBar,PrintDesigner,PropertyPanel}.vue`、`canvas/src/composables/useHostAdapter.ts`、`services/print-render/src/*`（路由注册）、`clients/print-client/src/main/*`（WS handler）、`packages/print-client-sdk/src/*`、`demo/src/*`（宿主取数示例）、三处 CHANGELOG。

## 13. 验证记录与未验证假设

本设计在成文后做过一轮实证复核，以下区分「已跑真实代码/命令验证」与「仍是假设」。

### 13.1 已实证（本地开发机运行真实代码与系统命令）

| 结论 | 方法 | 结果 |
|---|---|---|
| 单元格 `fontFamily` 不出现在渲染 HTML | 构造含 `tableRows[].cells[].fontFamily='SimSun'` 的模板跑 `generateHtml`，检查 `<td>` 内联样式 | `<td style="text-align:left;vertical-align:middle;padding:1mm;word-break:break-all;border-...">`，**无 font-family** |
| 绑定阶段丢弃单元格 `fontFamily` | `bindData` 后检查 `_renderRows[].cells[].fontFamily` | 全部为 `undefined`；根因是 data-binder 的显式字段映射表未收录该字段 |
| 全局兜底字体栈现状 | `buildPageCss` 实际输出 | `body { font-family: "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif; }` |
| `copyCellStyle` 丢失字体 | 直读 `table-matrix.ts:175-186` | 复制 9 个字段（align/valign/fontSize/fontWeight/color/backgroundColor/borders/padding/wordWrap），**无 fontFamily** |
| 容器内 `fc-list` 可用 | 直读 `Dockerfile:13-14` | 显式安装 `fonts-noto-cjk` 与 `fontconfig` |
| macOS 字体枚举正确取法 | `system_profiler -json SPFontsDataType` | 顶层 `_name` 是文件名；族名须取 `typefaces[].family`；278 文件条目 → 283 去重族名 |
| 隐藏字体确实存在 | 同上 | 大量 `.` 开头族名（`.Al Bayan PUA`、`.Apple Color Emoji UI` 等），印证 `normalizeFontList` 剔除规则必要 |

### 13.2 未验证假设（实现期必须验证，不得当作既定事实）

1. **容器内 `fc-list --format='%{family}\n'` 的实际输出格式**。本地无 Docker，macOS 亦无 `fc-list`，无法验证。实现时在容器内执行 `docker run --rm <镜像> fc-list --format='%{family}\n' | head -20`，确认多族名 TTC（`NotoSansCJK-Regular.ttc`）是否以逗号分隔列出全部族名。若不符预期，降级方案为解析 `fc-list` 默认输出，或改用 `fc-query` 逐文件查询。
2. **Windows GDI+ 枚举的族名形态**。本地为 macOS，无法验证 `[System.Drawing.Text.InstalledFontCollection]` 经 PowerShell 返回的是「宋体」还是「SimSun」——这直接决定第 10 节假阳性的实际范围。须在一台真实中文 Windows 工位机验证，同时确认 `reg query` 降级路径的解析。
3. **`document.fonts.ready` 对系统字体的等待时机**。`dom-executor.ts:19-20` 已等待该 Promise，但对"系统已装字体"通常立即 resolve；本次不引入 web font，故风险低，但"字体未就绪即测量分页"的影响未做实证。

### 13.3 本轮已知的验证缺口

文本元素 `fontFamily` 的输出形态**未做成端到端实证**——探针构造有误（用了 `content` 而非 `formatter`，元素未被渲染出来），该结论改由源码直读得出（第 4 节第 4 项）。若实现时发现 `textStyle()` 之外还有影响文本元素字体的路径，须回头修正本节与第 4 节。
