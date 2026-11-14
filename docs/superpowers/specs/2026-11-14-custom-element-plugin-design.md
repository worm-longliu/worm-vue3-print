# 自定义元素扩展插件体系设计评估与实施计划（非破坏性定稿 v2）

> 日期：2026-11-14　状态：**评估完成 / 决策已定稿（v2 非破坏性修订）/ P0 基线冻结、P1 通用注册表内核、P2 通用渲染与执行器协议、P3 设计器插件能力与属性台 tab、P4 原子切换、P5 三端自动装配与包能力/文档定稿六个阶段全部落地且全量验收全绿 / 仅剩 1.5.0 发版（须用户确认）**
> 范围：`print-core`、`print-contract`、`print-canvas`、`print-mcp`、`print-echarts`、三个出图端与文档
> 本文只做现状评估、方案设计与分阶段计划；实施进展与剩余项见 §8。

## 0. 决策记录

### 0.1 决策总表（v1 → v2）

| # | 决策项 | v1 结论 | **v2 定稿** |
|---|---|---|---|
| D1 | 兼容策略 | 彻底纯插件化，**破坏性变更**，需模板迁移 | **主体彻底零图表知识 + 零迁移 + 零宿主改动（非破坏性）** |
| D2 | 「全部打印能力」边界 | 打印链路全收拢 | **沿用**：设计器画布/属性 → 数据绑定 → 浏览器预览与打印 → 服务端 PDF → 客户端静默打印 → 分页/拼版/批量 → SVG 归一。不含 SVG/PNG 文件导出、更多 ECharts 组件/主题、字体嵌入与度量 |
| D3 | 跨进程注册 | A+B：模板自描述 `plugins` 清单 + 服务端显式白名单注册 | **`plugins` 清单改为可选**；改为「包入口 import 即注册 + 服务端部署白名单」。安全性等价（模板字符串仍无法触发 `import()`），宿主零改动 |
| D4 | MCP / AI 开放时机 | 全部放 P5 | **修订**：完整能力仍放 P5，但 **`print_element_kinds` / `print_draft_template` 的 kinds 动态化必须提前到 P1**，否则 P4 删除 `'chart'` 后 AI 生成侧会退化（见 §0.4） |
| D5 | 类型闸门（新） | — | **legacy 双模式校验**：无 `plugins` 清单 = 宽松（未知 type / option 键只 warning），有清单 = 严格按注册表校验 |
| D6 | TS 类型兼容（新） | — | **声明合并扩展点**：主体只留空 `PluginElementTypeMap`，插件包用 `declare module` 注入类型与字段 |
| D7 | 注册形态（新） | — | **所有插件统一「包入口 import 即注册」+ 惰性配置单例**；chart 无特权，`installEchartsDesignerExtension` 保留兼容别名 |
| D8 | 属性台 tab（新） | 双判据、未定粒度 | **单一「自定义属性」tab + 实例级 `hasProperties` 判据**，DOM 第一、选中默认激活，属性搜索覆盖自定义属性 |
| D9 | 阶段顺序（新） | P0→P5，P1 即删除 | **先建后拆 + P4 原子切换**（消除 P1 删除与 P4 注册之间的渲染断点） |
| D10 | 版本与发布（新） | 1.5.0 / 2.0.0 待定 | **1.5.0 minor 非破坏性**；CHANGELOG 不写迁移指南，Release 无 breaking，旧 API 保留为「兼容别名」不标 deprecated |

### 0.2 v1 → v2 的修订说明

v1 把「架构干净」和「破坏性变更」错误地绑成了因果。v2 保留 D1 的**删除动作**、替换掉它的**模板迁移**：靠 §3.4 legacy 双模式校验、§3.5 声明合并扩展点、§3.6 包入口自动注册三件套，把「主体删掉 chart 知识」与「历史模板零迁移」解耦。

因此以下 v1 内容**整体作废**：

- §0 的 D1 破坏性定性及「D1 的代价必须前置说明」整段；
- §4 全章：模板迁移工具 `migrateLegacyTemplate`、14→13 断言改写（作为「迁移」的理由部分）、deprecated 兼容层、破坏性版本定性、CHANGELOG 迁移指南；
- §5 P1 的「D1 删除动作」与「中间态保护」（chart 一直在 legacy 通道，校验侧不再有误拒风险）；
- §7 风险表前两条（D1 破坏性变更、D1×D4 中间态）；
- §8 原 5 项待确认（全部已在质询中解决，见 §8 新表）。

**保留** v1 的 §2 现状评估（按 §2.5 修正）、§2.4 能力清单、六类注册点框架、§6 验收矩阵主体。

### 0.3 核心结论

当前 `chart` 不是「机制」，而是主体为**单一类型**开的九处硬编码（§2.2）。要实现 R4「引入包配置后即可使用自定义元素」，主体必须改成「只留机制、不留知识」。v2 证明这与「不破坏性变更、兼容历史模板」可以同时成立，代价从「迁移所有模板」转移为「三件套机制 + 校验强度略降 + P4 一次原子切换」。

### 0.4 质询后补充发现的两处隐藏依赖（v2 新增）

1. **AI 生成侧会退化**：`print-mcp/src/tools.ts` L164 的 `print_draft_template` 用 `elementTypeSchema.describe(...)` 生成 JSON Schema **enum**；`print-contract/src/kinds.ts` L27 把 `chart` 写死在静态 `RAW`。主体删 `'chart'` 后，即使 validate/apply/patch 靠 legacy 宽松通道不误拒旧模板，AI 侧会失去类型清单、`z.string()` 又失去 enum 约束。**缓解：P1 就把 kinds 动态化（内置 13 项 ∪ 已注册类型）并让 draft enum 从同一函数生成**；技能文档与提示词仍放 P5。
2. **「零知识」与「旧 API 兼容别名」在符号名上冲突**：B1 要求 `chartRenderer` / `renderCharts` / `ChartSpec` 等旧签名继续可用，B2 要求主体不含 chart 字面量。**实施细化（不改变 §0 决策）**：主体提供通用 `registerLegacyAlias(from, to)` 桥，别名映射由插件描述符以**数据形式**提供（§3.9），主体源码不出现 `chart` 字面量；TS 类型别名由插件的 `declare module` 注入。验收用「主体源码（排除 `__tests__`）grep `chart` 无实现命中」判定。

---

## 1. 需求拆解与验收口径

| # | 诉求 | 验收口径 |
|---|---|---|
| R1 | 完整实现 ECharts 的**全部打印能力**，且**全部能力收拢到单独的包** | 图表相关的类型声明、默认选项、数据绑定、SVG 出图、页面执行器、设计器画布/属性组件、属性搜索项、常量与文档，全部位于 `@worm-vue3-print/echarts`；主体（`core`/`contract`/`canvas`）**零图表专属实现逻辑、零图表字段、零图表分支**（边界见 §3.9） |
| R2 | 改造主体，让用户可以**自定义元素和元素属性** | 主体提供通用注册机制：第三方包可声明新元素类型、该类型专属属性字段（类型/默认值/校验元数据、TS 声明合并），无需改主体源码即可生效 |
| R3 | 自定义元素属性在**属性台新增 tab**；**仅当自定义元素存在自定义属性时显示**；**默认排第一个** | 单一「自定义属性」tab；选中内置元素或该实例无自定义属性时不渲染；渲染时位于 tab 列表首位；选中这类元素时默认激活 |
| R4 | 设计器具备**自定义元素扩展插件能力**，用户引入包并配置后即可使用 | 宿主 `import` 包即自动获得：素材卡、画布渲染、属性编辑、模板校验、AI/MCP 可见性、浏览器预览、服务端 PDF、客户端静默打印，且**不需要改动三个出图端源码、不需要写注册代码**；需要定制时一次 `configurePlugin(id, config)` 即可 |
| R5 | **不破坏性变更、兼容历史模板**（v2 新增，优先级最高） | 历史 `type:'chart'` 模板 JSON **一个字节都不改**、不加 `plugins` 清单；已装包的宿主接入代码零改动；改造前后三端 HTML/SVG 输出等价；`validateTemplateJson` 对旧模板 `ok` 不变 |

**关键判断**：R4 是 R1/R2/R3 的总目标，R5 是所有改造的硬约束。当前四条诉求只在设计器侧部分成立；v2 的难点不在「能不能删」，而在「删完之后旧模板靠什么找到插件」。

---

## 2. 现状评估

### 2.1 已经具备的能力（可复用，不推翻）

- **元素扩展注册表**：`packages/print-canvas/src/composables/useElementExtensionRegistry.ts` L9-66，模块级 `shallowReactive(Map)`，提供 `registerElementExtension` / `unregister` / `get*` / `clear`，`ElementExtension` 有 6 个字段。素材卡（`LeftPanel.vue` L111-118）、画布组件（`BaseElement.vue` L152）、默认选项（`useDesignerState.ts` L422）、属性分组（`PropertyPanel.vue` L287-291）均由它驱动。
- **图表端到端出图链路**（`chart` 已走通三条打印链路）：
  - 契约：`core/render/types.ts` L253-272 `ChartSpec` / `ChartRenderer`（同步、返回 SVG、抛错降级）。
  - 绑定：`core/render/data-binder.ts` L155-262，`$data` 占位 → `_chartOption`。
  - 出图：`core/render/html-generator.ts` L559-580 → `core/print/charts.ts` → `pipeline.ts` L319-366 两趟「收集 → 页面执行 → 回填」。
  - 执行器：`core/print/dom-host-runtime.ts` L45-100 + `core/print/driver.ts` L20-29 + `print-echarts/src/browser/executor.iife.ts` 注入 `__wormDom.renderCharts`。
  - 三端装配：`services/print-render/src/pdf-render.ts` L21-26、`clients/print-client/src/main/print-engine.ts` L66-67、`demo/src/browser-render.ts` L24-30。
- **降级与一致性**：元素级软降级为文本占位、会话级缺 bundle 报 `UNSUPPORTED_RUNTIME` 硬错误（`chart-pipeline.spec.ts` L63-66 钉死）；三端同源 SVG。
- **架构守卫**：`scripts/check-print-architecture.mjs` L15-24 禁止出图端直接依赖 `echarts`。

### 2.2 差距：图表知识散落在主体的九处硬编码（v2 要全部删除/泛化）

| 层 | 文件与行号 | 硬编码内容 |
|---|---|---|
| 类型 | `core/designer/types.ts` L95-101、L438-452 | `ElementType` 联合含 `'chart'`；`ElementOptions` 五个 `chart*` 具名字段 |
| 工厂 | `core/designer/utils/element-factory.ts` L109-125、L132-147 | `createDefaultOptions` 的 `case 'chart'`、`typeMetaMap` 穷尽映射 |
| 契约 | `print-contract/src/schema/element.ts` L7-10、L87-88；`option-meta.ts` L53-55；`kinds.ts` L27 | 14 项 `z.enum`、`chartOption` 结构化覆写、五键元数据、kind 描述 |
| 绑定 | `core/render/data-binder.ts` L107-109、L155-262 | chart 专属分支与 `applyChartData`（轴/饼/散点/系列拆分） |
| 渲染 | `core/render/html-generator.ts` L559-580；`render/chart-spec.ts` | `case 'chart'`、`ChartSpec` 专属端口 |
| 管线 | `core/print/charts.ts`、`pipeline.ts` L330-365、`ports.ts` L27、`driver.ts` L4-29、`dom-host-runtime.ts` L45-100、`browser/driver-iframe.ts` L34-42、`browser/browser-pagination.ts` L32-33 | `renderCharts` 方法名、`chartBundle` 单参数、`chartRenderer` 单渲染器、两趟循环均为图表专用 |
| 设计器 | `canvas/components/PropertyPanel.vue` L14-18 / L80-86 / L287-291、`PrintDesigner.vue` L408-411、`LayerPanel.vue` L80、`PrintHtmlPreview.vue` L62-67、`help-content/features.ts` L21 | 2 个 tab 硬编码、扩展属性组无条件追加在末尾、`activeTab` 二值、`chart:'▤'` 图标写死、`chartRenderer` prop |
| 搜索 | `core/designer/utils/property-search.ts` L229-241 | `PROPERTY_REGISTRY` 中硬编码 `group:'chart'` 5 项，无注册 API |
| 守卫/宿主/文档 | `check-print-architecture.mjs` L21、`pdf-render.ts` L8/25、`print-engine.ts` L17/67、`demo/App.vue` L163/188-189、`AI接入.md` L70、`skills/.../template-schema.md` L61-64、四处 CHANGELOG | 三端直接 import 图表包；文档写死「14 种」；技能文档漏 `chart`；图表能力未进 CHANGELOG |

