# 预设字体与手动字体查询设计

日期：2026-09-18
范围：`packages/print-core`（字体目录合并语义）、`packages/print-canvas`（字体下拉的展示与查询入口、`PrintDesigner` 宿主契约）、`demo`（宿主接线示例）、`docs`（指南与更新日志）。
前置文档：`docs/superpowers/specs/2026-09-18-font-settings-design.md`（字体源、清单语义、缺失校验的基础设计）。

## 1. 背景与目标

### 现状

1. 字体清单只能由宿主经 `serverFonts` / `clientFonts` 两个 props 注入，设计器**无法干预取数时机**：宿主通常在设计器挂载时就请求（`demo/src/App.vue:107-110` 在 `onMounted` 里取服务端清单），即使设计者从不打开字体下拉也要付出一次取数成本。
2. 宿主无法预设「业务常用字体」：所有字体都只能等出图端上报后才出现在下拉里，未上报或未连接时下拉是空的。
3. 清单取不到时，下拉只给出「服务端字体清单不可用」这类**描述性**文案，没有告诉设计者「该去连什么」。

### 目标

1. `PrintDesigner` 新增预设字体 prop：宿主声明的字体**按数组顺序置顶**出现在字体下拉中，不依赖任何出图端即可选用。
2. 字体清单改为**手动触发**：设计者点击字体输入框旁的按钮才发起查询，请求由宿主提供（`loadFonts` 适配器），未点击则不发任何请求。
3. 查询后发现某一端不在线时，提示设计者**去连接该端**（服务端 / 桌面客户端）。
4. 全部改动对现有接线向下兼容：不传新 prop 时行为与当前一致。

### 非目标

- 不做「字体不存在时自动查询」：任何自动请求都会随输入过滤、面板开关反复触发，且宿主取数可能带鉴权成本。查询只由按钮点击触发。
- 不做 `autoLoadFonts` 之类的自动开关（后续需要时再加）。
- 不做字体文件上传 / 模板内嵌字体 / `@font-face` 注入（沿用前置文档的选型结论）。
- 不做跨语言字体别名归一（「宋体」与 `SimSun` 仍是两个字体名）。
- 不做查询结果的持久化缓存（不做 localStorage / 后端缓存），仅组件生命周期内存留。
- 预设字体**不是**「该字体在出图端可用」的背书，见第 3.3 节。

## 2. 决策摘要

| 决策点 | 结论 |
|---|---|
| 预设字体 prop | `presetFonts?: readonly string[]`，默认 `[]` |
| 预设排序 | 按数组顺序置顶，不与远端清单混排 |
| 预设与远端同名 | 合并为一行，保留预设位置与预设写法，补上真实 `sources` |
| 预设独有字体 | `sources: []`，标注「预设」；缺失校验不因它而被抑制 |
| 取数触发 | 仅用户点击字体输入框旁按钮；`loadFonts` prop 由宿主实现 |
| 按钮显示条件 | 宿主提供了 `loadFonts` 即显示（可重复点击重查） |
| 离线提示 | 查询后按端分别提示「请连接服务端 / 桌面客户端后重新查询」 |
| 查询失败 | 提示「字体查询失败：<原因>，请检查服务端与桌面客户端连接后重试」 |
| props 与查询结果优先级 | `props.serverFonts ?? fetched.server`（宿主显式注入即权威） |

## 3. core 合并语义

### 3.1 `mergeFontSources` 参数扩展

`packages/print-core/src/print/fonts.ts` 的 `mergeFontSources` 增加可选字段，签名向后兼容（现有调用与测试无需改动）：

```ts
export function mergeFontSources(input: {
  preset?: readonly string[];
  server: FontSourceReport;
  client: FontSourceReport;
}): FontCatalog;
```

### 3.2 合并规则

1. 预设名单先经 `normalizeFontList`（去空白、丢空值、按大小写不敏感去重、保留首次出现写法），再按数组顺序入目录，`sources` 为 `[]`。
2. 远端清单（`server` → `client`）逐个入目录：同名字体**只补 `sources`，不新增行、不移动位置**，族名写法保留先入者（预设优先）。
3. 远端独有字体排在预设之后，排序沿用既有规则：可用端数降序 → 族名升序（`compareFamily`，与 locale 无关）。
4. `preset` 缺省或为空数组时，输出与当前实现**逐字节等价**。

### 3.3 契约与后果

- `FontCandidate.sources` 的既有语义是「真实上报成功且包含该字体的端」，`[]` 恰好表达「宿主预设、未经任一出图端确认」。此语义写入类型注释。
- `findMissingFonts` **不因预设而改变**，仍只认 `sources`：清单已取到且确无该字体 → 照常报缺失；清单未取到（`available === false`）→ 直接返回空，不臆断缺失。因此「预设置顶」是可用性 UI 的便利，不是出图保证。
- 预设字体出现在目录中，`FontSelect` 的 `unknownFamily` 不再把它标注为「（未知）」。

## 4. canvas：查询状态与展示

