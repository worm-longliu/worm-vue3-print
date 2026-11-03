# 流式列表元素方案评估（GitHub issue #5）

> 状态：**已实施（2026-10-23，见第九节实施记录）**。第三、四节保留为方案评估过程记录，其中「推荐 D」已被维护者否掉——最终走的是「固定列数＋数字框配置＋可选跨列」这条路。
> 时间线：2026-10-22 issue 提出与首轮四档评估；2026-10-23 二、三轮定档（本文初稿把三轮写成「同日两轮」，2026-10-23 已更正）。
>
> **兼容扩展（2026-11-03）**：动态高度、四边内边距、按行分页与跟随区泛化见 [`2026-11-03-dynamic-flow-list-design.md`](./2026-11-03-dynamic-flow-list-design.md)。该扩展只新增可选字段 `flowLayoutMode`（缺省 `fixed`）与 `flowPaddingTop/Right/Bottom/Left`，固定模式的设计高度、裁切、HTML 结构、分页与「一框一页」行为均保持不变，旧模板无需迁移；本文第八、九节记录的口径继续适用于固定模式。

## 一、需求出处

- GitHub issue [#5](https://github.com/worm-longliu/worm-vue3-print/issues/5)：`[功能建议]是否可以支持「流式列表」元素：列表数据按自然宽度横向流式排布、自动换行`
- 提行人：`Mr-wangwei`（wangwei），2026-10-22 01:14 提出，标签为空，状态 OPEN。
- 场景原文：中药处方单的药材排列。一张处方 7 味药，希望排成：

```text
黄芪  20g   当归尾  15g   赤芍  10g   川芎  10g
地龙  10g   桃仁    10g   红花  10g
```

- 附件截图：`https://github.com/user-attachments/assets/b67230b3-d75f-45b9-b951-8f0b546fe44d`
  **本机未取到、未做图像判读**。原因：开发机到 `github.com` 与 `objects.githubusercontent.com` 的 443 端口 TCP 层不通（`github.com` 解析为 `20.205.243.166`，连接超时），系统无 HTTP/SOCKS 代理；`api.github.com`、`uploads.github.com`、`media.githubusercontent.com` 等可达但服务不到该附件。截图里的版式（每行几列、剂量是否成列对齐）仍是未知。
- 维护者已在 issue 内反问：**「需要指定每行的列数吗」**，提行人尚未回复。这一问正好是下面的分叉点。

## 二、现有代码事实（按符号复核，行号会漂）

> 坐标复核时间：2026-10-23。**`html-generator.ts`、`css-builder.ts`、`element-factory.ts`、`property-search.ts` 当前被同仓库另一个并行会话改动着**（工作区有未提交修改），这些文件里的行号已发生漂移，故一律附函数名；实施前请按函数名再定位，别照抄行号。

| # | 事实 | 坐标 |
| --- | --- | --- |
| 1 | 元素类型是字符串字面量联合，共 12 种：`text / image / longText / table / hline / vline / rect / oval / barcode / qrcode / html / pageNumber` | `packages/print-core/src/designer/types.ts:94` |
| 2 | 所有可配置项挤在单一 `ElementOptions` 接口，无按类型的属性 registry | `packages/print-core/src/designer/types.ts:256-349` |
| 3 | 元素定位是绝对坐标毫米（`left/top/width/height`），模板单位 `mm` | `packages/print-core/src/designer/types.ts:257-260`、`src/render/css-builder.ts` 的 `elementPositionStyle`（当前 `:384`） |
| 4 | 出纸 HTML 按类型分派集中在一个 `switch` | `packages/print-core/src/render/html-generator.ts` 的 `renderElement`（函数当前 `:403`，`switch` 在 `:432`） |
| 5 | 三端共用同一份生成代码：浏览器、服务端 PDF、桌面客户端都只换驱动，渲染入口同为 core 管线 | `src/print/pipeline.ts:31`、`src/browser/browser-pagination.ts:42`、`services/print-render/src/pdf-render.ts:5`、`clients/print-client/src/main/print-engine.ts:13` |
| 6 | **数组数据目前只有表格能消费**；非表格元素的上下文只有整份业务数据 | `packages/print-core/src/render/data-binder.ts:86`、`:126` |
| 7 | 表格列宽是固定毫米数组 `tableColWidths`，默认 50/50/50；出纸强制 `table-layout:fixed` | `src/designer/types.ts:336`、`src/render/html-generator.ts` 矩阵表格骨架输出处（当前 `:705`） |
| 8 | 表达式函数表只有 `CONCAT` 这类字符串拼接，无「数组逐项拼成一句」的函数 | `packages/print-core/src/render/expression-eval.ts:52-72` |
| 9 | 长文本已具备「按内容自然高度撑开 + 自动换行」，但换行口径是任意字符处切断（`word-break:break-all`） | `src/render/text-fit.ts:22-25`、`src/render/html-generator.ts:410-413`（`autoHeight` 不写死高度）、同文件单元格换行分支（当前 `:584`） |
| 10 | 项目里**唯一的流式落位机制**是「表格下方跟随区」`flow-group`：用相对定位容器覆盖绝对定位，随表格切片实际底部走 | `src/render/pagination-engine.ts:704`、`src/render/html-generator.ts` 的 `flow-follow` 容器（当前 `:794` 注释、`:865` 落点） |
| 11 | 管线是「先绑定、再测量、再分页、最后成形」的单份流程，测量趟在分页趟之前 | `src/print/pipeline.ts:196`、`:203`、`:210`、`:213` |
| 12 | **画布设计态不跑分页引擎**：`paginate` 与 `pagination-engine` 在 print-canvas、print-common、clients、services 的非测试源码中零引用；画布元素纯绝对定位铺一次，设计器里只有预览弹窗走分页渲染 | `packages/print-canvas/src/components/elements/BaseElement.vue:113`、`packages/print-canvas/src/components/PrintHtmlPreview.vue:24` |
| 13 | 新增元素类型必须由 `Record<ElementType, …>` 穷举默认属性与中文标题，漏一处即编译不过 | `packages/print-core/src/designer/utils/element-factory.ts` 的 `createDefaultOptions`（当前 `:9`）与 `typeMetaMap`（当前 `:59`） |
| 14 | 设计器有两套外壳需并行接入（Vue3 画布与零框架 Common），工具箱顺序与图标要求同源 | `packages/print-canvas/src/components/LeftPanel.vue:83`、`packages/print-common/src/shell/panels.ts:10`、`packages/print-common/src/shell/elements.ts:158` |

## 三、四档候选方案

### A　新增「流式列表」独立元素：能塞几个排几个

版式形态（同一份 7 味药数据）：

```text
黄芪 20g   当归尾 15g   赤芍 10g   川芎 10g
地龙 10g   桃仁 10g     红花 10g
```

- **存出什么值**：元素框（左、上、宽，高度由内容撑）；每单元的字段模板（药名、剂量）；单元间距；字号。
- **列数**：不指定，排满自动换行。
- **表达不了**：行间对齐。第二行「地龙」不会落在「黄芪」的列上，剂量也不成列——处方、价目类版式恰恰要这种成列感。
- **改动落点**：`designer/types.ts:94` 加类型 → `element-factory.ts` 的 `createDefaultOptions`（当前 `:9`）与 `typeMetaMap`（当前 `:59`）补默认属性与标题（编译期强制）→ `html-generator.ts` 的 `renderElement`（当前 `:403`）加分支 → `data-binder.ts:86` 让非表格元素消费数组 → `pagination-engine.ts:688-731` 加流式块的高度与落位口径 → `binding-registry.ts`、`zone-layout.ts`、`property-search.ts`、`migrate.ts` → 两套外壳的工具箱、元素渲染、属性台、图层图标。
- **成本**：最高一档，因为数组消费、流式高度、双壳接入都要新写。

### B　扩展现有表格：每行固定列数 + 列宽自适应

```text
┌──────┬─────┬───────┬─────┬──────┬─────┬──────┬─────┐
│ 黄芪 │ 20g │ 当归尾│ 15g │ 赤芍 │ 10g │ 川芎 │ 10g │
├──────┼─────┼───────┼─────┼──────┼─────┼──────┼─────┤
│ 地龙 │ 10g │ 桃仁  │ 10g │ 红花 │ 10g │      │     │
└──────┴─────┴───────┴─────┴──────┴─────┴──────┴─────┘
```

- **存出什么值**：每行列数（4）、列宽口径（自适应）、一行内的字段顺序。
- **列数**：必须指定，即维护者在 issue 里反问的那句。
- **好处**：剂量天然成列；表格已有的自动分页、表头重复、跨页续排、小计与边框能力全部白拿，不用新写分页。
- **要补的能力**：① 列宽目前只能是固定毫米（事实 7），需新增「由内容决定」这一档，出纸侧要把 `table-layout:fixed` 换成自动布局；② 数据目前只驱动行（事实 6），需要把一维数组按每行 N 味回填成多行。
- **代价**：最后一行不满留空格子；语义上它仍是「表格」，用户要理解「拿一张表当版式用」。
- **成本**：中等，且集中在表格自身，双壳属性台可沿用现成分组。

### C　表达式路线：一个长文本元素把数组拼起来自己折行

```text
黄芪 20g、当归尾 15g、赤芍 10g、川芎 10g、地龙 10g、桃仁 10g、红花 10g
```

- **存出什么值**：一个文本元素 + 一条表达式。列数这个概念不存在。
- **为什么现在不行**：函数表无数组逐项拼接（事实 8）；长文本换行是任意字符处切断（事实 9），会把「当归尾」切成「当归 / 尾」、把「10g」切成「1 / 0g」。
- **要补**：一个数组拼接函数 + 让成对内容粘住不被切断的排版规则（一处）。
- **代价**：间距行距全压在一个文本框里，无法对齐、无法跨页对账，处方读起来不像处方。
- **成本**：最低，但成品质量不可控。

### D　混合：新元素，排版交给自适应宽表格，列数由宽度算出来

```text
框宽 85mm 时（每行 4 味）              框宽 66mm 时（自动降为每行 3 味）
黄芪  20g  当归尾 15g  赤芍 10g  川芎 10g     黄芪  20g  当归尾 15g  赤芍 10g
地龙  10g  桃仁   10g  红花 10g              川芎  10g  地龙   10g  桃仁 10g
                                            红花  10g
```

- **存出什么值**：元素框宽度、每单元字段模板、单元最小宽度与间距；「每行列数」留空即自动，填了就用用户给的数。
- **列数**：不用指定也能成，指定了也听——把 A 与 B 的分叉做成一个可选项而不是二选一。
- **靠什么算列数**：用管线已有的测量趟拿单元实测宽度，再除以可用宽度得到每行几味（事实 11）。
- **关键未知（本文最重要的风险项）**：**画布设计态不跑测量与分页**（事实 12）。所以 D 在设计台上要么另写一套等效预估，要么接受「设计态所见列数」与「出纸列数」可能不一致。这条会显著改变工作量，必须由维护者拍板。
- **可复用**：项目唯一验证过的流式落位机制 `flow-group`（事实 10）证明了相对容器覆盖绝对定位这条路走得通。
- **成本**：比 B 多一个「算列数」模块，比 A 多一点测量依赖；收益是同时拿到「自动排布」和「成列对齐」。

## 四、推荐（首轮评估时的意见，已被第八节实际定档取代）

推荐 **D**，理由：A 与 B 的分歧本质是「每行列数由谁说了算」，D 把它变成可选而非二选一；C 的切断是硬伤，不值得为省工去赌提行人能否接受。

次选 **B**：若维护者判定「算列数」与「设计态预估」这两项成本不划算，B 用固定列数换取表格全套分页能力，是最省事的可用解，也能直接回答 issue 里那句反问（「需要，每行列数由你指定」）。

## 五、待决清单（2026-10-23 三轮后状态）

1. ~~**每行列数口径**~~ → **已决：由用户指定**（数字框，不自动算列数）。见第八节第 1 项。
2. ~~**跨页续排**~~ → **已决：不做**，一框一页；超出框高按现成溢出档处理。见第八节第 8 项。
3. ~~**设计态所见即所得**~~ → **已决：不预演**，跨列只在预览与三端出纸生效。见第八节第 7 项。
4. **截图判读**：仍未取到、未判读（本机到 `github.com:443` 与 `objects.githubusercontent.com` 不通）。列数与行高口径已由维护者直接定档，截图不再阻塞方案，只作最终对版式用的参考。
5. **交付节奏**（未决）：是否值得为这一个元素开一次 minor 版本；`packages/print-common` 属实验性包，接入时注意其版本号与主线不同步。
6. ~~**自适应细则**~~ → **已决**：开关默认关、「最多跨几列」钳到「每行列数」。见第八节第 9、10 项。
7. **新增未决**（第 9 项拍板后浮现）：把「每行列数」从 4 改小到 3 时，已填的「最多跨 4 列」必须被顶回 3——这是本元素唯一一处「改用户的值」的行为，与第 3 项「只提示不写值」构成有意的例外。例外要不要也补一句提示语、以及是否在属性台上高亮那一行，留给实施计划定。
8. **issue 回帖**（未决）：是否现在就按第八节口径回帖给提行人，把「每行列数要指定」「剂量不成独立列」「一框一页不续页」三条限制讲在前面。

## 六、若实施：验收面（先记着，不在本轮做）

- 单元模板含中文药名与数字剂量各一，验证「成对内容不被切断」与「最后一行不满」两种边界。
- 跨列三例：单元宽超一列时占 2 列、当前行剩余列位不足时整个挪到下一行行首、以及「最多跨几列」钳到列数后不再多占。
- 一框一页两例：数据多于框高时按所选溢出档出纸（裁／缩字／撑高各一测），并确认不会静默丢尾项而不给提示。
- 改小「每行列数」把「最多跨几列」顶回的那一次联动（第五节第 7 项的例外行为）。
- 三端同源出纸比对：浏览器预览、服务端 PDF、桌面客户端各打一张，用 `npm run parity:cross-end`。
- 双壳一致性：canvas 与 print-common 的工具箱顺序、图标、属性台项、元素类名逐字对齐；样式由 `packages/print-common/scripts/gen-styles.mjs` 同源派生，新元素两侧必须同名类。
- 回归面：`packages/print-core` 的文本排版与数据绑定单测、`designer/utils/__tests__/element-factory.spec.ts` 与 `property-search.spec.ts`。**本方案不动表格列宽口径**（第 1 项只新增元素自己的数字框），`services/print-render` 的分页类集成测试只在真的扩分页时才需要跑。
- 模板夹具：`demo/src/samples/` 加一个处方样例，供 issue 回帖可直接复现。

## 七、伴侣屏留存（三轮）

服务同一条：`http://localhost:61438/`（带 `?key=`，屏目录在 `.gitignore` 第 21 行，不入库，空闲 4 小时自退）。

- **第一轮 2026-10-22 17:35**：`.superpowers/brainstorm/41539-1792661553/content/flow-list-approaches.html`（方案四档 A/B/C/D ＋ 跨页两档）。该轮屏上点选记录为空，维护者当轮未选，所以第三节四档当时只是候选。本文第三节的线框是它的文字化留存。
- **第二轮 2026-10-23 11:25 / 11:35**：同会话目录 `flow-list-controls.html`（控件形态四题，`events` 记到四条点选 A/甲/提/模）与 `flow-list-autofit.html`（自适应跨列三题，维护者在终端直接作答 甲/一/只）。
- **第三轮 2026-10-23 14:04**：`flow-list-last-three.html`（跨页、跨列上限、开关默认值三题），`events` 记到三条点选 q1/m1/d0。
- 留档口径：伴侣的 `events` 文件**每推一张新屏就被清空**，上面各轮点选在推下一屏时已不可追溯，结果只以本节与第八节的抄录为准（第四屏 `flow-list-ledger.html` 是收工对账屏，无待选项）。
- 补记一处共用冲突：14:07 另一个并行会话往同一屏目录推了 `reset-affordance-form.html`（「恢复默认值」图标形态），把第三轮屏顶掉；维护者授权后于 14:11 以新文件名 `flow-list-last-three-v2.html` 顶回，顶回前确认该外来屏上**没有点选记录**，未销毁任何决策数据。

## 八、已拍板口径（2026-10-22 至 10-23 三轮定档）

**一句话形状**：一个定宽元素，作者填「每行列数」「行高」「单元模板」三样；内容过长时可选打开「自动跨列」并限「最多跨几列」（默认关，上限钳到每行列数）；列数与框宽冲突时只提示、不改用户填的数；跨列结果设计台不预演；数据多过框高不续页，按溢出档处理。

| 题 | 选定 | 依据与照抄对象（坐标已逐行复核） |
| --- | --- | --- |
| 1 控件形态 | 数字框，列数与行高都能指定 | 「每行列数」照抄拼版 `print-canvas/src/components/property/TilingConfig.vue:115`（项目里唯一的列数控件，上限见 `:179`）；行高照抄 `property/TableRowGroup.vue:13-18`（3~100、步进 0.5） |
| 2 行高语义 | 最小高（撑高不裁字） | 沿用表格现口径 `packages/print-core/src/designer/types.ts:233`（注释明写 min-height） |
| 3 列数放不下 | 只提示不写值 | 照抄条码「推荐条宽倍率」那次提交 `7af66c9` 的口径；上限收敛的联动写法见 `TilingConfig.vue:235-243` |
| 4 单元内容 | 表达式模板（整段文本盒） | 复用 `packages/print-core/src/render/expression-eval.ts:52` 的函数表与字段绑定 |
| 5 过长重排 | 占位跨列（吃掉 N 个列位，行里剩不够就整个挪到下一行行首） | 新增语义，无既有先例；列界对齐靠它找回第 4 项丢掉的成列感 |
| 6 自适应配置 | 开关 ＋「最多跨几列」数字框 | 开关照抄 `property/AdvancedGroup.vue:6`、`property/PaginationGroup.vue:7` 的 `.pd-switch`；数字框同第 1 项 |
| 7 设计态可见性 | 不预演，跨列只在预览与三端出纸生效 | 与事实 12 一致（画布既不跑分页也不跑测量，测量趟只在 `packages/print-core/src/print/pipeline.ts:203`） |
| 8 数据多过框高 | 一框一页，**不接分页引擎**；超出按现成溢出档处理 | 溢出三档 `packages/print-core/src/render/text-fit.ts:15`（裁／缩字／自适应撑高）；不动 `pagination-engine.ts` 的切片游标（`:545`）与相对容器（`:704`） |
| 9 「最多跨几列」上限 | 钳到「每行列数」：填 4 列最多跨 4 | 收敛联动写法照抄 `TilingConfig.vue:235-243`；这是全案唯一一处「改用户的值」，与第 3 项构成有意例外（见第五节第 7 项） |
| 10 跨列开关默认值 | 默认关 | 新元素默认属性写在 `element-factory.ts` 的 `createDefaultOptions`（当前 `:9`），`Record<ElementType,…>` 会强制补齐；不擅自改变默认排布 |

**放弃项与代价（如实登记）**

- 放弃第三节的 D（自动算列数）：不引入「实测单元宽除以可用宽」模块，也就绕开了画布没有测量能力这个硬洞；代价是模板作者必须自己想清楚每行几列。
- 第 4 项选「模板」而不是「两个字段选择器」：单元是一个文本盒，**剂量不能独立成格**。第 5 项的跨列把列界对齐找回来了，但「剂量右对齐自成一行一列」在这个组合下做不到，除非作者在模板里用空格凑。回帖给提行人时必须把这条讲在前面。
- 第 7 项选「不预演」：设计台上这个元素永远显示成一列一格，与出纸的跨列结果不一致；属性台需要一句常驻说明（现成口径可参考格式工具栏的常驻提示）。

**当前状态**：十项形态口径已齐，本节只定形态。开工前剩下的都不是版式问题——第五节第 5 项（交付节奏：是否单独开一次 minor 版本）、第 7 项（钳制顶回那一次要不要提示语）、第 8 项（要不要先按本口径回帖给提行人，把「列数要指定」「剂量不成独立列」「一框一页不续页」三条限制讲在前面）。实施情况见第九节。

## 九、实施记录（2026-10-23）

**第八节之后有一处口径修订**（维护者当场提出，已生效）：**取消「列表数据源」配置行**——单元模板改成**一条完整表达式**，列表路径写在模板里（`{drugs.name} {drugs.spec}`），列表源由 core 新增纯函数 `detectFlowListKey` 从表达式检出，检不出来时按「数据里第一个数组」兜底（与表格同口径）。`dataSource` 字段仍留在 schema 里作为手写模板的显式覆盖（优先级高于检出），但两套外壳的属性台都不再出现该行，分组从六行收成五行。

**落点**

- core：`render/flow-list.ts`（新文件——缺省与钳制、宽度估算、占位排布、列表源检出、提示用建议列数，无 DOM）、`designer/types.ts`（`flowList` 进 `ElementType` + 五个 `flow*` 字段）、`designer/utils/element-factory.ts`（默认属性与「流式列表」标题）、`render/data-binder.ts`（非表格元素开始消费数组）、`render/html-generator.ts`（CSS Grid 出纸：`grid-template-columns:repeat(N,minmax(0,1fr))`、`grid-auto-rows:minmax(行高,auto)` 落「最小高」语义、跨列写 `grid-column:span`、框内 `overflow:hidden`）、`designer/utils/binding-registry.ts` 与 `property-search.ts`（单元模板走「内容」分组，tip 与搜索关键词）、`designer/index.ts` 导出、`render/text-fit.ts`（`flowList` 缺省 `clip`）。
- 画布：`elements/FlowListElement.vue`、`property/FlowListGroup.vue`、`LeftPanel.vue` 工具箱、`BaseElement.vue` 分派、`PropertyPanel.vue` 分组挂载。
- 零框架外壳：`shell/flow-list.ts`（新文件）、`shell/panels.ts` 工具箱与图层图标、`shell/elements.ts` 分派、`shell/property-panel.ts` 分组；`.print-flowlist` / `.print-flow-cell` 类名与画布、出纸三处逐字一致，`PARITY.md` 已登记一行。
- 示例：`demo/src/samples/tcm-prescription.ts`「中药处方笺」（A5 纵向、11 味药其中两味带炮制备注、每行 4 列、行高 8mm、间距 4mm、跨列打开上限 2），注册进 `demo/src/samples/index.ts`，并重生成 demo-common 四宿主 `templates.js`（示例数 12 → 13）。
- 文档：`docs/中文/指南/模板设计器.md` 新增「流式列表」小节、中英两份 CHANGELOG、技能 `print-template-json/references/template-schema.md` 的元素类型清单与 `flowList` 专属字段行。

**测试**：core 新增 `render/__tests__/flow-list.spec.ts`（26 项：缺省与钳制、宽度估算、跨列档位、占位换行、列表源检出、提示列数）与 `flow-list-render.spec.ts`（绑定与出纸 HTML 10 项）；canvas 新增 `FlowListElement.spec.ts`（8 项）与 `FlowListGroup.spec.ts`（6 项）；common 新增 `shell/__tests__/flow-list.spec.ts`（8 项）。

**实测数字（出纸）**：示例数据 11 味药、A5 版心 132mm、4 列、间距 4mm、模板 `{drugs.name} {drugs.spec}` 且不写 `dataSource` → 绑定 11 项、出纸 11 格；「炙黄芪（先煎） 30g」与「鸡血藤（后下） 20g」各占 2 列位；共 4 行，前三行都排满 4/4 列位、末行 1/4；4 行 × 8mm 恰等于框高 32mm；页数 1、不断链。

**实施中修掉的两个真问题**

1. `data-binder` 的元素级通用绑定会先把 `formatter` 按整份数据求值——`{drugs.name}` 对「drugs 是数组」求值得到空串，模板被抹平、出纸全是空格。现按元素类型跳过该通用求值（流式列表的模板属于「每行一项」，不是通用单值绑定）。
2. 两套外壳的设计态行上下文最初只并入了整份记录，`{drugs.name}` 同样对数组取路径得空串；现与出纸 `itemCtx` 同形，把列表前缀指向**当前项**（`{drugs.name}` 与 `{name}` 两种写法都求得出值）。

**设计态实测**：把元素从工具箱拖进画布后，画布是一列一格（`repeat(4,minmax(0,1fr))` + `minmax(8mm,auto)` + `overflow:hidden`，与出纸同源），DOM 内无 `grid-column:span` 声明——符合第八节第 7 项「不预演」；跨列结果以预览与三条出纸链路为准。