### 2.3 为什么「引入包配置后即可使用」现在端到端不成立

四道拦截（**按 §2.5 事实修正后重述**）：

1. **契约层唯一硬闸门**：`elementTypeSchema` 是 14 项 `z.enum`（`schema/element.ts` L7-10），且 `printElementType.type` 必填（L114），未知类型 → `level:'error'` → `ok=false`（`validate.ts` L78-95、L119）。`validate.test.ts` L25-29 有回归用例钉死。**注意**：其余 schema（`templateDataSchema` L98、`printElementDataSchema` L120、`elementOptionsSchema` L105）全部是 `.catchall(z.unknown())`，新增 `plugins` 顶层字段或自定义属性键本来就不会被 zod 拒绝。
2. **MCP / AI 侧拦得更靠前**：`print_draft_template` 入参用 `elementTypeSchema.describe(...)` 生成 JSON Schema enum（`print-mcp/src/tools.ts` L164），模型无法传自定义类型；`print_element_kinds` 只返回静态 `ELEMENT_KINDS`（`print-contract/src/kinds.ts` L30-33）；`print_validate_template` / `apply` / `patch` 均回灌 `validateTemplateJson` 并整份拒绝。
3. **渲染端不报错但出纸是错的**：core 渲染侧 `TemplateElement.type: string`（`render/types.ts` L110）对未知类型宽容，但 `html-generator.ts` L581-583 的 `default` 分支会当**普通文本**渲染 `formatter ?? testData`；`createDefaultOptions` 的 `default` 只给裸 base；`bindElement` 不做绑定。
4. **三端装配写死**：`pdf-render.ts` / `print-engine.ts` 硬编码 `loadChartExecutorBundle()`；浏览器侧要宿主手写 `createChartRenderer()` 并传给 `renderHtmlPages` 与 `PrintHtmlPreview`。新增任意扩展都必须改这三个端。

另有两个机制性缺陷：

- **注册表是模块级单例且只在浏览器设计器侧注册**。服务端/客户端是独立进程，注册表为空 → 校验与分派都不认识插件类型。注册信息不随模板 JSON 传递，这是 R4 的最大隐藏障碍（§3.6 / §3.7 解决）。
- **属性台无 tab 抽象**：2 个 tab 与 12 个分组全部硬编码；扩展属性组件只是追加在「元素属性」tab 末尾，`extensionPropertyComponent`（`PropertyPanel.vue` L287-291）仅判断「该类型是否注册了 `propertyComponent`」，既不判断元素实例是否真有自定义属性，也不参与排序/搜索/折叠态。

### 2.4 「全部打印能力」清单（D2 边界）

| 能力 | 现状 | 本轮归属 |
|---|---|---|
| 设计器画布预览 / 属性编辑（图形化 + JSON） | 已有 | 包内，注册方式改为可配置 |
| 浏览器预览 / 打印 | 已有，需宿主手传 `chartRenderer` | 包内 + 通用 renderer 注册表 |
| 服务端 PDF / Electron 静默打印 | 已有，需硬编码注入 bundle | 包内 + 通用 bundle 收集 |
| 数据绑定（`$data` 占位、类目/数值/系列字段） | 已有但**在 core** | **迁到包**（`binding.bind`） |
| 分页 / 拼版 / 批量 / 多模板 | 已有，`chartRenderer` 逐层透传 | core 泛化为多渲染器 |
| 字体 `fontFamily` 合并、SVG 归一 | 已有 | 包内 |
| 图表类型/组件注册 | 仅 5 类 + 5 组件 | 包内改为可配置 `echarts.use` |
| 插件自动装配（宿主零改动接三端） | **缺失** | 核心目标 |
| 插件开发文档 / 脚手架 / 测试样板 / 类型再导出 | **缺失** | 核心目标 |
| SVG/PNG 文件导出、更多 ECharts 组件/主题/大数据/geo、字体嵌入度量 | **缺失** | **D2 明确本轮不做**，列后续需求 |

### 2.5 v2 事实核对补充（2026-11-14 质询中逐条读码确认）

| 事实 | 位置 | 对方案的影响 |
|---|---|---|
| 历史模板是 `type:'chart'` + 五个 `chart*` 键，**没有** `plugins` 顶层字段 | `demo/src/samples/sales-chart.ts` L8/38-58、`echarts-test-case.ts` | `plugins` 清单只能**可选**；旧模板天然豁免，迁移工具取消 |
| 契约**唯一**硬闸门是 14 项 `z.enum`；其余全是 `.catchall(z.unknown())` | `schema/element.ts` L7-10 / L105 / L114-120、`schema/template.ts` L98 | 加 `plugins` 顶层字段、加自定义属性键**本来就不会被拒**；`scanKeys` 只给 warning 且不影响 `ok`（`validate.ts` L102-104）。v1 §3.2② 说要「放开 `ElementOptions`」在契约层是多余的，只有 TS 类型层需要 |
| 五个 `chart*` 键当前在 `OPTION_KEYS` 里 | `print-contract/src/option-meta.ts` L54-55 | 删除后历史模板会凭空多 5 条「契约未知键」warning；**legacy 宽松模式需一并豁免未知 option 键**，否则校验输出退化 |
| 三端**今天就必须装 echarts 包** | `pdf-render.ts` L8/25、`print-engine.ts` L17/67、`demo/browser-render.ts` L4/9 | v1 把「未装插件宿主不能打印」算作破坏性代价是**高估**：现状裸宿主本来就编译不过。兼容真正要保证的是「已装包宿主 + 原样模板 JSON + 零迁移 + 出图一致」 |
| `print-echarts` 把 core/canvas/vue 列为 **peerDependencies** | `packages/print-echarts/package.json` L48-52 | 「插件 → 主体」依赖方向合法，架构守卫不拦；包入口可安全 import 主体注册 API |
| `ElementOptions` 是 **interface**；渲染侧 `type` 已是 `string` | `core/designer/types.ts` L273、`core/render/types.ts` L110 | 声明合并可行；渲染层无需为开放类型改造 |
| `createElementFactory('chart')` 的 `'chart'` **只是 id 前缀** | `demo/src/samples/element-helper.ts` L37 | v1 相关推断有误；真正的 TS 落点是 L13-28 的 `TYPE_TITLES: Record<ElementType,string>`、`el('chart', {...})` 与五个字段 |
| 删 `'chart'` 会连锁打断所有 `Record<ElementType,T>` 穷尽映射 | `element-helper.ts` L13-28、`element-factory.ts` L132-147、`LayerPanel.vue` 图标表 | v1 §2.2 只列 `typeMetaMap` 一处，**漏记这类泛型穷尽性连锁**；这是「零宿主改动」最大隐藏破坏面，由 §3.5 解决 |
| 属性台**折叠态**也是硬编码两个按钮；扩展组不受 `filteredGroups` 控制 | `PropertyPanel.vue` L6-7、L80-86 | R3 改造必须同步折叠态；迁入 tab 后接上属性搜索 |
| `print_draft_template` 的 enum 来自 `elementTypeSchema.describe(...)` | `print-mcp/src/tools.ts` L164；`print-contract/src/kinds.ts` L27/30-33 | 见 §0.4：P1 必须提前 kinds 动态化，否则 AI 生成侧在 P4 后退化 |
| 版本号同步远不止四处 | 9 个 `package.json` 全为 `1.4.8` + 6 处内部 `^1.4.8` 引用 + 根 `package-lock.json`（20 处）、`demo/package-lock.json`（8 处） | v1 §4.7 的「版本号四处 + demo lock」**不全**；见 §4.7 |

---

## 3. 目标架构

**原则：主体只留机制，不留知识；插件自带全部知识；历史模板靠通用 legacy 通道自动找到插件。** 主体（`core`/`contract`/`canvas`/`mcp`）提供六类通用注册点；一个插件用一份描述符把全部能力登记进去；三个出图端从注册表自动装配，不再认识任何具体类型。改造完成后 `chart` 与第三方 `signature`、`qrcode2` 等完全同构，无任何特权。

### 3.0 三件套（v2 的关键）

```
① legacy 双模式校验  → 历史模板无 plugins 清单也能通过契约闸门
② 声明合并扩展点    → 装了包的宿主自动拿回完整 ElementType 与自定义字段类型
③ 包入口自动注册    → 宿主不写注册代码，进程内注册表天然有 chart 描述符
```

现状能打印图表的宿主必然已 `import` 图表包入口（`chartRenderer` / `chartBundle` 都由包提供，见 §2.5），因此 ③ 不要求任何宿主改动。

### 3.1 插件描述符（草案）

```ts
// 由主体（core/designer）导出，纯 TS，无 Vue、无渲染库
export interface PrintElementPlugin {
  kind: {
    id: string                         // 插件标识，如 '@worm-vue3-print/echarts'
    version: string                    // 写入 plugins 清单，服务端据此校验
    type: string                       // 元素类型，如 'chart' / 'signature'
    label: string
    icon?: string
    fixedHeight?: boolean              // 分页/测量口径：固定高、禁 autoHeight
    blocked?: boolean                  // 是否禁止 AI 生成
    requiredOptionKeys?: string[]
    defaultOptions?: (partial?: Partial<ElementOptions>) => Partial<ElementOptions>
    optionMeta?: Record<string, OptionMeta>   // 自定义属性：类型/区间/默认值
    searchGroups?: PropertyGroupDef[]        // 属性搜索项
  }
  /** 旧 API 兼容别名（数据形式，主体零字面量，见 §3.9） */
  legacyAliases?: Record<string, string>
  designer?: {                         // Vue 组件由 canvas 侧注册
    canvasComponent: Component
    propertyTab?: {
      id: string
      label: string
      icon?: string
      component: Component
      hasProperties?: (element: RuntimeElement) => boolean  // R3 实例级显示判据
    }
  }
  binding?: {
    bind(options: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown>
  }                                    // 取代 core 里的 chart 绑定分支，产出运行时字段
  render: {
    createRenderer?: () => ElementRenderer       // 进程内同步出图（浏览器预览）
    executorBundle?: () => ExecutorBundle        // 页面 IIFE（服务端 / Electron）
    html(spec: ElementRenderSpec): string        // 由主体统一分派调用
  }
  /** 惰性配置：描述符在调用时读取，不改注册表条目 */
  config?: PluginConfig
}

export function defineElementPlugin(p: PrintElementPlugin): PrintElementPlugin { return p }
export function registerElementPlugin(p: PrintElementPlugin): () => void
export function getElementPlugin(type: string): PrintElementPlugin | undefined
export function getElementPlugins(): readonly PrintElementPlugin[]
export function configurePlugin(id: string, config: Partial<PluginConfig>): void
export function registerLegacyAlias(from: string, to: string): void
```