### 4.1 查询状态机（新增 `useFontQuery`）

`packages/print-canvas/src/composables/useFontQuery.ts`（新增）承载「是否可查 / 查询中 / 查询结果 / 失败原因」，由 `PrintDesigner` provide、`FontSelect` inject。注入键本身按既有约定放在 `packages/print-canvas/src/composables/useHostAdapter.ts`（与 `FONT_CATALOG_KEY` 同处）。

```ts
export type FontQueryStatus = 'idle' | 'loading' | 'done' | 'failed';

export interface FontQueryHandle {
  /** 宿主是否提供 loadFonts；false 时 UI 不渲染查询按钮 */
  canQuery: boolean;
  status: FontQueryStatus;
  /** status === 'failed' 时的原始错误信息（用于提示文案） */
  error?: string;
  /** 未提供 loadFonts 时的空实现 */
  run: () => void;
}

/** 未注入时的默认值：{ canQuery: false, status: 'done', run: () => {} } */
export const DEFAULT_FONT_QUERY: ComputedRef<FontQueryHandle>;
```

```ts
// packages/print-canvas/src/composables/useHostAdapter.ts
export const FONT_QUERY_KEY: InjectionKey<ComputedRef<FontQueryHandle>>;
```

- 默认值取 `status: 'done'`，使**未走手动查询**的宿主（直接注入 props）保持今天的提示行为不变。
- `run()` 在 `status === 'loading'` 时直接返回，重复点击不并发；成功后 `status = 'done'` 并清空 `error`，失败后 `status = 'failed'` 并记录 `error`。

### 4.2 `PrintDesigner` 装配

- `useFontCatalog(serverFonts, clientFonts, presetFonts)` 增加第三个参数（`MaybeRefOrGetter<readonly string[] | undefined>`），透传给 `mergeFontSources`。
- 查询结果存内部 `fetched` 状态（`{ server, client } | undefined`），最终展示取值：`props.serverFonts ?? fetched.server`、`props.clientFonts ?? fetched.client`。
- `loadFonts` 未提供时不渲染查询按钮，`fetched` 恒为 `undefined`，行为与当前一致。

### 4.3 `FontSelect` UI

- **布局**：输入框与查询按钮同一行——`.font-select-row`（flex）内放 input（`flex: 1`）与按钮，按钮文案「查询字体」；hint 区保持在下方。
- **按钮状态**：`status === 'loading'` 时 `disabled` 且文案变「查询中…」；其余状态可点击（查询成功后再点即重查）。
- **行序**：空值行 → 未知行 → 预设字体 → 远端字体。预设独有的字体（`sources.length === 0`）在族名后追加「预设」，与既有「仅服务端」「仅本机」标注同格式。
- **过滤**：沿用 `filterFontCandidates`（同档保持目录顺序），预设因目录顺序天然继续置顶，不新增排序分支。

### 4.4 提示文案

hint 区按以下优先级渲染，最多两条（服务端 / 客户端各一条）：

| 条件 | 文案 |
|---|---|
| `status === 'idle'`（可查询、尚未查询，且 props 未提供任一端清单） | 「尚未获取服务端与本机字体清单，点击「查询字体」获取」 |
| `status === 'loading'` | 「正在查询服务端与本机字体清单…」 |
| `status === 'failed'` | 「字体查询失败：<error>，请检查服务端与桌面客户端连接后重试」 |
| `status === 'done'` 且 `available.server === false` | 「服务端未连接，请连接服务端后重新查询」 |
| `status === 'done'` 且 `available.client === false` | 「桌面客户端未连接，请连接桌面客户端后重新查询」 |

`status` 由查询状态机独立维护，与 props 无关：宿主既传 props 又提供 `loadFonts` 时，props 已给出结果，因此不显示 idle 文案，`status` 保持 `idle` 直到用户点击查询、成功后转 `done`。

未注入查询句柄（默认 `done`）时退化为现有两条文案的行为：`available` 为 false 的端给出「未连接」提示，其余不提示。既有用例（「客户端未连接时提示本机字体未知」等）需要同步更新文案断言。

## 5. 宿主契约

```ts
// PrintDesigner 新增 props
/** 宿主预设的常用字体族名，按数组顺序置顶展示；不参与出图端可用性判定 */
presetFonts?: readonly string[];
/** 手动字体查询适配器：用户点击「查询字体」时调用；不传则不渲染查询按钮 */
loadFonts?: () => Promise<{ server: FontSourceReport; client: FontSourceReport }>;
```

- `loadFonts` 与既有 `uploadImage` / `requestScreenshot` 同构：canvas 只负责调用与渲染结果，不关心服务端地址、鉴权与 WS 连接（包边界不破坏）。
- 约定：某一端无法取到时，宿主应 **resolve** `{ available: false, fonts: [] }` 而不是抛错——「离线」是可预期的业务状态；仅在查询流程本身失败（网络异常、接口报错）时 reject，`FontSelect` 才会走第 4.4 节的失败文案。
- 不新增 emit：宿主即 `loadFonts` 的实现者，需要旁听结果时在自身实现里处理。
- 保留轮询式回填：宿主仍可只传 `serverFonts` / `clientFonts`（今天的用法），此时不显示按钮。

