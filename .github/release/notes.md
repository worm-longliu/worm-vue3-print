## v1.3.1（2026-09-21） · Release Notes

语言导航：**[简体中文](#简体中文)** ｜ **[English](#english)**

---

<a id="简体中文"></a>

## v1.3.1（2026-09-21）—— 简体中文

自 `v1.3.0` 以来的维护性版本：20 次提交、99 个文件、约 3800 行新增。三件主干事情：**表达式终于能算数**（四则与修约函数族 + 运算符数值语义）、**静默打印 SDK 收进 core 不再单独发包**、**多级表头跨页不再丢层级**；另外把 demo 做成了可以直接在线打开体验的样子（GitHub Pages / EdgeOne Pages）。

> 版本号定为 `1.3.1`，但本版本包含两项**行为变更**（算术运算符语义、静默打印 SDK 导入路径），升级前请先读「破坏性变更」与「行为变更」两节。

### 安装与升级

```bash
npm install @worm-vue3-print/core@^1.3.1 @worm-vue3-print/canvas@^1.3.1
```

发布到 npm 的仍然只有 `core`（渲染引擎与表达式系统）与 `canvas`（Vue 3 设计器）两个包。渲染服务 `services/print-render` 与桌面客户端 `clients/print-client` 在仓库内同仓维护，不发布 npm；浏览器端 SDK 现由 `@worm-vue3-print/core/client` 子路径提供，同样不需要单独安装。

### 新增能力

**表达式：数值运算与修约（core + canvas）**

- **四则函数**：`ADD(a,b,…)`、`SUB(a,b,…)`、`MUL(a,b,…)`、`DIV(a,b)`，与运算符 `+ - * / %` 共用同一套数值语义——不便写运算符的场景（如在属性值里拼表达式）可直接调函数。
- **修约函数**：`ROUND(n,d)` 四舍五入、`ROUNDUP` / `CEIL` 进一法（远离零）、`ROUNDDOWN` / `FLOOR` 去尾法（朝零）、`ROUNDBANK` 四舍六入五成双（GB/T 8170）。`d` 缺省 2，传负数则修约到整十 / 整百（`-2` → 百位）。修约按十进制字符串精确判定，不存在 `toFixed` 的浮点舍入陷阱；`ROUND` 与 `ROUNDBANK` 只在「恰好一半」时不同（前者进位、后者凑偶）。
- **纯函数可直接复用**：core 主入口导出 `addNumbers` / `subtractNumbers` / `multiplyNumbers` / `divideNumbers` / `round` / `roundUp` / `roundDown` / `roundHalfEven`（底层模块 `numeric.ts` 由函数与运算符共用），宿主自有逻辑不必再自己实现一遍。
- **设计器侧同步**：表达式编辑器「函数」页新增「数值运算」分组，四则与修约函数双击即可插入；帮助面板内置函数表同步补充。

**示例与在线预览（demo）**

- **综合示例模板**：A4 横向、多级表头、表格单元格内图片 / 条形码 / 二维码混排，进入页面即自动载入；同时纳入示例库与 `skills/print-template-json` 技能资源。
- **「自定义字段与数据」弹窗**：直接在页面上增删打印数据字段、编辑多份打印数据，批量打印逻辑同步适配。
- **静态托管在线预览**：新增 `edgeone.json`（EdgeOne Pages）与 `.github/workflows/pages.yml`（GitHub Pages，推送 master 自动构建部署）——预览地址 **https://worm-longliu.github.io/worm-vue3-print/**。字体基址与示例图片路径改用 `import.meta.env.BASE_URL` 与当前站点 origin，去掉 localhost 硬编码，适配子路径部署。
- 打印预览弹框改为全屏（内容区占满视口），移除「点击空白处关闭」，新增 Esc 关闭。

### 破坏性变更（升级需要处理）

1. **静默打印浏览器端 SDK 并入 core，不再单独发包**：原 `@worm-vue3-print/client` 迁移为 core 的子路径 `@worm-vue3-print/core/client`。
   → 迁移：把 `import { PrintClient } from '@worm-vue3-print/client'` 改为 `from '@worm-vue3-print/core/client'`。
   原包 `0.1.0` **从未发布到 npm**，因此 npm 上不存在可安装版本，实际影响面仅限仓库内引用与文档；`PrintClient`、`WsTransport`、`WormPrintError`、`MESSAGE_TYPES` 等全部导出符号与能力保持不变，SDK 零运行时依赖（仅浏览器 WebSocket），core 不新增依赖。`packages/print-client-sdk` 目录已删除，桌面客户端（Electron）内部引用同步改走 core。

### 行为变更（同一份模板出纸效果会变）

- **算术运算符（四则与一元正负号）改为数值语义**，都是朝「符合直觉」的方向修：
  ① 两侧都是数字或数字字符串时按数值运算——`'3' + 4` 由 `'34'` 变为 `7`，`{qty + price}` 不再拼出 `312.5`；
  ② 消除二进制浮点噪声——`0.1 + 0.2` 由 `0.30000000000000004` 变为 `0.3`，`12.5 * 3 * 1.13` 由 `42.37499999999999` 变为 `42.375`；
  ③ 除数为 0 或无法解析为数字时返回 `0`，不再输出 `Infinity` / `NaN`；`null` / 空串参与算术按 0、拼接时按空串（此前拼接会印出 `null`）；
  ④ 任一侧不是数字时 `+` 仍保持字符串拼接（`name + '有限公司'` 行为不变）。
- **修约结果修正**：`ROUND(1.005, 2)` 由 `1` 变为 `1.01`、`ROUND(2.675, 2)` 由 `2.67` 变为 `2.68`。旧模板若恰好踩在这类浮点边界上，金额/数量会有一分钱级别的差异。
- **多级表头「每页重复」改为按整个表头区生效**：表头区（第 0 行起的连续标题行）内任一行勾选，整区都会重复；插入标题行、把行改为标题行时自动继承相邻标题行的设置。属性面板开关更名为「表头每页重复」。单行表头行为不变，存量单行表头模板产物逐字一致。

### 关键修复

- **系统变量无法在表达式内参与运算或函数调用**：`{pageIndex + 1}`、`{ADD(pageIndex,1)}`、`{DATE(printDate,'YYYY')}` 求值失败后被当作原文印出（模板求值失败的降级行为），只有「整个花括号就是一个变量」的 `{pageIndex}` 能出结果。根因是绑定阶段的表达式上下文里只有业务数据，而页码要等分页后才有值。现改为：`printDate` / `printTime` 在数据绑定时并入上下文；引用 `pageIndex` / `totalPages` 的表达式在绑定阶段保留原始文本（测量趟按原文测量），最终渲染时按所在页页码重新求值——元素、页眉/页脚、首页叠加与表格单元格四者一致，三端（浏览器预览 / 服务端 PDF / 桌面客户端）同源。**存量模板产物不变**：无 rawFormatter 的模板走快速路径，不做任何重算。
- **多级表头分页续片会丢掉下面几级表头**：多级表头各行由 `rowspan` / `colspan` 连成一个结构整体，而重复此前按行独立判定——只勾首行时续片只重复首行，第二级及以后整段丢失，首行的跨行主格还会越界吃掉数据行的位置。现按表头区整体重复，重复行数按 `rowspan` 完整性对齐到最近的闭合边界，跨出表头区的主格在续片渲染时裁剪到边界内。

### 已知限制

- 多级表头的重复粒度是「表头区」而非「单行」：区内任一行勾选即整区重复，暂不支持只重复区内某一行。
- 多页面模板出纸时「内容旋转角度」取首页的 `outputRotation`（1.3.0 遗留，角度尚未纳入一致性校验）。
- render 的截图接口对 `printData` 数组只渲染首条，PDF 接口才全量渲染。

---

<a id="english"></a>

## v1.3.1 (2026-09-21) — English

Maintenance release since `v1.3.0`: 20 commits, 99 files, ~3.8k added lines. Three headline items: **expressions can finally do arithmetic** (four-operation and rounding function families, plus numeric semantics for the operators), **the silent-print browser SDK moved into core** and is no longer published separately, and **multi-level table headers no longer lose their lower levels across pages**. The demo also became something you can just open online (GitHub Pages / EdgeOne Pages).

> The version is `1.3.1`, but this release contains two **behavior changes** (arithmetic operator semantics and the SDK import path). Read "Breaking changes" and "Behavior changes" before upgrading.

### Install / upgrade

```bash
npm install @worm-vue3-print/core@^1.3.1 @worm-vue3-print/canvas@^1.3.1
```

Only `core` (engine + expression pipeline) and `canvas` (Vue 3 designer) are published to npm. The render service (`services/print-render`) and desktop client (`clients/print-client`) remain in-repo and unpublished; the browser SDK now ships as the `@worm-vue3-print/core/client` subpath, so there is nothing extra to install.

### Added

**Expressions: numeric arithmetic and rounding (core + canvas)**

- **Arithmetic functions** `ADD(a,b,…)`, `SUB(a,b,…)`, `MUL(a,b,…)`, `DIV(a,b)` sharing one numeric semantics with the `+ - * / %` operators — handy where operators are awkward to write.
- **Rounding functions**: `ROUND(n,d)` half-up, `ROUNDUP` / `CEIL` away from zero, `ROUNDDOWN` / `FLOOR` toward zero, `ROUNDBANK` half-to-even (GB/T 8170). `d` defaults to 2; a negative `d` rounds to tens/hundreds (`-2` → hundreds). Rounding is decided on the exact decimal string, so the `toFixed` float traps do not apply; `ROUND` and `ROUNDBANK` differ only on an exact half.
- **Reusable pure functions**: the core entry point exports `addNumbers` / `subtractNumbers` / `multiplyNumbers` / `divideNumbers` / `round` / `roundUp` / `roundDown` / `roundHalfEven` (backed by `numeric.ts`, shared by both functions and operators), so host code does not have to reimplement them.
- **Designer parity**: the expression editor gained a **Numeric** function group (double-click to insert) and the in-app help function table was updated.

**Samples & online preview (demo)**

- **Comprehensive showcase sample template**: A4 landscape, multi-level table header, images / barcodes / QR codes rendered inside table cells; it loads automatically on mount and is registered in the sample library and in the `skills/print-template-json` assets.
- **Custom fields & data dialog**: add or remove print-data fields and edit the data of several copies right on the page; batch printing follows the same data.
- **Static hosting for the online preview**: new `edgeone.json` (EdgeOne Pages) and `.github/workflows/pages.yml` (GitHub Pages, builds and deploys on every push to master) — preview at **https://worm-longliu.github.io/worm-vue3-print/**. Font base URL and sample images now use `import.meta.env.BASE_URL` / the current site origin instead of a hardcoded `localhost`, so sub-path deployments work.
- The print preview dialog is now full-screen (content fills the viewport); click-outside-to-close was removed and Esc closes it.

### Breaking changes (action required)

1. **The silent-print browser SDK was merged into core and is no longer published separately**: `@worm-vue3-print/client` becomes the core subpath `@worm-vue3-print/core/client`.
   → Migrate: change `import { PrintClient } from '@worm-vue3-print/client'` to `from '@worm-vue3-print/core/client'`.
   Version `0.1.0` was **never published to npm**, so there is no installed package to migrate from — the impact is limited to in-repo imports and docs. All exports and capabilities (`PrintClient`, `WsTransport`, `WormPrintError`, `MESSAGE_TYPES`, …) are unchanged; the SDK still has zero runtime dependencies (browser WebSocket only) and core gains none. The `packages/print-client-sdk` directory was removed and the Electron desktop client now imports from core.

### Behavior changes (existing templates will print differently)

- **Arithmetic operators (binary and unary `+` / `-`) now use numeric semantics** — all moving toward what users expect:
  ① both sides numeric (or numeric strings) are added numerically — `'3' + 4` was `'34'`, now `7`; `{qty + price}` no longer concatenates into `312.5`;
  ② binary float noise is removed — `0.1 + 0.2` was `0.30000000000000004`, now `0.3`; `12.5 * 3 * 1.13` was `42.37499999999999`, now `42.375`;
  ③ division by zero (or an unparsable divisor) returns `0` instead of `Infinity` / `NaN`; `null` / empty string count as `0` in arithmetic and as `''` when concatenating (previously `null` was printed);
  ④ `+` still concatenates when either side is not numeric (`name + ' Ltd.'` unchanged).
- **Rounding results corrected**: `ROUND(1.005, 2)` was `1`, now `1.01`; `ROUND(2.675, 2)` was `2.67`, now `2.68`. Templates that happened to sit on such float boundaries may shift by a cent in amounts or quantities.
- **"Repeat on every page" for multi-level headers now applies to the whole header zone**: checking any row in the header zone (the consecutive header rows starting at row 0) repeats the entire zone, and inserting a header row or changing a row type to header inherits the neighbouring header row's setting. The property-panel switch is renamed "表头每页重复". Single-row headers behave exactly as before and existing single-row-header templates render byte-identically.

### Notable fixes

- **System variables could not be used inside an expression**: `{pageIndex + 1}`, `{ADD(pageIndex,1)}` and `{DATE(printDate,'YYYY')}` failed to evaluate and were printed verbatim (the fallback for failed evaluation); only a bare `{pageIndex}` worked. Cause: the binding-time expression context contained business data only, and page numbers are unknown until pagination. Now `printDate` / `printTime` are merged into the binding context, and expressions referencing `pageIndex` / `totalPages` keep their source text at binding time (the measurement pass measures the raw text) and are re-evaluated per page during final rendering — consistently for elements, header/footer, first-page overlay and table cells, and identically across browser preview, server-side PDF and the desktop client. **Output for existing templates is unchanged**: templates without any raw formatter take a fast path with no re-evaluation.
- **Multi-level table headers lost every level below the first on continuation pages**: the rows form a single structure through `rowspan` / `colspan`, but repeating was decided per row — with only the first row checked, continuation pages repeated just that row, and the row-spanning master cell could overrun and swallow the position of the data rows. The whole header zone now repeats, the repeat count is aligned to the nearest `rowspan`-closed boundary, and a master cell overrunning the zone is clamped during continuation rendering.

### Known limitations

- Multi-level header repetition is scoped to the **header zone**, not to individual rows: checking any row repeats the whole zone; repeating a single row within a zone is not supported.
- For multi-page templates the **content rotation angle is taken from the first page** (carried over from 1.3.0; rotation is not part of the consistency check yet).
- The render service screenshot endpoint renders only the first item of a `printData` array, while the PDF endpoint renders them all.

---

感谢所有提交者与反馈者。问题请在 [Issues](https://github.com/worm-longliu/worm-vue3-print/issues) 提出，完整变更见 [`docs/中文/CHANGELOG.md`](/docs/中文/CHANGELOG.md)。