**R3 判据**：插件 `designer.propertyTab` 存在即具备显示资格；`hasProperties` 缺省视为 `true`。单一 tab 按选中元素类型切换内部组件（§3.8）。

`chart` 成为**第一个、也是示范性**的插件：包入口 import 时自动 `registerElementPlugin(defineElementPlugin({...}))`，一次性登记全部能力；`installEchartsDesignerExtension(config?)` 保留为兼容别名，内部转发到 `configurePlugin` + 设计器注册。用户自定义元素照抄这个包即可。

### 3.2 六类通用注册点与改造映射

| 注册点 | 现状 | 目标（v2） | 主要落点 |
|---|---|---|---|
| ① 元素种类 | `ElementType` 封闭 14 项 + 4 处白名单 | **内置 13 项 + 运行时注册表 + 声明合并扩展点**；`type` 放开为 `string`；`chart` 由插件注册后才存在 | `core/designer/types.ts`、`element-factory.ts`、`contract/schema/element.ts`、`kinds.ts`、`print-mcp/tools.ts` |
| ② 元素属性 | `ElementOptions` 严格 interface 无 index signature；`OPTION_META` 编译期必填 | 删五个 `chart*` 具名字段；插件以 `optionMeta` 声明专属属性 + `declare module` 注入 TS 字段；契约按注册态强校验 | `core/designer/types.ts`、`contract/option-meta.ts`、`schema/element.ts`、`validate.ts` |
| ③ 数据绑定 | `data-binder.ts` 里 chart 专属分支 | 删除 chart 分支；通用 `bindElement` 按 `type` 查插件 `binding.bind` | `core/render/data-binder.ts` |
| ④ 出图渲染 | `case 'chart'` + `ChartRenderer` + `renderCharts` 硬编码 | 通用 `ElementRenderSpec` / `ElementRenderer`；`html-generator` 的 `default` 分支查插件；`renderAssets(specs)` 取代 `renderCharts`；bundle 由「单个」改为「列表」 | `core/render/*`、`core/print/*`、`core/browser/*` |
| ⑤ 设计器扩展 | `ElementExtension` 6 字段 | 升级为完整 plugin 注册；素材卡 / 画布 / 图层图标 / 预览 / 搜索全部读注册表（删除 `chart:'▤'`、`group:'chart'` 硬编码） | `canvas/composables/useElementExtensionRegistry.ts` 及 5 个组件 |
| ⑥ 属性台 tab | 2 个硬编码 tab | tab 列表数据驱动；单插件 tab 条件显示 + 首位 + 默认激活 + 折叠态同步 | `canvas/components/PropertyPanel.vue`、`PrintDesigner.vue` |

### 3.3 打印链路（目标）

```
模板 JSON（可选 plugins 清单 + type + 自定义属性）
  → 进程内注册表（包入口 import 即注册；服务端按部署白名单）
  → validateTemplateJson：legacy 双模式（§3.4）
  → bindData → 插件 binding.bind → 运行时字段
  → generateHtml → html-generator 分派 → 插件 render.html(spec)
  → pipeline 两趟：收集 ElementRenderSpec[] → session.renderAssets → 回填
  → 测量 / 分页 / 拼版 / 批量 → 三端出纸
```

三端装配改为：`createDomHostRuntime(factory, bundles[])`，`bundles` 由**插件注册表自动收集**（每个插件的 `executorBundle()`），按 `version` 幂等注入；浏览器侧 `renderHtmlPages(..., { renderers })` 由注册表收集 `createRenderer()`。

### 3.4 legacy 双模式校验（D5，解决唯一硬闸门）

`elementTypeSchema` 从 14 项 `z.enum` 改为 `z.string()`，模板级 `superRefine` 按「是否声明插件」分派：

| 模式 | 触发条件 | 未知 `type` | 未知 option 键 | 缺插件 |
|---|---|---|---|---|
| **legacy（宽松）** | 模板**无** `plugins` 顶层字段 | warning，不判 error | 不告警（避免历史 `chart*` 五键凭空冒 5 条 warning） | 沿用现状降级：元素级文本占位 + 会话级 `UNSUPPORTED_RUNTIME` |
| **strict（严格）** | 模板**有** `plugins: [{id, version}]` | 只放行「内置 13 项 ∪ 已注册类型」 | 按插件 `optionMeta` 强校验 | 明确 `MISSING_PLUGIN` 硬错误，**不静默出空纸** |

- `plugins` 清单是**可选**字段；历史 `chart` 模板天然豁免，不需要迁移工具。`templateDataSchema` 本就 `.catchall(z.unknown())`（§2.5），加字段不破坏旧模板。
- 校验与渲染共用 `getElementPlugin(type)`，避免两端判定漂移。
- **代价（必须接受）**：`validate.test.ts` L25-29 的「未知 type 必 error」断言放宽；AI 拼错 type 的拦截从 error 降为 warning。**缓解**：对「与任一内置类型编辑距离 ≤ 1」的未知 type 仍报 error（通用规则，不含图表知识），把明显拼写错误挡住；strict 模式下无任何放宽。
- 服务端仍**禁止**按模板字符串动态 `import()`；白名单语义由「部署了哪些包」承载，见 §3.7。

### 3.5 声明合并类型扩展点（D6，解决零宿主改动）

```ts
// core/designer/types.ts —— 主体侧只有空扩展点，零图表知识
export interface PluginElementTypeMap {}
export type BuiltinElementType =
  | 'text' | 'image' | 'longText' | 'table' | 'flowList'
  | 'hline' | 'vline' | 'rect' | 'oval'
  | 'barcode' | 'qrcode' | 'html' | 'pageNumber'          // 13 项
export type ElementType = BuiltinElementType | keyof PluginElementTypeMap
// ElementOptions 保持 interface（designer/types.ts L273），可被合并

// print-echarts/types.d.ts —— 插件侧注入
declare module '@worm-vue3-print/core/designer' {
  interface PluginElementTypeMap { chart: true }
  interface ElementOptions {
    chartOption?: Record<string, unknown>
    chartDataSource?: string
    chartCategoryField?: string
    chartValueFields?: string[]
    chartSeriesField?: string
  }
}
```

效果：装了包的宿主自动拿回完整 `ElementType`，`Record<ElementType,T>` 穷尽映射（demo `TYPE_TITLES` L13-28、`typeMetaMap`、`LayerPanel` 图标表、第三方宿主自有代码）**零改动**；`el('chart', { chartOption })` 零改动；未装包宿主 `ElementType` 为 13 项（B1 已豁免裸宿主）。

**前置条件与代价**：插件 `.d.ts` 必须被宿主 tsconfig 解析到（`package.json` 的 `types` 入口覆盖到，且宿主至少 `import` 过一次包——现状能打印图表的宿主都满足）；`print-contract/src/schema/element.ts` L12-17 的双向漂移闸门（`Exclude<ElementType, ...>`）必须动态化。P0 需补一条类型回归测试锁住这条链路。

### 3.6 通用自动注册与惰性配置（D7，解决 R4）

- **所有插件一视同仁**：包入口模块顶层执行 `registerElementPlugin(defineElementPlugin({...}))`。不做「仅 chart 隐式、第三方显式」的两套机制，也不把注册时机绑在 `createChartRenderer()` / `loadChartExecutorBundle()` 这些旧 API 调用点（新插件没有旧 API，会立刻分裂）。
- **注册表跨进程**：改为挂在 `globalThis` 上的单一实例 + 固定 Symbol key，规避 monorepo / 打包重复导致的 core 双实例注册漂移；注册表条目带 `version` 用于幂等与去重。
- **惰性配置**：`configurePlugin(id, config)` 只写配置单例，描述符的 `defaultOptions` / `binding` / `render` 在**调用时**读它。无注销重注册、无时序竞态、无 Tree-shaking 误删注册的风险；用户可零配置用默认，也可在启动处一次覆盖（默认尺寸/图表类型/组件 `echarts.use` 注册表/配色/示例数据/自定义属性默认值）。
- **三端语义**：服务端 `pdf-render.ts`、Electron `print-engine.ts`、浏览器 `browser-render.ts`、设计器 `App.vue` 今天都有包入口 import，注册天然发生；服务端按部署白名单决定装哪些包，模板字符串无法引入新代码。

### 3.7 跨进程注册（D3 v2）

- **A 模板自描述（可选）**：`plugins: [{ id, version }]` 只作为「启用 strict 校验 + 缺插件硬错误」的开关，不再是校验通过的前置条件。
- **B 服务端注册**：由「显式 `registerElementPlugin(...)` 调用」改为「包入口 import 即注册」，白名单语义由部署依赖承载；禁止按模板字符串构造模块路径 `import()` 的规则不变。
- v1 已否决的 C（纯数据驱动）仍否决：承载不了 ECharts 这类重渲染库。

### 3.8 属性台 tab（R3，精确落点）

- **单一「自定义属性」tab**：所有插件共用一个 tab，按选中元素类型切换内部组件（与现有 `extensionPropertyComponent` L288-290「一类型一组件」模型一致），避免「注册 3 个插件多出 2 个空 tab」与「默认排第一个」的多插件排序歧义。
- **实例级判据**：`hasCustomProperties = !!plugin?.designer?.propertyTab && hasProperties(element)`；选中内置元素或该实例无自定义属性 → tab 不渲染。插件注册 `propertyTab` 只是取得显示资格，非常驻理由。
- **落点**：`PropertyPanel.vue` L4-8（折叠态两个按钮也要加第三个）、L14-18（tab bar，插件 tab 插到 DOM 第一位）、L19/L92（pane `v-show`）、L80-86（扩展组件整体迁入新 pane）、L226/L237（搜索/折叠态）、L536-538（`activeTab` 由二值扩为三值）；`PrintDesigner.vue` L408-411（`watch(selectedElement)` 默认激活逻辑）、L433/L447/L525 逐一复核。
- **属性搜索**：迁入 tab 后接上 `filteredGroups`，使自定义属性与内置属性一致可搜（现状 L80-86 不受控制，搜索命中不到）。
- 默认值保持 `'page'` 兼容无选中态，避免撞既有 `activeTab:'element'|'page'` props 断言。

### 3.9 「零知识」的边界与兼容别名桥（§0.4 实施细化）

B1 要求旧 API 继续可用，B2 要求主体不含 chart 字面量，两者在符号名上冲突。定稿解法：

- 主体提供通用 `registerLegacyAlias(from: string, to: string)`，把 `chartRenderer` → `renderers`、`renderCharts` → `renderAssets`、`chartBundle` → `bundles[0]`、`loadChartExecutorBundle` → `executorBundles` 等**映射以数据形式写在插件描述符的 `legacyAliases` 里**；主体只做通用查表转发，源码不出现 `chart` 字面量。
- TS 侧的 `ChartSpec` / `ChartRenderer` / `ElementExtension` 等类型别名由插件 `declare module` 注入或由包重新导出（§3.5 同机制）。
- 旧函数 `createChartRenderer()` / `loadChartExecutorBundle()` / `installEchartsDesignerExtension()` / `registerElementExtension()` / `renderCharts` **全部保留且行为不变**，标注为「兼容别名」而**不标 deprecated**（D10）。
- **验收判据**：主体源码（排除 `__tests__`）grep `chart` 无实现命中；命中只允许出现在「通用桥的注释」或由注册表数据驱动的转发代码里。

---

## 4. 兼容策略（非破坏性，替代 v1 迁移章节）

### 4.1 兼容边界（D1 v2）

**零迁移 + 零宿主改动，不保证裸宿主**：历史模板 JSON 原样（不改写字段、不加 `plugins` 清单）、已装包的宿主接入代码不动、改造前后三端出图逐字一致；「未装 echarts 包的宿主也能打印图表」不列为要求——现状本就不成立（三端硬编码 import），硬要满足会逼主体保留图表实现，与 R1 冲突。