## 6. demo 接线

- 删除 `demo/src/App.vue` 中 `onMounted` 的自动 `fetchServerFonts()`，改为传入 `:preset-fonts` 与 `:load-fonts`。
- `loadFonts` 内部复用 `demo/src/render-client.ts` 的服务端取数与桌面客户端 SDK 的 `listFonts()`（即 `demo/src/components/PrintOutputDialog.vue:191-212` 里已在使用的那条链路），各自失败时降级为 `{ available: false, fonts: [] }`。
- demo 顺带演示预设字体（业务常用中文字体若干），用于人工确认置顶与「预设」标注。

## 7. 兼容性与行为变更

- `mergeFontSources` 新增可选参数，不传时输出不变；`FontCatalog` 结构不变，下游（`StatusBar`、缺失校验、渲染侧）无需改动。
- `FontSelect` 新增按钮：仅当宿主提供 `loadFonts` 时出现；既有宿主看不到它。
- 既有提示文案在 `status === 'done'` 时变化（补「请连接…后重新查询」），属于文案级行为变更，需同步 `docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`。
- `docs/中文/指南/模板设计器.md` props 表补齐 4 项：`presetFonts`、`loadFonts`，以及当前缺漏的 `serverFonts`、`clientFonts`。

## 8. 测试

### core（`packages/print-core/tests/fonts.test.ts`）

1. 预设字体置顶且保持数组顺序；远端独有字体仍按「端数降序 + 族名」排在其后。
2. 预设与远端同名：只有一行、位置在预设处、`sources` 合并为真实端集合、族名写法保持预设。
3. 预设去重与规范化：空串、纯空白、大小写不同的重复项只保留首次出现。
4. `preset` 缺省 / 空数组时输出与既有用例期望一致（回归）。
5. 缺失校验：预设独有字体在清单已取到时仍报缺失，清单未取到时（`available: false`）不报。

### canvas（`packages/print-canvas/src/__tests__/`）

1. `useFontCatalog`：预设透传进目录且置顶。
2. `useFontQuery`：`idle → loading → done`；重复点击不并发；reject 后 `failed` 且记录 `error`。
3. `FontSelect`：无 `loadFonts` 时不渲染按钮；点击按钮调用一次 `run`；loading 时按钮禁用且文案为「查询中…」。
4. `FontSelect`：预设置顶、预设独有项标注「预设」、过滤后仍置顶、预设字体不标「未知」。
5. `FontSelect` 提示文案：idle / loading / failed / 各端 `available === false` 五种分支。

### 验证命令

- `npm run build`
- `npm test -w @worm-vue3-print/core`、`npm test -w @worm-vue3-print/canvas`

## 9. 受影响文件清单

| 文件 | 改动 |
|---|---|
| `packages/print-core/src/print/fonts.ts` | `mergeFontSources` 增加 `preset` 参数与置顶/合并规则 |
| `packages/print-core/tests/fonts.test.ts` | 预设合并与缺失校验用例 |
| `packages/print-canvas/src/composables/useFontCatalog.ts` | `useFontCatalog` 增加 `presetFonts` 参数 |
| `packages/print-canvas/src/composables/useFontQuery.ts` | 新增查询状态机与注入键 |
| `packages/print-canvas/src/composables/useHostAdapter.ts` | 新增 `FONT_QUERY_KEY` |
| `packages/print-canvas/src/components/PrintDesigner.vue` | 新增两个 prop、装配查询状态、结果优先级 |
| `packages/print-canvas/src/components/property/FontSelect.vue` | 同行按钮、预设置顶与标注、五种提示文案 |
| `packages/print-canvas/src/__tests__/*` | 上述行为的用例（新增/更新文案断言） |
| `demo/src/App.vue`、`demo/src/render-client.ts` | 去掉自动取数，改传 `presetFonts` / `loadFonts` |
| `docs/中文/指南/模板设计器.md`、`docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md` | props 表与变更条目 |

## 10. 未验证假设（实现期必须验证）

1. `@worm-vue3-print/client` 的 `PrintClient.listFonts()` 在 WS **未连接**时的行为：是 reject 还是 resolve `{ available: false }`。这决定 demo 的 `loadFonts` 是否需要自行 catch（按第 5 节约定，宿主应把它转成 `available: false`）。`demo/src/components/PrintOutputDialog.vue:204-212` 目前用 try/catch 兜成 unavailable，实现期需读 SDK 源码确认而不是照抄。
2. 服务端 `/fonts` 端点不可达时的响应形态（连接被拒 vs 非 2xx），决定 demo 侧 `fetchServerFonts()` 的降级分支是否已覆盖。
3. `useId()` 生成的 id 在同一应用树内唯一（已在前一轮修复中实证），本设计不依赖其跨 root 唯一性。
