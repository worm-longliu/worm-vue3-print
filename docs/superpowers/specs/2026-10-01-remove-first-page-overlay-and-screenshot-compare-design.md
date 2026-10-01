# 移除「首页专属」「叠层对比」与服务端截图能力 — 设计说明

日期：2026-10-01　影响版本：`@worm-vue3-print/{core,canvas,common}` 1.3.5 → 2.0.0（破坏性）

## 一、目标与裁决

用户明确要求去掉设计器的「首页专属」与「叠层对比」两项能力。此前（同日早前）的裁决是「都保留」，本次推翻。经四项确认：

1. 首页专属**连根删除**，含 core schema 字段与渲染管线，`migrate` 改为剥离旧字段。
2. 叠层对比**连服务端截图能力一起删**（core `renderScreenshot` + print-render `/render/screenshot` 端点）。
3. 定级**破坏性**，三个已发布包升 **2.0.0** 并记 CHANGELOG。
4. 在制品处置：先把无关的 common 拖拽吸附修复单独提交，再在干净基线上执行删除。

工具栏演示视频（`demo/video/script-toolbar.json:165/174` 含这两按钮镜头）**不重录**，仅在 CHANGELOG 注明视频与 2.0.0 UI 不一致。

## 二、删除范围

### 2.1 首页专属（`firstPageOverlay`）

| 层 | 位置 | 处置 |
| --- | --- | --- |
| schema 类型 | `print-core/src/designer/types.ts:55-58`、`src/render/types.ts:86` | 删除字段 |
| 迁移 | `src/designer/utils/migrate.ts:32-34` | 改为**剥离** `firstPageOverlay`，不再做 pt→mm 叠加换算 |
| 分页 | `src/render/pagination-engine.ts:216`、`274`、`296` | 移除首页预算扣减 `overlayH` 与首页内容下推 |
| CSS | `src/render/css-builder.ts:211`、`240-245` | 移除 `.first-page-overlay` 几何块 |
| HTML | `src/render/html-generator.ts:121`、`133`、`247-250`、`264`、`301`、`310` | 移除测量趟叠加 div、`pageIndex===0` 分支、按页重算与页码引用探测中的叠加项 |
| 数据绑定 | `src/render/data-binder.ts:36-38`、`src/print/apply-text-fit.ts:35` | 移除叠加元素分支 |
| 注释 | `src/print/pipeline.ts:242`、`src/render/continuous-paper.ts:3` | 措辞同步 |
| canvas UI | `DesignerToolbar.vue:78`、`184`；`PrintDesigner.vue:32`、`430-444`；`PropertyPanel.vue:160-161`、`360`、`477-482`；`CanvasPaper.vue:119-126`、`545-555` | 按钮、事件、占位带、样式全删 |
| canvas 状态 | `useDesignerState.ts:42`、`69-72`、`108-114`、`214`、`551`；`useHistory.ts:76` | 默认值、载入、序列化、历史快照、复制页重建一并简化，不留空壳 |
| canvas 元素 | `elements/BaseElement.vue:81`、`353-356` | 联合成员 `'overlay'` 全仓无传入，直接删 |
| common 镜像 | `shell/toolbar.ts:53`；`shell/property-panel.ts:281`；`shell/canvas.ts:94-99`；`print-designer.ts:649`、`714-727`；`core/store.ts:44`、`65-71`；`core/default-template.ts:12`；`src/styles/designer.css:340` | 与 canvas 同口径删除 |

术语防撞（硬约束）：`add-overlay-element` 与 `toggle-overlay` 在 `DesignerToolbar.vue:78/79`、`shell/toolbar.ts:53/54`、`print-designer.ts:648/649`、`shell/canvas.ts:96/207-211` 四组相邻位置分属两个功能，逐处 Edit 时不得连坐。`.zone-overlay`（容器占位，随首页专属删）与 `.overlay-layer`（截图层，随叠层对比删）同形不同物。`ExpressionEditor.vue:2`、`native-controls.css:226` 的 `.pd-dialog-overlay` 与本设计无关，不动。

### 2.2 叠层对比（截图叠层）

- canvas：`PrintDesigner.vue:14`、`29`、`84-86`、`154`、`192-193`、`300-332`（`overlayVisible/screenshotUrl/overlayOpacity` + `toggleOverlay()` + `requestScreenshot` prop）；`DesignerToolbar.vue:79`、`151`、`181`；`CanvasArea.vue:37-40`、`138-140`、`653-664`。
- canvas 入口：`index.ts` 是 `export type * from '@worm-vue3-print/core/designer'` 通配再导出（`14-15`），**没有具名导出行可删**，只需去掉第 14 行注释里点名的 `ScreenshotRequest/RequestScreenshotFn` 与第 2 行「保存/字段/**截图**/上传/业务字典由宿主注入」中的截图字样。
- common：`print-designer.ts:10`、`108`、`132-133`、`306-308`（公开方法 `setOverlay()`）、`312-336`、`491-493`、`648`；`shell/canvas.ts:17-19`、`207-211`；`shell/toolbar.ts:54`；派生样式 `designer.css:340`。
- core 共享类型：`designer/types.ts:425-432`（`ScreenshotRequest` / `RequestScreenshotFn`）。
- 帮助文案与文档：两侧 `help-content/faq.ts`、`print-canvas/README.md:92`、PARITY.md 相关行。

### 2.3 服务端截图