### 4.2 行为矩阵

| 场景 | 校验 | 渲染 |
|---|---|---|
| 历史 `chart` 模板 + 已装包（**R5 主场景**） | legacy 宽松，`ok=true`、无新增 warning | 注册表命中 chart 插件 → 与改造前等价出图 |
| 历史 `chart` 模板 + 未装包 | legacy 宽松，`ok=true` | 沿用现状：元素文本占位 + 会话级 `UNSUPPORTED_RUNTIME` |
| 自定义元素模板 + 已装包 + 声明 `plugins` | strict 强校验通过 | 正常出图 |
| 自定义元素模板 + 未装包 + 声明 `plugins` | `MISSING_PLUGIN` 硬错误 | 不出空纸 |
| 自定义元素模板 + 未装包 + 无清单 | legacy 宽松，只 warning | 文本占位（不判死，保证 P1–P4 中间态不误拒） |

### 4.3 公开 API 兼容别名清单（不标 deprecated）

`registerElementExtension`、`installEchartsDesignerExtension(config?)`、`createChartRenderer()`、`loadChartExecutorBundle()`、`renderCharts`、`ChartSpec` / `ChartRenderer`、以及 `renderHtmlPages` / `PrintJob` / `PrintHtmlPreview` 的 `chartRenderer` 入参，全部保留并转发到新通用 API（§3.9）。**无限期保留**，不设置「一个主版本周期后移除」，避免制造并不存在的迁移压力。

### 4.4 测试断言影响（澄清 v1 的一处混淆）

v1 把「14→13 断言改写」归因于迁移，v2 澄清：**由于 D1 仍删除 `'chart'`，这几处断言依然要改，但原因不同**——

- `draft.test.ts` L80、`tools.test.ts` L55 的 `toHaveLength(14)` → 改为**注册态断言**（未注册 13 / 注册 chart 后 14）；
- `option-meta.test.ts` L6-9、`element-factory.spec.ts` L7-10 的 `ALL_TYPES` 同步为注册态；
- `ElementExtension.spec.ts` L82-102 素材卡数量改为「未注册 / 已注册」对比；
- `dom-executor.spec.ts` L230-234 的 `EXECUTOR_TARGETS` key 集合改为泛化后的方法集合；
- `validate.test.ts` L25-29「未知 type 必 error」→ 改为「legacy 模式 warning / strict 模式 error / 编辑距离 ≤1 仍 error」三态断言。

### 4.5 降级语义与分层边界不变

元素级文本占位、会话级 `UNSUPPORTED_RUNTIME` 语义保留（`chart-pipeline.spec.ts` L63-66）；新增 `MISSING_PLUGIN` 场景。core 不得依赖 Vue / echarts；canvas 不得依赖 echarts；出图端不得直接 import 渲染库。

### 4.6 构建前置

本地 `core`/`canvas` dist 比源码旧（缺 `ChartSpec`/`ChartRenderer`/`registerElementExtension` 导出），`vue-tsc` 会报存量错误。任何类型检查前先重建 dist：备份各包 `dist/` 到 `/tmp`，再 `CODEBUDDY_SAFE_DELETE_ENABLED=0 npm run build -w <pkg>`。

### 4.7 版本与发布（D10，v1 §4.7 事实修正）

- 非破坏性新增公开插件 API 与包能力 → **1.5.0 minor**；不跳 2.0.0（无 breaking），不用 patch（新增公开 API 不符合语义化版本）。
- **同步范围（实测）**：9 个 `package.json` 的 `version`（根 + core/canvas/common/contract/mcp/echarts/print-skills + demo）、6 处内部 `^1.4.8` 依赖/peer 引用、`package-lock.json`（20 处）、`demo/package-lock.json`（8 处）。v1 写的「四处 + demo lock」会漏掉 5 个包与根 lock。
- **CHANGELOG 四处**：`docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`、`packages/print-canvas/src/help-content/changelog.ts`、`packages/print-common/src/shell/help-content/changelog.ts`（逐字副本，有测试断言强制一致；改 canvas 那份后以它为基准重写 common 那份）。内容写「新增自定义元素插件机制 / ECharts 能力归位至独立包 / 历史模板零迁移」，**不写迁移指南**。
- `.github/release/notes.md` 必须在**打标签之前**写好（release.yml checkout 标签所指提交再读 `body_path`）；Release 正文不写 breaking change；`origin`(Gitee) 与 `github` 双推；提交前 `git config user.name` 确认身份。

---

## 5. 分阶段实施计划（D9 重排：先建后拆 + P4 原子切换）

> 每阶段独立可验收，前一阶段不绿不进入下一阶段；测试按 workspace 逐个跑（全量 `npm test` 会被信号杀掉）。
> **v2 关键约束**：P1–P3 **只加机制、不删任何 chart 知识**，所有现有分支作为 fallback 保留；P4 一次性完成「删知识 + 包注册 + 声明合并 + 三端装配」，消除 v1 的渲染断点。

### P0 基线冻结（已完成 / 全绿，2026-11-14）

> 退出条件已达成：历史模板零迁移回归网、三端 fake driver 冒烟、属性台现状断言、类型穷尽闸门全部落地并通过；P1 可启动。

**资产与回归网（全部入仓）**：

- 本文 v2 定稿。
- dist 重建：`core` → `canvas` → `echarts` 依次 `npm run build` **全部 exit 0**（core DTS 36.6s，canvas / echarts 的 `vue-tsc` 均通过），确认此前 `vue-tsc` 红字只是 dist 陈旧而非代码错误。备份 `/tmp/wvp-dist-backup-20261114-113340/`；`dist/client/index.js`、`dist/executor.iife.global.js` 等关键产物齐全。
- 历史模板样本（`docs/superpowers/specs/baseline/`）：`sales-chart.legacy.json`（2 个 chart 元素）、`echarts-test-case.legacy.json`（4 个），`template` + `data` 原样导出，**均无 `plugins` 字段**。
- 校验基线：同名 `.validate-baseline.json`，改造前 `validateTemplateJson` 两份均为 `ok=true, issues=0, unknownKeys=0`。**R5 硬性判据**：改造后必须仍是零告警；legacy 宽松模式需一并豁免未知 option 键，否则删掉 `OPTION_KEYS` 五键后旧模板会凭空冒 5 条 warning（§2.5）。
- HTML/SVG 基线：同名 `.html-baseline.html`，用重建后的 dist 走 `bindData` + `generateHtml(测量趟)` + `createChartRenderer()` 真实出图，产物 8838 / 24375 字节，内联 `<svg>` 数 2 / 4，无文本占位。
- 纯渲染器回归：`packages/print-echarts/src/__tests__/legacy-baseline.test.ts`（2 用例）钉住「无 `plugins` 字段 + SVG 数量 + HTML 逐字一致」；`npm test -w @worm-vue3-print/echarts` **4 文件 / 14 用例全绿**。该用例刻意沿用旧 API，同时钉住 §4.3 兼容别名契约。
- **三链路行为基线**：`packages/print-core/src/print/__tests__/three-end-baseline.spec.ts`（8 用例），复用既有 `fake-driver.ts` 与两份真实历史样本，覆盖 `prepareDocument`（浏览器预览 / 静默打印 HTML 路由）、`renderPdf`（服务端 PDF / 验证件）、调用方 `chartRenderer` 覆盖旁路、缺 `chartBundle` 报错；断言最终 HTML 与 `fake.documents.at(-1)` 的 SVG 数、`evaluate:renderCharts` 恰好 1 次、两份执行器按 version 注入 2+1 次。
- **PDF 端宿主冒烟**：`services/print-render/src/chart-pdf.baseline.test.ts`（4 用例）+ `vitest.baseline.config.ts`（刻意不加载 `vitest.setup.ts` 的 Chromium 预热），复刻 `pdf-render.ts` L21-26 的三参数装配；默认 `vitest.config.ts` 已 exclude `*.baseline.test.ts`，原 `npm test -w @worm-vue3-print/render` 行为不变，基线走 `npm run test:baseline -w @worm-vue3-print/render`。
- **静默打印端宿主冒烟**：`clients/print-client/src/main/chart-print.baseline.test.ts`（3 用例），用 `PrintEngine` 的 `deps.runtime` 注入 fake driver 装配，真实走 `submit(templateJson)` → core 管线 → `printHtmlDocument`；覆盖 HTML 路由、保留验证件 PDF、缺执行器失败记录。
- **属性台现状断言**：`packages/print-canvas/src/__tests__/PropertyPanel-collapsed.spec.ts`（5 用例），钉住折叠态 3 个 `.pc-btn`（1 展开 + 2 内置 tab，按 title 过滤后恰好 2 个）、无「自定义属性」、展开态 2 个 `.pd-tab` 顺序为「元素属性 → 页面属性」、高亮与 emit 行为。**P3 的改造起点**。
- **类型穷尽闸门**：`packages/print-canvas/src/__tests__/element-type-exhaustiveness.test-d.ts`，`satisfies Record<ElementType,string>`（不多）+ `Record<ElementType,string>` 赋值（不少）双向锁住 14 项穷尽映射。命名 `.test-d.ts` 使其不被 vitest 收集（canvas 只收 `*.spec.ts`）、被 `pretest: vue-tsc --noEmit` 检查、`tsconfig.build.json` 已 exclude `__tests__` 故不污染 dist。P4 装包后声明合并链路的完整验证仍需补 demo 侧 typecheck。

**验收结果（逐 workspace 独占运行）**：

| workspace | 命令 | 结果 |
|---|---|---|
| core | `npm test -w @worm-vue3-print/core` | 91 文件 / 1363 用例全绿（含新增 8） |
| canvas | `npm test -w @worm-vue3-print/canvas` | `pretest: vue-tsc --noEmit` 通过 + 82 文件 / 801 用例全绿（含新增 5） |
| print-client | `npm test -w @worm-vue3-print/print-client` | 26 文件 / 212 用例全绿（含新增 3） |
| render（基线专用） | `npm run test:baseline -w @worm-vue3-print/render` | 1 文件 / 4 用例全绿，25s，无需 Chromium |
| echarts | `npm test -w @worm-vue3-print/echarts` | 4 文件 / 14 用例全绿（P0 前段已跑） |

- **类型闸门负向验证**：把 fixture 的 `chart` 临时改成 `chartBogus` 后 `vue-tsc --noEmit` 退出码 2，精确报 `TS2353`（多余键）+ `TS2741`（缺 `chart`）；改回后退出码 0、零输出。证明闸门不是永不红的摆设。
- **踩坑**：并行同时跑 4 个 workspace 的测试会让 canvas 的 forks worker 启动超时（20 个 `Timeout waiting for worker to respond`、62 文件 / 501 用例通过但 exit 1、零断言失败）。**测试必须逐 workspace 独占运行**，与 §5 开头注记一致；独占重跑后 82 文件 / 801 用例全绿。
- 说明：全仓库原本无 `.snap` / `toMatchSnapshot`，本阶段没有引入 vitest 快照机制，而是用「基线 HTML 逐字比对 + fake driver 断言」达到同等可判等价效果。两端宿主装配行（`pdf-render.ts` L21-26 / `print-engine.ts` L66-68）是 P4 的 diff 复核点，行为等价由上述冒烟钉住。

### P1 通用注册表内核（已完成 / 全绿，2026-11-14）

> 严格遵循 D9「先建后拆」：**没有删除任何 chart 知识**。`ElementType` 仍含 `'chart'`、五个 `chart*` 字段、`OPTION_META` 五键、14 项 `z.enum`、三端装配一行未动。

**落地清单**

- `core/designer/element-plugin-registry.ts`（新）：`defineElementPlugin` / `registerElementPlugin`（返回只注销自己这一版的句柄）/ `getElementPlugin(type)` / `getElementPluginById(id)` / `getElementPlugins()` / `getElementPluginTypes()` / `configurePlugin` + `getPluginConfig`（惰性、可早于注册、快照隔离）/ `registerLegacyAlias` + `resolveLegacyAlias` + `getLegacyAliases` / `clearElementPlugins`。状态全部挂在 `Symbol.for('worm-vue3-print.element-plugin-registry.v1')` 的 `globalThis` 单例上（§3.6），core 双实例不漂移；描述符含 `kind.optionMeta` / `binding` / `render` / `designer.propertyTab.hasProperties` / `legacyAliases` 等 P2–P4 所需扩展点。
- `core/designer/types.ts`：加**空** `PluginElementTypeMap` 与 `BuiltinElementType`（仍含 `'chart'`），`ElementType = BuiltinElementType | keyof PluginElementTypeMap`；`ElementOptions` 保持 interface；`TemplateData` / `MultiPageTemplateData` 加可选 `plugins?: TemplatePluginDeclaration[]`。`designer/index.ts` 与主入口 `index.ts` 均导出注册表。
- `print-contract/schema/element.ts`：`createPrintElementDataSchema(typeSchema)` 工厂 + `legacyPrintElementDataSchema`；双向漂移闸门改盯 `BuiltinElementType`（P4 插件注入的类型由注册态校验，静态 enum 不再覆盖）。
- `print-contract/schema/template.ts`：`pluginsDeclarationSchema`（`[{id, version?}]`，可选）、`createTemplateDataSchema(elementSchema)` / `createMultiPageTemplateDataSchema(pageSchema)` 工厂，默认导出保持原形状。
- `print-contract/validate.ts`：按「顶层（含多页 wrapper 与其各页）是否出现 `plugins` 键」分派 legacy / strict。**实现细化**：文档草案写的是「模板级 `superRefine`」，但 zod 的 `z.enum` 在 parse 阶段就拒绝未知 type、`superRefine` 无法覆盖，因此改为「按模式动态构造 type schema」——strict 用 `z.enum(内置 ∪ 已注册)`，legacy 用 `z.string()` 后由 `scanUnknownTypes` 分级判定。
  - legacy：未知 type 只 warning；**大小写差异 / 一次替换增删 / 一次相邻转置**仍报 error（`Text`→`text`、`tabel`→`table` 命中，`validate.test.ts` L25 的断言保持有效）；`scanKeys` 的已知键集合并入「插件 `optionMeta` 声明键」。
  - **实现细化**：草案写「legacy 豁免未知 option 键告警」，实际采用更窄的「只豁免插件声明键」——既保证 P4 删掉 `OPTION_KEYS` 五键后历史模板零新增告警（R5），又保留对 AI 幻觉键的提示，`validate.test.ts` L143 无需改写。
  - strict：未知 option 键升级为 error；`plugins` 清单缺插件报 `MISSING_PLUGIN`、版本不符报 `PLUGIN_VERSION_MISMATCH`（不静默出空纸）。
- `print-contract/kinds.ts`：`getElementKinds()` / `getElementKindTypes()` 返回「内置 `ELEMENT_KINDS` ∪ 已注册插件类型」，同名以内置说明优先；`ElementKindInfo.type` 放宽为 `string`。
- **D4 前置（§0.4）已落地**：`print-mcp/tools.ts` 的 `print_element_kinds` 改为动态返回；`print_draft_template` 抽成 `draftInputSchema()`，`type` 的 enum 由 `getElementKindTypes()` 生成，与 kinds 同源。`ToolDef` 新增可选 `getInputSchema`、`server.ts` 的 `tools/list` 优先取动态 schema，插件注册后**无需重建工具表**即可刷新 enum。`draft.test.ts` / `tools.test.ts` 的 `toHaveLength(14)` 已改成注册态集合断言（§4.4），P4 删 chart 后自动适配。

**新增回归用例（五组）**：`core/designer/element-plugin-registry.test.ts`（11 用例：恒等/校验、注册注销幂等、同 type 覆盖、惰性配置、别名桥、`globalThis` 单例）、`contract/__tests__/plugin-validation.test.ts`（13 用例：两份真实历史样本与 P0 校验基线逐项等价、legacy warning / 拼写 error / 插件键豁免、strict MISSING_PLUGIN / 版本不符 / 未知键 error / 多页 wrapper / 空清单）、`contract/__tests__/kinds-dynamic.test.ts`（6 用例）、`mcp/__tests__/dynamic-kinds.test.ts`（6 用例，含 `getInputSchema` 实时刷新与注销回落）。

**验收结果（逐 workspace 独占运行，全部 exit 0）**

| workspace | 结果 | workspace | 结果 |
|---|---|---|---|
| core | 92 文件 / 1374 用例 | canvas | 82 文件（含 `pretest: vue-tsc --noEmit`） |
| contract | 10 文件 / 102 用例 | print-client | 26 文件（含 P0 基线） |
| mcp | 8 文件 / 96 用例 | render baseline | 1 文件 / 4 用例 |
| echarts | 4 文件（含 HTML 逐字基线） | common | 36 文件 / 386 用例 |

- `npm run lint:print-architecture` 通过；`core` / `contract` / `mcp` 三包 dist 重建（tsup + DTS）全部 exit 0，补完模板类型声明后再重建一次 core 亦为 exit 0；新 core d.ts 下 `vue-tsc --noEmit -p packages/print-canvas/tsconfig.json` exit 0、零错误；**demo 在零改动接入代码的前提下 `npm run build` exit 0（24s）**。
- **R5 关键证据**：P0 的两份历史 `chart` 模板在 legacy 通道下仍是 `ok=true / issues=0 / unknownKeys=0`；`legacy-baseline.test.ts` 的 HTML 逐字比对、core 三链路 fake driver 基线、两端宿主冒烟全部通过 → 现有 chart 渲染行为 100% 不变。
- **P2 入口提示**：`validate.ts` 的 `allowedElementTypes()` / `pluginOptionKeys()` 与 `kinds.ts` 的 `getElementKinds()` 是「注册态」的单一来源，P2 泛化渲染分派时直接复用，不要再引入第二份白名单。

### P2 通用渲染与执行器协议（已完成 / 全绿，2026-11-14）

> 严格遵循 D9「先建后拆」：**新增一层通用协议与 chart 旧链路并存，chart 旧分支一行未删、行为逐字不变**，P4 才原子切换。原计划写成「泛化替换」（`ChartSpec` → `ElementRenderSpec`、`charts.ts` → `assets.ts`、`renderCharts` → `renderAssets`、`chartBundle` → `bundles`），实施时全部按「并存」落地，避免 P1 与 P4 之间出现渲染断点。

**落地清单**

- `core/render/types.ts`：新增 `ElementRenderSpec`（`type` + 可选稳定 `key` + 插件自解释字段）/ `ElementRenderer` / `ElementRenderers`，由主入口与 `/designer` 同源导出；`ChartSpec` / `ChartRenderer` 原样保留。
- `core/print/assets.ts`（新，178 行）：与 `charts.ts` / `codes.ts` 同构的通用「收集 → 批量出图 → 回填」协议，但不含任何具体元素知识 —— `createCollectingAssetRenderer`（未命中记录规格并抛 `collect`，由生成器降级文本占位）/ `createMapAssetRenderer` / `mergeAssetMaps` / `createAssetRenderers` / `assetSpecKey`（JSON 稳定键，循环引用降级为字段清单）/ `renderablePluginTypes` / `assetPluginTypes` / `renderAssetSpecsInProcess` / `renderAssetSpecs`（两级：插件自带 `createRenderer` 进程内出图 → 未命中交会话执行器）/ `collectExecutorBundles`（按 `version` 去重，注册态即部署白名单）/ `resolveExecutorMethod`（§3.9 别名桥反查，主体零具体方法名）。
- `core/print/ports.ts` / `driver.ts`：`PrintSession` 新增**可选** `renderAssets(specs)`（旧宿主不实现不破坏）；`ExecutorMethod` 与 `EXECUTOR_TARGETS` 增 `renderAssets: 'none'`。`print/index.ts` 导出 `assets.ts`。
- `core/print/dom-host-runtime.ts`：`createDomHostRuntime` 增第 4 参数 `bundles: readonly ExecutorBundle[]`，按 version 幂等注入并在 `load` 后重置；新增会话方法 `renderAssets` 经 `resolveExecutorMethod('renderAssets')` 反查 —— 插件登记 `legacyAliases: { renderCharts: 'renderAssets' }` 时自动落到执行器真实旧名，fake driver 实测调用 `renderCharts` 1 次、`renderAssets` 0 次。
- `core/browser/driver-iframe.ts`：**唯一真正替换而非并存的点** —— 去掉 `method === 'renderCharts'` 特判，改为「core 自带 `domExecutor` 有同名方法则直调，否则从注入的 `__wormDom[method]` 按名取用」，主体不再认识任何具体方法名。`browser/__tests__/dom-executor.spec.ts` 的约定表同步扩到 `renderAssets`。
- `core/render/html-generator.ts`：`RenderCtx` / `GenerateOptions` 增 `renderers?: ElementRenderers`；`default` 分支改为「查注册表 → 有 renderers 则分派、否则用插件 `render.html` → 失败/未注册回落原有文本占位」。**实现细化**：原计划写「未命中走现有 chart fallback」，实际 `chart` 有自己的 `case`，不经过 `default`，无需也不应在此再判一次。
- `core/render/data-binder.ts`：`binding.bind` 插件优先，其返回值 `Object.assign` 进 `cloned.options`；仅当没有插件绑定时才走既有 `bindChartData`（R5 关键保护）。
- `core/print/pipeline.ts`：`buildHtmlWithAssets` 增第三条独立收集通道（code / chart / asset 三路 `Promise.all`），测量趟 `assetMap` 复用到最终趟；`SinglePrepared` / `BatchCopyInput` / `TileInput` / `MultiPageCopyInput` 全链路透传 `renderers`（`renderersPerPage` 按页索引取用），批量 / 拼版 / 多页 / 单页四条路径闭合。`browser-pagination.ts` 与 canvas `PrintHtmlPreview.vue` 增可选 `renderers` 入参，旧 `chartRenderer` 语义不变。

**新增回归用例**：`core/print/__tests__/generic-assets.spec.ts`（18 用例）—— 收集/映射/合并/稳定键/别名反查/类型清单与 bundle 去重、插件注册后自定义元素内联 SVG 与渲染抛错降级、插件 `binding.bind` 写入 options、**三条 R5 等价断言**（注册任意插件后历史 chart 模板 HTML 逐字一致、`_chartOption` 仍生成、`prepareDocument` 的 SVG 数与 `renderCharts` 调用次数不变）、进程内 renderer 不触碰会话、无进程内 renderer 时经别名桥走旧执行器并注入 bundle、以及批量 / 拼版 / 多页三条路径的 `renderers` 透传。

**验收结果（逐 workspace 独占运行，全部 exit 0）**

| workspace | 结果 | workspace | 结果 |
|---|---|---|---|
| core | 93 文件 / 1392 用例 | canvas | 82 文件 / 801 用例（含 `pretest: vue-tsc --noEmit`） |
| contract | 10 文件 / 102 用例 | print-client | 26 文件 / 212 用例 |
| mcp | 8 文件 / 96 用例 | render baseline | 1 文件 / 4 用例 |
| echarts | 4 文件 / 14 用例（含 HTML 逐字基线） | common | 36 文件 / 386 用例 |