- core：`print/pipeline.ts:46`（`renderScreenshot`）、`8`、`57`、`71`；`print/pdf-spec.ts:64-68`（`buildScreenshotTargetSpec`）；`print/types.ts:36`（`ScreenshotTargetSpec`）；`print/ports.ts:33`（`PrintSession.toScreenshot`）；`print/driver.ts:48`（`PageDriver.screenshot?`）；`print/dom-host-runtime.ts:119-133`。
- core 出口链：`print/index.ts` 与 `src/index.ts:107` 均为 `export *`，**无需改导出语句**；要同步的是测试断言清单 `print/__tests__/exports.spec.ts:7`（去掉 `'renderScreenshot'`）与文案 `packages/print-core/README.md:29`、`32`（入口清单与 `PageDriver` 可选方法描述）。
- print-render：`src/server.ts:5`、`106-135`（含 `128` 调用）；`src/pdf-render.ts:6`、`50`；`src/driver-playwright.ts:53-60`；`src/screenshot.test.ts` 整文件；`.github/workflows/ci.yml:45` 定向用例。
- print-client：仅测试桩 `src/main/print-engine.test.ts:40` 的 `toScreenshot`，删桩。

已核实：`/render/pdf` 走 `renderPdf`，与 `renderScreenshot` 无共用；`demo/video/*.mjs` 与 `demo-common/scripts/verify-demo.mjs` 中的 `page.screenshot` 是 Playwright 自身 API，与本能力无关。

## 三、兼容与资产处置

1. **旧模板导入**：`migrate` 剥离 `firstPageOverlay`，残留该键的模板不报错；`height>0` 或 `elements` 非空的模板排版回归「无首页叠加区」——这是唯一真实行为变更，仓库内资产全为 `{height:0,elements:[]}`，风险只落在外部自有模板。
2. **模板资产**：skills 8 份 JSON、`demo/src` 3 份 JSON、`demo/src/samples` 7 份 ts、`clients/print-client/src/main/test-template.json` 删除该键；`skills/print-template-json/scripts/build_template.py:10`、`326` 必须同步（否则生成器持续产出废弃字段）；`references/template-schema.md:25` 删条目。
3. **golden 夹具**：`print-core/src/render/__fixtures__/build-page-css.json` 4 个键均刻有 `.first-page-overlay`，仓内已无 dump 脚本，按 css-builder 新输出手改 4 键，由 `css-builder.test.ts` 证明一致。
4. **产物重生成**：`demo-common/apps/{vue3,vue2,react,jquery}/src/templates.js` 与 vendor 走既有同步脚本重生成，禁手改。
5. **文档**：PARITY.md（约 6 行）、三包 README、`docs/中文/{指南/模板设计器,使用指南,接口/API文档,指南/渲染管线,三端渲染一致性方案,打印设计工作台-布局线框图}`、`docs/en/{Overview,CHANGELOG.en}`、skills references。历史 CHANGELOG 条目（`CHANGELOG.md:105-116`、`CHANGELOG.en.md:125/136`）作为事实记录保留不改。
6. **存档**：`docs/superpowers/plans/2026-10-01-first-page-overlay-editable.md`（B 方案，未实施）删除；历史 spec/plan 中的既成记述保留为存档。

## 四、版本与对外记录

- `core`、`canvas`、`common`：1.3.5 → 2.0.0。`render`（private）、`print-client`（private）、`demo`（private）版本号不动。
- CHANGELOG 新增 2.0.0 破坏性条目，列明三项移除能力、迁移指引（旧字段自动剥离、排版回归）、演示视频口径。不写发布日期预告。

## 五、实施顺序

1. 提交无关在制品：common 拖拽吸附修复 + `adsorb-drag.spec.ts`。
2. 从工作区剔除首页专属 A 方案改动（canvas/common 两处 + PARITY.md 首页叠加行），删两份 `first-page-overlay-default.spec.ts`。
3. print-core：schema + 管线 + migrate 剥离（§2.1 前半），含 golden 夹具重录。
4. print-core：截图入口整链（§2.3 core 部分）+ 导出清单。
5. canvas（权威）→ common（镜像）：UI、状态、样式、类型导出（§2.1 后半 + §2.2）。
6. print-render + print-client + CI。
7. 文档、模板资产、skills、产物重生成、版本号与 CHANGELOG。

## 六、验收

- `npm run build`、`npm test` 全绿；`npm run test -w @worm-vue3-print/render` 通过。
- 定向回归：`css-builder.test.ts`、`pagination-engine*.test.ts`、`html-generator.test.ts`、`data-binder.test.ts`、`migrate.spec.ts`、`multi-template.spec.ts`、`apply-text-fit.spec.ts`、`exports.spec.ts`、`DesignerToolbar.spec.ts`。
- grep 零残留：`firstPageOverlay`、`overlayVisible`、`toggle-overlay`、`requestScreenshot`、`renderScreenshot`、`ScreenshotTargetSpec`（排除 `dist`、`node_modules`、`.workbuddy`、历史 spec/plan 存档）。
- UI 级确认：设计器工具栏与视图下拉无这两项；demo 与 demo-common 四宿主构建产物可加载、模板导入导出不报错。

## 七、已知风险

1. 叠层对比成功路径本地从未执行（demo 未注入 `request-screenshot`），删除前无红灯可依赖，只能靠 TS 编译与 grep 兜底。
2. golden 夹具手改属"以测试为准"的反向操作，须逐键比对 css-builder 实际输出。
3. `common` 与 `canvas` 双份镜像删除存在漏项风险（历史上多次一侧落后），以 PARITY.md 逐行核对收口。