- `lint:print-architecture` 通过；core（tsup + DTS）/ canvas / echarts 的 dist 全部重建 exit 0（含 `vue-tsc`）；**demo 零改动 `npm run build` exit 0（2803 模块 / 24.8s）**；`@worm-vue3-print/core` 及 `/client` `/browser` `/node` `/designer` `/browser/dom-executor.iife` 六个子路径在 Electron 客户端目录下 `import()` 全部解析成功。
- **R5 关键证据**：P0 两份历史 `chart` 模板的 HTML 逐字基线、`validate` 基线、三端 fake driver 基线在注册插件前后完全等价；`chartRenderer` / `renderCharts` 的注入次数不变。P2 新增能力对未注册插件的模板零影响。
- **P3 入口提示**：`assets.ts` 的 `renderablePluginTypes()` / `assetPluginTypes()` 直接读注册表，设计器侧属性台 tab 判据（§3.8）应复用同一个注册态来源；`PrintHtmlPreview.vue` 已预留 `renderers` prop，P3 无需再改渲染入口。

### P3 设计器插件能力 + 属性台 tab（已完成 / 全绿，2026-11-14）

> **零破坏**：P0 冻结的 `PropertyPanel-collapsed.spec.ts`（5 用例）与 `ElementExtension.spec.ts`（10 用例）**一行未改即全绿**；`print-designer-tiling.spec.ts` / `PropertyPanel-cell-binding.spec.ts` / `LayerPanelIcon.spec.ts` / `useElementExtensionRegistry.spec.ts` 同样零适配通过。**本阶段没有改任何 core 源码**（复用 core 已导出的 `matchKeywords`），因此无需重建 core dist。

**落地清单**

- `canvas/composables/useElementExtensionRegistry.ts`：`ElementPropertyTab` 描述符（`label` / `icon` / `component` / 实例级 `hasProperties(element)` / `searchKeywords`）、`ResolvedElementPropertyTab`、`PropertyTabKey = 'custom' | 'element' | 'page'`，以及 `resolveElementPropertyTab(element)` —— 实例级判据未通过、内置元素、未注册扩展、判据抛错一律返回 `undefined`（抛错按「无属性」处理，不打断设计器）。`ElementExtension` 新增可选 `group`（素材卡分组）与 `propertyTab`；**旧 `propertyComponent` 自动取得 tab 资格**（兼容别名，不标 deprecated），保证已装 `print-echarts` 的宿主零改动即可看到新 tab。`canvas/index.ts` 同步导出面。
- `PropertyPanel.vue`：tab 列表改为 `tabs` computed **数据驱动**，单一「自定义属性」tab `v-if` 等价条件渲染且 DOM 第一位（折叠态在 `«` 展开按钮之后、两个内置 tab 之前）；新增自定义 pane 并按 `currentTab === 'custom'` 显隐，**扩展属性组件从元素 pane 末尾整体迁入**；`activeTab` / `currentTab` / `expandTab` 扩为三值，缺省仍回落 `'page'`。
- **属性搜索**：单一 `PropertySearch` 提到 tab bar 下方，用 `v-show` 供元素 / 自定义两个 pane 共用且**切页签不丢搜索词**（页面 pane 隐藏）；自定义组件由 `customTabVisibleInSearch` 门控 —— `matchKeywords` 命中插件 `searchKeywords`（缺省为 tab 标题 + 扩展名 + 类型）与「自定义属性」时才显示，与内置分组「命中才显示」同口径。
- `PrintDesigner.vue`：`watch(selectedElement)` 与双击入口统一按 `resolveElementPropertyTab(el) ? 'custom' : (el ? 'element' : 'page')` 决定默认激活；`activePropertyTab` 三值。
- **周边插件口径**：`LeftPanel.vue` 支持扩展 `group` 分组标题（未声明时 DOM 与内置态逐字一致）；`LayerPanel.vue` 图标优先读注册表 `icon`、回落内置硬编码表（历史模板未装包时仍是既有占位图标）；`help-content/features.ts` 两份（canvas + print-common 镜像副本）把「图表」行改为「扩展元素／插件注册」口径，common 侧按逐字副本约束同步。

**三处实现细化（后续别按草案措辞理解）**

1. 草案写「插件注册 `propertyTab` 才取得显示资格」，实施改为**旧 `propertyComponent` 自动取得资格** —— 否则已装包宿主看不到新 tab，违反「零宿主改动」硬约束；`hasProperties` 缺省恒 true，插件可按需收紧。
2. 草案写「属性搜索接上 `filteredGroups`」，实施为独立的 `customTabVisibleInSearch`（`matchKeywords` + 动态关键词），**不改 core 的 `PROPERTY_REGISTRY`** —— 既避免 P3 引入 core 源码改动，也不破坏 `property-search.spec.ts` 的全量分组等价断言。
3. 自定义 pane 用 `v-show` 而非 `v-if`（不移除 DOM），因此 `ElementExtension.spec.ts` 里固定传 `activeTab:'element'` 的 3 条扩展属性用例无需改写。

**新增回归用例**：`canvas/src/__tests__/custom-property-tab.spec.ts`（17 用例）—— helper 的实例级判据 / 描述符覆盖 / 判据抛错 / 注销回落，属性台的「内置元素零变化」「tab DOM 第一」「折叠态 4 按钮与 title 顺序」「点击 emit」「实例无属性不渲染」「change 汇入历史」「搜索命中与无关词」「页面 tab 隐藏搜索框」「切页签保留搜索词」，以及设计器联动的「默认激活 custom / 内置回落 element」「分组标题」「图层图标读注册表」。

**验收结果（逐 workspace 独占运行，全部 exit 0）**

| workspace | 结果 | workspace | 结果 |
|---|---|---|---|
| core | 93 文件 / 1392 用例 | canvas | 83 文件 / 818 用例（含 `pretest: vue-tsc --noEmit`） |
| contract | 10 文件 / 102 用例 | print-client | 26 文件 / 212 用例 |
| mcp | 8 文件 / 96 用例 | render baseline | 1 文件 / 4 用例 |
| echarts | 4 文件 / 14 用例 | common | 36 文件 / 386 用例 |

- `lint:print-architecture` 通过；canvas / common 的 dist 重建 exit 0（含 `vue-tsc` / `tsc`）；**demo 零改动 `npm run build` exit 0**。`git diff --check` 干净、无构建垃圾文件。
- **R5 关键证据**：P0 的折叠态 3 按钮 / 2 tab / 无「自定义属性」基线、P2 的两份历史 `chart` 模板 HTML 逐字基线与三端 fake driver 基线全部保持全绿；`print-echarts` 包与 `demo/App.vue` **一行未改**，仅靠旧 `propertyComponent` 兼容路径即可获得新 tab。

**P4 入口提示（两套注册表仍并存）**：canvas 的 `useElementExtensionRegistry`（Vue 响应式、携带组件）与 core 的 `element-plugin-registry`（纯 TS、承载 kind / render / binding / `propertyTab`）在 P3 仍相互独立；P4 原子切换时要统一为 `defineElementPlugin` 一套，并让 `print-echarts` 包入口 import 即注册、补 `propertyTab.hasProperties` 实例判据。尚未删除的图表专属知识：`LayerPanel` 的 `chart:'▤'`、`property-search.ts` 的 `group:'chart'`、`installEchartsDesignerExtension()` 显式调用、文档中的「14 种」表述 —— 全部留给 P4。

### P4 原子切换（已完成 / 全绿，2026-11-14）

> 一次跨包原子切换：**主体删知识 + 包内描述符归位 + 包入口 import 即注册 + 声明合并 + 两套注册表统一**。
> **R5 关键证据**：P0 两份历史 `type:'chart'` 模板 JSON 一个字节未改、未加 `plugins` 清单；`legacy-baseline.test.ts` 2/2 的 HTML 与 P0 基线逐字一致，`validateTemplateJson` 与校验基线一致；三端在旧入参下照常出图，demo 零改动构建通过。

**主体删除（§2.2 九处硬编码清零）**

- `core/designer/types.ts`：`ElementType` 回到 13 项 `BuiltinElementType ∪ keyof PluginElementTypeMap`，删五个 `chart*` 字段；`element-factory.ts` 删 `case 'chart'` / `typeMetaMap.chart`，`default` 改由插件 `kind.defaultOptions` 出厂、标题取 `kind.label`。
- `core/render/data-binder.ts` 删整块 `bindChartData` / `evaluateChartOption` / `applyChartData` / `applyChartCategories`；`html-generator.ts` 删 `case 'chart'`，`default` 成为扩展元素唯一分派并注入通用落纸尺寸（`widthMm` / `heightMm` / `fontFamily` / 稳定 key）。
- `print-contract`：`schema/element.ts` 的 enum 14→13 项、删 `chartOption` 结构化覆写；`option-meta.ts` 删五键；`kinds.ts` 删内置 chart kind（改由 `getElementPlugins()` 叠加）。`core/designer/utils/property-search.ts` 删 `group:'chart'` 五项；`canvas/components/LayerPanel.vue` 删 `chart:'▤'`。
- `html-generator.ts` 的 `chartRenderer` 注释、`three-end-baseline.spec.ts` 与 `generic-assets.spec.ts` 头部注释统一改成「§4.3 兼容别名入参 / 插件统一出图」口径。

**包内归位（D2 全量）**

- `print-echarts/src/plugin.ts`（新）：`CHART_PLUGIN = defineElementPlugin({...})` 是「图表」在主体之外的**唯一知识来源** —— `kind`（`optionMeta` 五键 / `requiredOptionKeys` / `fixedHeight` / `defaultOptions` / `notes`）、`legacyAliases`（`chartRenderer`→`renderers`、`renderCharts`→`renderAssets`、`chartBundle`→`bundles[0]`、`loadChartExecutorBundle`→`executorBundles`）、`binding.bind`（旧 `bindChartData` 逐行等价复刻）、`render.html` / `createRenderer` / `executorBundle`（旧 SVG 归一与执行器产物）。模块底部 `registerChartPlugin()` → **import 即注册**；`node.ts` 加 `import './plugin.js'` 让服务端 / Electron 主进程同样注册。
- `type-augmentation.ts`（新）：`declare module '@worm-vue3-print/core/designer'` 注入 `PluginElementTypeMap.chart` 与五个 `chart*` 字段，并用 `_ChartTypeInjected & _ChartOptionInjected = true` 做**编译期自校验**（注入失效时 `vue-tsc` 直接红）；同时 `declare global` 声明 `__wormDom`。
- `index.ts` 导入声明合并并调 `installEchartsDesignerExtension()`；`designer/index.ts` 保留旧 `registerElementExtension`（兼容别名）+ 注册 core 描述符 + 实例级 `chartHasProperties(element)` + `propertyTab.searchKeywords`。

**自动注册与两套注册表统一**

- `canvas/composables/useElementExtensionRegistry.ts` 新增 `coreExtensions()`：把 core 注册态中带 `designer.canvasComponent` 的插件映射成旧 `ElementExtension`（`kind.icon` / `defaultOptions` / `propertyTab` 一并映射）；`getElementExtensions()` / `getElementExtension()` 合并两张表，旧 `registerElementExtension` 同 type 优先。LeftPanel / LayerPanel / PropertyPanel / BaseElement **零改动**即可看到包入口自注册的元素。
- `core/print/dom-host-runtime.ts` 的 `renderAssets` 增加兼容兜底：`bundles.length === 0` 时回落旧第三参数 `chartBundle`，使 P5 之前「旧三参数装配」不空转。

**测试迁移与三端基线语义**

- core 原 `render/chart-bind.test.ts` / `chart-element.test.ts` 迁出（`/tmp/wvp-p4-moved-*.test.ts` 备份），在包内新建 `plugin-binding.test.ts`（7 例）/ `plugin-render.test.ts`（6 例）**测真实现**；主体侧新建 `print/__tests__/chart-plugin-stub.ts` 只测机制。
- `generic-assets.spec.ts` / `three-end-baseline.spec.ts` / `chart-pipeline.spec.ts`、`services/print-render/src/chart-pdf.baseline.test.ts`、`clients/print-client/src/main/chart-print.baseline.test.ts` 全部改按「插件进程内 SSR 出图」断言：`chartSpecs=0`、`evaluate:renderCharts=0`、不再要求注入 `chartBundle`；`element-type-exhaustiveness.test-d.ts` 改盯 `BuiltinElementType`。
- **round4 两处红都是「测试仍按 P3 语义写」而非实现缺陷**：① `ElementExtension.spec.ts` 图层图标用例没注册扩展却期望内置 `▤` → 拆成三态（未装包 `['◆','◆']` / 装包 `['▤','◆']` / 仅注册 core 描述符 `kind.icon` 也生效）；② `chart-pdf.baseline.test.ts` 仍期望 core 执行器注入 2 次 → P4 后无第二趟页面 `renderCharts`，只有一次 `load`，改为 `toEqual([coreVersion])`（`coreBundle.version='2'`、`chartBundle.version='1'`）。单点复验 12/12 与 4/4 通过后再跑全量。

**验收结果（逐 workspace 独占运行，全部 exit 0）**

| workspace | 结果 | workspace | 结果 |
|---|---|---|---|
| core | 91 文件 / 1381 用例 | canvas | 83 文件 / 820 用例（含 `pretest: vue-tsc --noEmit`） |
| contract | 10 文件 / 102 用例 | print-client | 26 文件 / 212 用例 |
| mcp | 8 文件 / 96 用例 | render baseline | 1 文件 / 4 用例 |
| echarts | 6 文件 / 27 用例（含 HTML 逐字基线） | common | 36 文件 / 386 用例 |

- `lint:print-architecture` 通过；`echarts` / `canvas` / `common` 三包 dist 重建全部 exit 0（含声明合并的编译期自校验）；**demo 零改动 `npm run build` exit 0（2806 模块 / 23.9s）**；`git diff --check` 干净。
- **「零知识」判据按 §3.9 精确化**：主体源码（排除 `__tests__`）不再有图表**实现 / 字段 / 分支**；grep `chart` 的剩余命中全部是 §4.3 无限期保留的兼容别名端口（`ChartSpec` / `ChartRenderer` / `chartRenderer` / `renderCharts` / `chartBundle`、`charts.ts` 收集器、`dom-host-runtime` 通用桥）与注释，**不是知识残留**，§6 矩阵行已同步。

**计划偏差与顺延 P5（非遗漏）**

- 草案写「P4 补齐 `./browser/executor.iife` 的 `types` 条件、插件开发文档 / 脚手架、`echarts.use` 组件注册表与配色 / 示例数据的细粒度配置」：P4 交付的是**机制**（P1 的 `configurePlugin` / `getPluginConfig` 已被 `plugin.ts` 读取），包内配置面与文档 / 脚手架顺延 P5，避免原子切换的 diff 继续扩大。
- 草案写「`chartRenderer` prop 删除」：实际按 §4.3 保留为兼容别名入参，只删主体内部的图表分支；P5 清理三端手写传参时旧入参仍须可用。

**P5 入口提示**：`services/print-render/src/pdf-render.ts`、`clients/print-client/src/main/print-engine.ts`、`demo/src/App.vue` 仍硬编码 `loadChartExecutorBundle()` / `createChartRenderer()`；P4 靠兼容桥让旧装配零改动跑通，P5 才改为按注册表自动收集。

### P5 三端自动装配、包能力、文档与 MCP/AI 定稿（已完成 / 全绿，2026-11-14）

> 最后一个开发阶段：**宿主不再写任何图表专属装配代码**；新增插件只需在部署白名单里 import 一次。
> 发版（CHANGELOG 四处 / 1.5.0 / 打标签 / 发版提交双推 / release workflow）**未执行**，须经用户确认后单独进行；P5 代码提交 `2d21b51` 已双推两个远端。

**三端自动装配（D3 / D7 收尾）**

- `services/print-render/src/pdf-render.ts`、`clients/print-client/src/main/print-engine.ts`：删掉 `loadChartExecutorBundle()` 的显式装配，改为副作用 `import '@worm-vue3-print/echarts/node'`（部署白名单，模板字符串仍无法触发 `import()`）+ `createDomHostRuntime(factory, loadExecutorBundle(), undefined, collectExecutorBundles())`。第三参保留为 §4.3 旧 `chartBundle` 兼容位并传 `undefined`，第四参由注册表按注册态自动收集。
- `demo/src/App.vue` 与 `demo/src/browser-render.ts`：删 `installEchartsDesignerExtension()` 显式调用、`:chart-renderer` 绑定与 `createChartRenderer()`，改为一行 `import '@worm-vue3-print/echarts'`；`PrintHtmlPreview.vue` 注释同步为「注册表自动收集 `renderers`，`chartRenderer` 为兼容别名」。
- **首轮 targeted 回归两处红不是实现缺陷，而是描述符缺项**：真图表插件 `CHART_PLUGIN` 只有 `render.html` / `createRenderer()`，没有 `executorBundle()`，导致 `collectExecutorBundles()` 返回空、render / print-client 基线的 `> 0` 断言失败。修法：`plugin.ts` 增 `registerChartExecutorBundle(provider)` 与 `registerChartPlugin(designer?, extraRender?)`（合并 `current?.render` 与 `extraRender`，不覆盖已有能力）；`node.ts` 用惰性 `readFileSync` 读取 `dist/executor.iife.global.js` 并注册 provider，`loadChartExecutorBundle()` 保留兼容 API 并复用同一 provider。
- 两条出图路径分清：有 `createRenderer()` 的插件走 `renderAssetSpecsInProcess()` 进程内 SSR，页面执行器只在宿主无进程内能力时注入；只有 `executorBundle()` 的插件才走 `session.renderAssets()`。
- 浏览器 / 预览侧不传 `renderers` 也能出图：`pipeline.ts` 的 `buildHtmlWithAssets()` 用 `assetPluginTypes()`（注册态）构造收集渲染器，`renderAssetSpecs()` 优先进程内出图，再用 `createMapAssetRenderer()` 回填第二趟；宿主显式传 `renderers` 时既有覆盖语义不变。因此 demo 去掉 `chartRenderer` 后预览与打印仍由注册表驱动。
- `three-end-baseline.spec.ts` 新增「新四参数自动装配」用例并保留旧三参数兼容 / 缺 `chartBundle` 降级契约；`chart-pdf.baseline.test.ts` 与 `chart-print.baseline.test.ts` 默认改四参数，各自保留一条 `mode:'legacy'` 旧三参数兼容用例。

**架构守卫泛化**

- `scripts/check-print-architecture.mjs`：写死的「禁止裸 `echarts`」正则改为数据驱动 `PLUGIN_RENDER_LIBS = ['echarts','zrender']` + `importedModule()` 抽模块名，覆盖 `from` / 副作用 import / 动态 `import()` / `require()` 与子路径；`@worm-vue3-print/...` scoped 官方插件包始终放行。新增 `SELF_CHECK` 八条正负样例，每次运行先自检，规则静默失效或误伤即 exit 1。

**`print-echarts` 包能力补齐（P4 顺延项）**

- `config.ts`（新）+ `constants.ts` 共用 `CHART_PLUGIN_ID`：`configureChartPlugin()` / `getChartPluginConfig()` / `getChartPalettes()` / `getSampleCategories()` / `chartFactoryDefaults()`，配置键 `defaultWidth` / `defaultHeight` / `defaultChartType` / `defaultChartOption` / `components` / `palettes` / `sampleCategories`；配置惰性、按键合并，无需注销重注册。`option-utils.ts` 的示例类目、`ChartPropertyGroup.vue` 的配色、`renderer.ts` 的 `echarts.use` 追加组件、`designer/index.ts` 的出厂默认全部改走配置读取。
- 生命周期对称：`uninstallEchartsDesignerExtension()` 同时注销 core 描述符与 canvas 响应式注册项；`installEchartsDesignerExtension()` 返回的句柄也一并注销两者。`plugin-lifecycle.test.ts`（新）覆盖配置面、惰性生效、自定义配色 / 类目、追加组件与完整卸载后重注册；`vitest.config.ts` 加 `@vitejs/plugin-vue` 以解析入口链路里的 SFC。
- `./browser/executor.iife` 的 exports 加 `types` 条件，`tsup.config.ts` 的 `onSuccess` 把 `src/browser/executor.iife.d.ts` 复制成 `dist/executor.iife.global.d.ts`。
- `README.md` 全量重写（import 即注册 / 部署白名单 / 自动装配 / 兼容 API / 配置表 / 导出表 / zrender class 漂移注意 / 插件开发入口）。P5 复核时把提前写的「1.5.0 起」改成不带版本号的措辞，并补注示例中 `loadExecutorBundle()` 的来源。

**文档与脚手架**

- 新增 `docs/中文/指南/自定义元素插件开发.md`（五步教程 + 描述符签名表 + 属性台 tab + legacy/strict + 10 条常见坑 + 验收清单）与 `examples/custom-element-plugin/`（`signature` 最小插件：`plugin.ts` / `type-augmentation.ts` / `index.ts` / `node.ts` / README）。已核对示例与真实 API 一致：`/designer` 子路径用 `export *` 导出注册表、`ElementRenderSpec` 带索引签名、声明合并注入三个专属键、canvas `coreExtensions()` 的 `materialCard` / `propertyTab` 映射形状匹配。
- MCP/AI 动态口径定稿：`skills/worm-vue3-print-mcp/references/template-schema.md` 与 `SKILL.md`、`docs/中文/指南/AI接入.md`、`clients/print-client/src/renderer/mcp-config.ts` 全部改为「以 `print_element_kinds` 实时返回为准（内置 13 种 + 插件注册态）」，删除写死的 14 种；`tools.test.ts` / `draft.test.ts` 注释钉住 kinds 唯一来源与动态用例归属。
- 根 README、`模板设计器.md`、`使用指南.md`、`三端渲染一致性方案.md`、`接口/API文档.md`、`docs/en/Overview.md`、`services/print-render/README.md` 同步四参数签名与自动装配口径。复核确认 `MCP集成.md` 原本就是动态口径（「以当前返回的元素、配方、函数和单位为准」），无需改动；两份 `help-content/features.ts` 仍逐字一致。

**计划偏差与未完成项**

- `MCP集成.md` 曾列在 P5 文档同步清单里，复核后确认无需改动，故未产生 diff。
- `parity:cross-end` 需要真机打印生成的 PDF，脚本自身注明「不接入 CI 自动执行」，本阶段沿用三端 fake driver 基线而不跑该脚本。
- **CHANGELOG 四处、1.5.0 版本号与 lock 同步、Release 正文、打标签、`origin` + `github` 双推、release workflow 手动触发均属发版动作，本阶段一律未执行**（远端写入须用户确认，见 §8）。

**验收结果（逐 workspace 独占运行，全部 exit 0）**

| workspace | 结果 | workspace | 结果 |
|---|---|---|---|
| core | 91 文件 / 1382 用例 | canvas | 83 文件 / 820 用例（含 `pretest: vue-tsc --noEmit`） |
| contract | 10 文件 / 102 用例 | common | 36 文件 / 386 用例 |
| mcp | 8 文件 / 96 用例 | print-client | 26 文件 / 212 用例 |
| echarts | 7 文件 / 37 用例（含 HTML 逐字基线 4 例） | render | 13 文件 / 48 用例 |
| render baseline | 1 文件 / 4 用例 | skills | 11 用例 + 3 个技能包校验 |

- 五个包的 dist 全部备份后重建且 exit 0（`core` → `contract` → `mcp` → `canvas` → `echarts`），`echarts` 的 `executor.iife.global.d.ts` 与 license banner 均生成。
- `lint:print-architecture` 通过（含 8 条正负样例规则自检）；`demo` 构建 2807 模块 / 24.81s、**`demo` 的 `vue-tsc --noEmit` 类型检查也通过**；`git diff --check` 干净。
- 唯一非错误输出：`echarts` 的 IIFE 构建对 core dist 里的 BigInt 字面量给出 `es2018` target 警告（既有构建配置现象，不影响产物与测试），以及 demo 的 chunk >500 kB 体积提示。
- **R5 仍成立**：`legacy-baseline.test.ts` 的两份历史 `chart` 模板 HTML 逐字基线在 P5 新对照用例加入后依旧通过（对照用例改放到最后并归一化 zrender class 计数器）。

---

## 6. 测试与验收矩阵

| 维度 | 命令 / 位置 | 通过标准 |
|---|---|---|
| 单元测试 | 逐 workspace `npm test -w <pkg>`（core≈2.6min、canvas≈8.7min、common≈4min）；`demo/` 内 `npm run build` | 全绿，无跳过 |
| 类型检查 | 各包 `vue-tsc --noEmit` / `tsc -p tsconfig.build.json`（先重建 core/canvas dist） | 零错误，含声明合并后的插件类型 |
| 契约/MCP | `print-contract`、`print-mcp` 测试 | legacy 宽松 / strict 强校验 / kinds 动态 / 缺插件明确报错 |
| **零迁移等价（R5）** | P0 样本 JSON 原样导入 + 三端打印 | 与改造前 HTML/SVG 快照逐字一致；`validateTemplateJson` 的 `ok` 与告警集合不变 |
| 三端 | `services/print-render`、`clients/print-client` 测试；demo 预览/打印冒烟 | 四类图表在浏览器/PDF/静默打印输出一致 |
| 架构守卫 | `npm run lint:print-architecture` | 通过 |
| 属性台 | canvas 新增 tab 用例 | 条件显示、首位、默认激活、内置元素不显示、折叠态与搜索一致 |
| 零知识 | 主体源码 grep `chart`（排除 `__tests__`） | 无图表**实现 / 字段 / 分支**命中；§4.3 兼容别名端口（`ChartSpec` / `ChartRenderer` / `chartRenderer` / `renderCharts` / `chartBundle`、`charts.ts` 收集器、`dom-host-runtime` 通用桥）与注释按定稿允许保留，P5 后三端不再传旧入参，端口自然空转 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| ~~D1 破坏性变更~~ / ~~D1×D4 中间态~~ | — | **v2 已消除**：legacy 双模式 + P1 不删知识 + P4 原子切换 |
| **P1 删除与 P4 注册之间的渲染断点**（v1 未处理） | 三端全降级、demo TS 报错，阶段验收无法保持绿 | 先建后拆：P1–P3 保留全部 chart fallback；P4 一次原子切换，前后跑 P0 快照 |
| **`elementTypeSchema` 失去 enum 后 AI 生成侧退化**（§0.4） | `print_draft_template` 无类型清单、模型可传任意 type | **P1 提前 kinds 动态化**，draft enum 与 `print_element_kinds` 共用同一函数；legacy 校验对编辑距离 ≤1 的拼写错误仍报 error |
| legacy 宽松使未知 type 拦截变弱 | AI/外部注入任意 type，模板不可移植、出空纸 | strict 模式按注册表强校验；编辑距离规则；渲染端文本占位不静默出空纸 |
| 声明合并要求宿主解析到插件 `.d.ts` | 未 import 包的宿主 TS 报「多余属性」 | `types` 入口覆盖声明；P0 补类型回归测试；文档明确「能打印图表的宿主必然已 import 包」这一前提 |
| `globalThis` 注册表双实例 / 多插件 bundle 顺序 | 注册漂移、`__wormDom` 覆盖、渲染错乱 | 固定 Symbol key 单例；每 bundle 独立 `version` 幂等去重；core 执行器先注入、插件只新增方法 |
| 兼容别名与「零知识」在符号名上冲突（§0.4） | 主体残留 chart 字面量，R1 口径被稀释 | §3.9 通用别名桥 + 插件以数据形式提供映射；grep 验收 |
| `ElementOptions` 放开后类型安全下降 | 属性拼写错误难发现 | 插件 `optionMeta` 强校验；声明合并注入具名字段；内置字段保持严格类型 |
| 属性台 `activeTab` 三值化撞既有测试 | 多处 props 断言、pretest `vue-tsc` | 逐项适配；默认值保持 `'page'` |
| 包体膨胀（IIFE 自包含 echarts 580KB，多插件线性增长） | 页面加载慢 | 按 `plugins` 清单与注册态按需注入 bundle |
| 分页/测量语义 | 自定义元素 autoHeight 未定义 | 插件 kind 必须声明 `fixedHeight`；沿用「固定高、禁 autoHeight」口径 |
| 本地 dist 陈旧导致类型检查假红 | 干扰每阶段验收 | P0 先重建 dist；构建用 `CODEBUDDY_SAFE_DELETE_ENABLED=0` 绕行 |
| 服务端按 `plugins` 动态 `import()` | 任意代码加载风险 | 白名单由部署依赖承载，禁止用模板字符串构造模块路径 |
| P4 原子切换 diff 跨五包偏大 | 复核困难 | P0 快照逐端兜底；提交内按包分文件、逐段 `git diff` 复核 |
| 版本同步范围记漏 | 发版后包间版本漂移 | §4.7 实测清单（9 个 package.json + 6 处引用 + 2 个 lock）；发版前脚本核对 |

---

## 8. 决策闭环与实施节奏

原 v1 §8 的 5 项待确认已全部解决：

| 原待确认 | v2 结论 |
|---|---|
| 版本号 1.5.0 / 2.0.0 | **1.5.0 minor**，非破坏性（D10） |
| 迁移后字段形态（`pluginOptions` vs 保留原键） | **不需要迁移**；历史模板原键不动，插件以 `optionMeta` + 声明合并声明（D6） |
| 未装插件宿主的旧模板行为 | 沿用现状降级（文本占位 + `UNSUPPORTED_RUNTIME`）；只有声明了 `plugins` 清单的模板才报 `MISSING_PLUGIN`（§3.4 / §4.2） |
| demo 是否默认注册图表插件 | **是**，且因包入口自动注册，demo 无需写注册代码（D7） |
| 实施节奏 | **按 P0 → P5 逐阶段推进**，每阶段结束给出 `git diff` 复核与测试结论，不跨阶段批量改代码；P4 为唯一跨包原子切换点 |

**当前进展**：**P0–P5 六个阶段全部完成且全量验收全绿 / 仅剩 1.5.0 发版（须用户确认）**（2026-11-14）。P0 详细落点见 §5 P0（6 份基线资产、三链路 fake driver 冒烟、属性台断言、类型穷尽闸门，负向验证有效）。P1 按 D9「先建后拆」只加机制、未删任何 chart 知识：core 通用注册表 + 空声明合并扩展点、contract legacy/strict 双模式校验、kinds 动态化并接入 MCP 的 `tools/list` 实时 enum，新增 36 条回归用例；两处实现细化（动态 schema 取代 `superRefine`、只豁免插件声明键）与验收表见 §5 P1。

P2 新增 `assets.ts` 通用资产协议、`ElementRenderSpec` / `ElementRenderer(s)`、`renderAssets` 会话与执行器方法 + 别名桥、`binding.bind` 分派、`html-generator` default 分支插件渲染，以及 `renderers` 在单页 / 批量 / 拼版 / 多页 / 浏览器预览 / 设计器预览的全链路透传；chart 旧链路一条未删、注册插件前后 HTML 逐字等价（P0 基线 + 三条 R5 断言）。三处细化：泛化替换实际按「新旧并存」落地、`chart` 有独立 `case` 故 default 无需 chart fallback、`driver-iframe.ts` 是唯一「替换」点。详见 §5 P2。

P3 完成设计器侧闭环（§5 P3）：`ElementPropertyTab` 描述符 + 实例级 `hasProperties`、`resolveElementPropertyTab()`、单一「自定义属性」tab 数据驱动且 DOM 第一、扩展组件迁入新 pane、折叠态同步、`activeTab` 三值与选中默认激活、属性搜索覆盖自定义属性、LeftPanel 分组 / LayerPanel 图标 / features 插件口径。**本阶段零 core 源码改动、零包改动、零宿主改动**：`print-echarts` 与 `demo/App.vue` 一行未改，靠旧 `propertyComponent` 兼容路径即获得新 tab；P0 折叠态与 `ElementExtension.spec.ts` 等既有断言全部零适配通过。三处实现细化：① 旧 `propertyComponent` 自动取得 tab 资格；② 搜索用独立 `matchKeywords` 门控而非改 `PROPERTY_REGISTRY`；③ 自定义 pane 用 `v-show` 保住既有测试。新增 17 条回归用例，九个 workspace 逐独占运行全部 exit 0、架构守卫通过、canvas/common dist 重建与 demo 零改动构建通过。P4 已完成唯一跨包原子切换（§5 P4）：主体九处图表硬编码清零，`print-echarts/src/plugin.ts` 的 `CHART_PLUGIN` 描述符承载种类 / 属性元数据 / 绑定 / 出图 / 设计器 / 兼容别名，包入口与 `/node` 子路径 import 即注册，`type-augmentation.ts` 用声明合并（含编译期自校验）恢复已装包宿主的 `ElementType` 与五个 `chart*` 字段，canvas 的 `coreExtensions()` 把 core 注册态映射为 Vue 视图层从而统一两套注册表。**R5 达成**：两份历史 `chart` 模板 JSON 未加任何字段，HTML 与 P0 基线逐字一致、validate 结果不变，三端在旧入参下照常出图。旧实现测试迁到插件包测真实现、主体侧改用 stub 测机制；三端 fake driver 基线切换到「插件进程内 SSR 出图」语义。逐 workspace 独占验收全绿、架构守卫通过、三包 dist 重建与 demo 零改动构建通过。

**P5 已完成本地改造（§5 P5）**：三端 `loadChartExecutorBundle()` / 手写 `createChartRenderer()` 全部清掉，改为部署白名单副作用 import + `collectExecutorBundles()` 四参数自动装配；`print-echarts` 补齐配置面、`./browser/executor.iife` 的 `types` 条件、完整卸载与生命周期回归；架构守卫泛化为插件渲染库清单并带规则自检；MCP/AI 技能文档与断言改为动态 kinds 口径；新增插件开发指南与 `signature` 最小脚手架。**全量验收全绿**：五包 dist 重建、10 组 workspace 测试（core 91/1382、canvas 83/820、echarts 7/37、common 36/386、print-client 26/212、render 13/48 等）、render baseline 1/4、skills、架构守卫、demo 构建与 `vue-tsc`、`git diff --check`。两份历史 `chart` 模板 HTML 逐字基线仍一致，R5 未被 P5 破坏。

**下一步（唯一剩余阶段）：1.5.0 发版**：当前仓库版本为 **1.4.8**（9 个 `package.json` 一致），需按 §4.7 同步 1.5.0 版本号与 6 处内部引用 / 2 个 lock、CHANGELOG 四处、`.github/release/notes.md`（**必须先写正文再打标签**）、`git config user.name` 身份核对、`origin` + `github` 双推、release workflow 手动触发。**以上均涉及远端写入，须先经用户确认，本轮一律未执行**（P5 代码提交 `2d21b51` 的提交与双推已获授权完成，此处仅指发版动作）。
