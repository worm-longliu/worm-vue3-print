# 元素旋转 / 拼版整页旋转 全量测试验证记录（2026-10-28）

> 目标：对**元素级旋转 `options.rotate`** 与**拼版模式整页旋转 `outputRotation`** 做全量测试验证。
> 口径：发现问题**只记录不堵塞**，不改代码、不提交。工作区实况 = 两功能均已实现、未提交。

## 一、验证范围与载体

| 层 | 手段 | 载体 |
| --- | --- | --- |
| 单元/集成测试 | `npm test`（core/canvas/common/client）+ `npm run test -w @worm-vue3-print/render` | 见第二节数字 |
| 真实管线（离线层） | 分页/出纸 HTML/CSS/拼版几何逐条判据 | `.lab-rotation/vf-offline.mjs` → `.lab-rotation/out/verify-full-offline.json` |
| 真实管线（浏览器层） | Chromium + `prepareDocument` 全链路 + print 媒体几何量测 + PDF 文本矩阵 | `.lab-rotation/vf-geo.mjs` → `.lab-rotation/out/verify-full-geo.json`、`out/vf-tile-*.pdf` |
| 设计器 UI | Playwright 驱动真实宿主（canvas 9413 / print-common 9414） | `.lab-rotation/vf-ui2.mjs`、`vf-ui-common.mjs`、`vf-ui-common2.mjs` → `out/verify-ui-*.json`、`out/ui-*.png` |
| 文档/提示语对账 | 实现口径 ↔ tip ↔ CHANGELOG ↔ 指南 ↔ API 文档 | 见第五节 P2/P3 |

验证件在 `.lab-rotation/`（已进 `.git/info/exclude`，不入版本库），宿主端口为避开并发会话另起。

## 二、测试数字（实跑，无跳过）

> 下表是**验证轮当时**的基线数字；修复轮新增 40 条用例后的最新总数见第八节首段（209 文件 2399 条）。

| 包 | 测试文件 | 用例 | 结果 |
| --- | --- | --- | --- |
| `@worm-vue3-print/core` | 79 | 1179 | 全绿 |
| `@worm-vue3-print/canvas` | 73 | 692 | 全绿（`pretest` 的 `vue-tsc --noEmit` 同步通过） |
| `@worm-vue3-print/print-common` | 28 | 327 | 全绿 |
| `@worm-vue3-print/print-client` | 14 | 110 | 全绿 |
| `@worm-vue3-print/render`（服务端） | 10 | 38 | 全绿（含 4 条拼版旋转真实 PDF 集成用例） |
| 合计 | 204 | 2346 | 全绿 |

旋转相关新增用例分布：`render/rotation.test.ts`（9）、`render/pagination-rotation.test.ts`（8）、`print/__tests__/tiling.spec.ts`（6）、`tile-compose.spec.ts`（2）、canvas `TilingConfig.spec.ts`（1）、common `tiling-rotation.spec.ts`（4）、render `tiling.integration.test.ts`（4）。

`npm run parity:cross-end`：本轮**未跑双腿**（需服务端 PDF + 客户端 PDF 两个入参，缺参时脚本正确 `exit 2`）。

## 三、正向结论（已证）

### 元素级旋转

1. **AABB 结算生效**：45°/220 单页无溢出 `renderTop=220`；带前置高元素时换页 `renderTop=32.43`，AABB 顶贴新页列游标（`out/verify-full-geo.json` G7 与 2026-10-27 spike 数字一致）。
2. **直角档逐字退化**：0°/180° AABB = 原盒，未旋转模板产物不变（`rotation.test.ts` + 离线 `E4`）。
3. **角度归一**：`-45→315`、`405→45`、`360→0`、`NaN/Infinity/null→0`；出纸声明写作 `rotate:315deg`（离线 `E5`）。
4. **测量趟不转**：`rotate` 声明只出现在最终趟（离线 `E4`、`pagination-rotation.test.ts` 判据 2）。
5. **v1 排除项一致**：`table`、`flowList` 出纸不出旋转声明、分页不扩 AABB（离线 `E1`/`E6`），两宿主属性台同步隐藏该行（UI `U2`：表格元素选中时旋转行缺席）。
6. **与图片剪裁/边框/水印不冲突**：走 CSS 独立属性 `rotate`，`transform` 不被占用（离线 `E3`：`style` 内只有 `rotate:45deg`，无 `transform`）。
7. **连续纸回归通过**：30°/45° 出纸高 128.46 / 134.03mm，与 2026-10-27 实测逐字一致（G7）。
8. **PDF 仍是矢量**：整页旋转 90° 时文本矩阵 `[0,-9.9975,9.9975,0]`（G4），非栅格化。

### 拼版整页旋转（口径 A：每格内容旋转）

9. **每格占位随 90°/270° 互换**：70×40 标签 → 格 40×70；`maxColumns` 2→4、`rows` 6→3、`perSheet` 12→6，全部按互换后重算（离线 `T1`/`T8`，浏览器实测 G1 一致）。
10. **180° 不改格位**：格位与 0° 逐字一致，仅格内内容翻转（离线 `T1`、`tile-compose.spec.ts`）。
11. **格内不越界不裁切**：四档 × 12 份真实管线实测，格内容 AABB 相对格位 bleed 全为 0，`.print-page` 未裁（G1/G2，含格内元素再叠加 30°/45°/90°）。
12. **转子几何正确**：`.print-page-rotor-90 { transform: translate(40mm,0) rotate(90deg) }`、270° 为 `translate(0,70mm) rotate(270deg)`，转子 70×40 落在 40×70 格内（离线 `T4`）。
13. **校验文案按旋转后格尺寸**：`COLUMNS_OVERFLOW` 实测输出「最多可放 4 列；当前 8 列 40mm 标签…（内容旋转 90°，每格 40×70mm）」（离线 `T3`），设计器错误提示同源（UI `U4`）。
14. **连续纸仍强制不转**：`CONTINUOUS_UNSUPPORTED` + 无转子（离线 `T6`）。
15. **拼版下元素旋转超格 = 硬阻断**：`composeTiledPrepared` 用 `overflow` 拦下并报「拼版要求每份标签恰好 1 页，第 N 份内容超出纸张高度」（G3 两条），比固定纸只给 warning 更安全。
16. **服务端 PDF 腿**：render 集成测试 4 条真实 PDF 文本矩阵断言通过（90° 四列、90° 两列分张、180°、print media 网格）。

### 设计器 UI（两宿主均实测）

17. canvas：旋转行存在、tip 完整、输入 45 → 画布 `computed rotate: 45deg`；↻ → 135deg；「恢复默认值」→ `none` 且输入清空（`out/verify-ui-canvas.json` U1）。
18. print-common（shadow DOM）：同一条链全部可用，恢复默认控件在 `.pd-field` 内、点击生效（`out/verify-ui-common-reset.json`）。
19. 页面级「内容旋转角度」四档 radio 在两宿主可切换，拼版启用时摘要与提示走每格口径（UI `U4` + common 4 条测试）。
20. 三处宿主 console / pageerror 全程无报错。

## 四、问题清单（记录，不堵塞）

> **本节是验证当时的登记原文。逐条复验与修复结果见第八节**：P1-A / P1-B / P2-A / P2-B 已修（RED→GREEN，含变异自证），P3-A 已修并改准文案，P3-B 已补载体，P3-C 系本轮误报已撤回。

### P1-A 二维码不受 dpi 门槛约束，且与提示语不符

- **事实**：`resolveElementRotation()` 对 `barcode` 与 `qrcode` 都定义了「斜角需 ≥385dpi，否则吸附直角」，但**三个调用方都只在 `type === 'barcode'` 时把 `printerDpi` 传进去**：
  - 出纸 [packages/print-core/src/render/html-generator.ts:459](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/html-generator.ts#L459)
  - 分页 [packages/print-core/src/render/pagination-engine.ts:36](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/pagination-engine.ts#L36)
  - 画布 [packages/print-canvas/src/components/elements/BaseElement.vue:172](file:///Users/worm/worm-vue3-print/packages/print-canvas/src/components/elements/BaseElement.vue#L172)、[packages/print-common/src/shell/elements.ts:63](file:///Users/worm/worm-vue3-print/packages/print-common/src/shell/elements.ts#L63)
- **实测**：同一份模板 `printerDpi:203` 下，条码 30° 被吸附为不旋转（`style` 无 `rotate`），二维码 30° 照转（`rotate:30deg`）——见 `out/verify-full-offline.json` `E2_qrcodeDpiGate`。
- **叠加影响**：提示语称「条码/**二维码**任意角度需 385dpi 以上打印头，低分辨率打印机会自动吸附到 90° 步进」（[packages/print-core/src/designer/utils/property-search.ts:77](file:///Users/worm/worm-vue3-print/packages/print-core/src/designer/utils/property-search.ts#L77)），对二维码是**错误承诺**；203dpi 工位机上二维码斜角出纸大概率扫不出来。
- **建议**：要么把 `qrcode` 一并传 dpi（三处同改 + 用例钉住），要么把提示语改成只承诺条码。

### P1-B 跟随区成员「画布会转、出纸不转」（WYSIWYG 不一致）

- **事实**：出纸端跟随区成员走 `containerStyle` 分支被跳过旋转（[html-generator.ts:459](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/html-generator.ts#L459)），`followGroupHeight()` 也只用设计盒（[pagination-engine.ts:125](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/pagination-engine.ts#L125)）；而画布 `rotateStyle` 只按**类型**判定，不知道归属跟随区。
- **实测**：真实管线里跟随区成员 `rotate:45` 出纸 computed 为 `none`（`out/verify-full-geo.json` G6），而 canvas 宿主上同一元素设 45° 后画布 computed 为 `45deg`（`out/verify-ui-canvas.json` U3）。属性台对该成员正常显示并可设旋转，无任何提示。
- **影响**：用户在表格里找到「旋转」，画布所见与出纸不同；跟随归属又只在分页时才确定，设计器无法预先禁用该行。
- **建议**（任选，未实施）：跟随区归属改成设计期可判（表格底部以下且横向相交即置灰该行并提示），或出纸端跟随成员照常旋转并同步 `followGroupHeight` 的 AABB。

### P2-A `PageLayout.warnings` 无任何宿主消费，承诺的「出纸警告」实际看不到

- **事实**：分页引擎产出 `warnings`（[pagination-engine.ts:409](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/pagination-engine.ts#L409) `noteTopWarning()`），类型定义在 [render/types.ts:295](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/types.ts#L295)；全仓检索 `.warnings` 只命中 core 自身与它的单测，canvas / print-common / render 服务 / 客户端 / demo **均未读取**。
- **实测**：顶越界场景 core 确实产出「元素 t1 旋转 90° 后顶部超出页首 20mm，打印将被裁切」（`out/verify-full-offline.json` `E4`），但浏览器实测该场景出纸就是被裁掉的（G5、G8），用户侧零提示。
- **连带**：提示语「顶部超出页首会给出纸警告」目前只在 core 内部成立。

### P2-B 整页 90°/270° 出纸时，设计稿横向越界变成纵向裁切且完全静默

- **事实**：分页引擎只按纵向（`top + 结算高`）记账，横向越界从来不是判据；整页转子会把横向越界翻成出纸的纵/横另一个方向。
- **实测**（`out/verify-full-geo.json` G8）：A4 纵向模板 `left:150 width:100`（超出设计纸宽 40mm）→
  - `outputRotation:0`：出纸右侧被裁 49.99mm，`overflow=false`、`warnings=null`
  - `outputRotation:90`：出纸**底部**被裁 49.99mm，同样 `overflow=false`、`warnings=null`
  - `outputRotation:270`：出纸**顶部**被裁 49.99mm，同样静默
- **定性**：横向盲区是存量问题，但整页旋转把它的表现方向换了、且量级不变，属新功能的可见副作用面。
- **建议**：与 P2-A 合并处理——把横向越界也纳入 `warnings`（或直接进 `overflow`），宿主统一展示。

### P3-A 条码/二维码的斜角吸附只在模板声明 `printerDpi` 时生效

- `resolveElementRotation()` 在 `dpi` 未知时「按声明角放行」（[rotation.ts:78](file:///Users/worm/worm-vue3-print/packages/print-core/src/render/rotation.ts#L78)）。模板未写 `printerDpi`（很常见）时，203dpi 现场同样拿到斜角条码。设计器无法预知打印端 dpi，属有意取舍，但提示语未说明这层前提。

### P3-B 元素级 `rotate` 零文档载体（发布前必补）

- 已核对：`docs/中文/接口/API文档.md`、`docs/中文/指南/模板设计器.md`、两宿主 `help-content/faq.ts`、`docs/中文/CHANGELOG.md`（V1.3.12 段 3 条）与 `docs/en/CHANGELOG.en.md` **都没有元素级 `rotate` 的条目**；拼版 `outputRotation` 的四份载体（API 文档第 214 行、CHANGELOG V1.3.12、模板设计器 110/214 行、FAQ 第 11 行）与实现口径**一致**，已对账通过。
- 风险：走 `check:release-carriers` 与打 tag 前若漏登记，会出现「功能已发、文档全无」。

### 撤回：P3-C「parity:cross-end 无参 exit 0 假绿」不成立

复验时误报。实测 `node services/print-render/src/cross-end.parity.mjs` 与 `npm run parity:cross-end` **均 exit 2**（脚本第 33–35 行本就有缺参 `process.exit(2)`）。错误来源：我把「后台命令整体退出码 0」当成了该门禁的退出码——那条命令末尾接的是 `tail`，真实退出码写在我自己 echo 的标记里而没去读。教训：判定外部命令退出码必须读它自己的标记，不能取包裹命令的退出码。

## 五、口径观察（不是缺陷，留档备查）

- `normalizeRotationAngle(720.5) = 0.5`：>360 的小数角按取模保留小数，与 `0~359` 整数表述略有出入，但出纸与分页两处同源，无分歧。
- `rotate` 为字符串（手改 JSON 常见）被静默忽略 → 不旋转、不报错，与 `formatter` 等其它数值口径一致。
- 拼版下 `{pageIndex}` 每格恒为 1（每份标签本就是 1 页文档），旋转未改变该口径；与 0° 表现一致。
- 选中框与缩放手柄仍按设计盒（v1 明示口径，非本轮新增问题）。
- G5 固定纸裁切量（15.42 / 22.99mm）与 2026-10-27 spike 数字一致，说明 AABB 改动未改变「真溢出保留本页 + 标 overflow」的既有行为。

## 六、未覆盖清单（下一轮补）

1. **真机扫码**：203/300/600dpi 设备上斜角条码与二维码的识读率（P1-A 只有 DOM/CSS 证据，无点阵判据）。
2. **客户端静默打印腿**：Electron 44（Chromium 支持独立 `rotate` 属性）+ CUPS/SumatraPDF 在元素旋转与拼版旋转下的实际走纸方向，需真机。
   代码层已确认客户端不需要改：`clients/print-client/src/main/html-printer.ts:54` 的纸张尺寸取 `PreparedDocument.paperMm`（core 已按 `outputRotation` 换算），元素旋转走 HTML，客户端只透传。
3. **`parity:cross-end` 双腿**：需服务端 PDF 与客户端 PDF 两个产物，本轮未跑。
4. **流式列表 `flowList` × 旋转**：v1 排除，但排除提示与画布表现未做 UI 断言。
5. **`verify-demo` 门禁**：本轮未跑（需 6 端口，与并发会话在用的 9303 冲突风险）。
6. **叠层对比/像素级截图目检**：G 系列是几何量测（mm 级），未做像素 diff 与成品帧判读。

## 七、复现命令

```bash
npm run build -w @worm-vue3-print/core
npm test                                              # core / canvas / common / client
npm run test -w @worm-vue3-print/render               # 服务端（含拼版旋转 4 条）
node .lab-rotation/vf-offline.mjs                     # 离线判据 → out/verify-full-offline.json
node .lab-rotation/vf-geo.mjs                         # 浏览器判据 → out/verify-full-geo.json
node .lab-rotation/vf-ui2.mjs                         # canvas 宿主 UI（需 9413）
node .lab-rotation/vf-ui-common.mjs                   # common 宿主 UI（需 9414）
node .lab-rotation/vf-ui-common2.mjs                  # common 恢复默认值链路
```

## 八、修复轮（同日：逐条复验 → 确实存在的已修）

流程按 RED→GREEN：每条先写会失败的用例、看它按预期变红，再动实现；改完再跑变异自证。全量回归：core 80 文件 1200 条、canvas 75 文件 710 条（含 `vue-tsc` 前置）、common 30 文件 341 条、client 14 文件 110 条、render 服务 10 文件 38 条，共 **209 文件 2399 条全绿**；`npm run check:release-carriers` FAIL 0（1 条 WARN 是发版底稿 notes.md，属发版动作）。

| 登记项 | 复验结论 | 修法（落点） | 钉住的判据 |
|---|---|---|---|
| P1-A 二维码不吃 dpi 门槛 | **成立**，且偏离 spec 契约五 | 判据收回 core 单点：`resolveElementRotation(type, opts, dpi?)` 在 `dpi` 缺省时自取 `opts.printerDpi`（显式传入优先，供出纸端覆盖），渲染 / 分页 / 两宿主画布四处删掉「仅条码传 dpi」的散落 if | `rotation.test.ts` 新增 2 条（自带 printerDpi 即生效、显式 dpi 覆盖）；`pagination-rotation.test.ts` 新增「二维码低 dpi 吸附后不输出 rotate」「二维码斜角在低 dpi 元素上吸附为不转」；真实管线 E2：203dpi 二维码 `rotate:` 声明消失、600dpi 仍 `rotate:30deg` |
| P1-B 跟随区成员画布转、出纸不转 | **成立**，偏离 spec 契约四（明文「渲染不转、属性台不出输入框」） | core 出公开判据 `collectFollowMemberIds(elements)`（与分页内部同一 `buildFollowMap` + 同一排序比较器，不分叉），从 `/designer` 与主入口导出；canvas：`CanvasPaper` 内容区一次算好下发 → `BaseElement` 不写 `rotate`、`PropertyPanel` → `AppearanceGroup` 不出行；common：`canvas.ts` 同口径传参、`property-panel.ts` 门禁 | canvas `element-rotate-gate.spec.ts` 13 条、common 同名 spec 10 条（成员不出行 / 零交集照常出行 / 表格缺席 / 画布不写 rotate）；UI 级实测（9413）：选中表格下方跟随成员 → 旋转行缺席且画布 `rotate: none`，选中普通文本 → 行在、设 45° 画布 45deg |
| P2-B 横向越界静默裁切 | **成立**（横向盲区是存量，整页旋转换了表现方向） | 分页末尾新增 `noteHorizontalOverflow()`：按横向结算盒（旋转取外接盒、表格按列宽和）比对纸宽，越左/右缘各记一条 `warnings`；**不动 `overflow` 语义**，出纸 HTML 逐字不变 | `pagination-rotation.test.ts` 新增 5 条（50mm 专条、贴边不误报、左侧越界、旋转按外接盒 12.43mm、sections/overflow 不变）；真实管线 G8：0°/90°/270° 三档横向越界均出「超出纸面右侧 50mm」，恰好放得下的对照档为「无」 |
| P2-A warnings 零宿主消费 | **成立**（spec 判据 5 要求校验输出可见） | 按用户裁决两面条都做：① core 新增 `collectPrintWarnings()`（编辑期预估，复用 paginate）+ `collectLayoutWarnings()`（真实分页去重）；② canvas `<PrintHtmlPreview>` 保留 `pageLayouts` 并常驻 `.print-html-preview-warn` 提示条；③ 两宿主保存闸门给一次**不阻断**提示并各暴露 `getGeometryWarnings()`；④ 零框架宿主 `renderInBrowser()` 返回值补 `warnings`（四宿主同步） | core `geometry-warnings.spec.ts` 6 条、canvas `print-designer-geometry.spec.ts` 5 条（保存仍放行 + 拼版非法优先 + expose）、common `geometry-warnings.spec.ts` 4 条；UI 级实测：把元素宽度改成 400mm → 预览层常驻「出纸提示：元素 font1 超出纸面右侧 113mm」，点保存弹「出纸提示（不影响保存）：…」且保存事件照常派发 |
| P3-A/契约五 码类置灰与 tip | **成立**（契约五要求置灰 + 指定文案，实现里没有；tip 另有过承诺） | core 出 `isRotationExcludedType` / `isFreeAngleEditable` / `CODE_OBLIQUE_NOTE`；两宿主属性台对无 ≥385dpi 承诺的条码/二维码置灰自由角度（↺/↻ 仍可用）并挂常驻提示行；`PROPERTY_REGISTRY` 的 ap-rotate tip 重写为与实测一致（含跟随区成员不支持、未声明分辨率按声明角出纸） | canvas 5 条 + common 4 条置灰用例（203/缺省置灰、385 放开、二维码同口径、置灰下仍可 ±90° 步进）；canvas/common `help-modal.spec.ts` 14 条盯住两宿主帮助文案逐字一致 |
| P3-B 元素级 rotate 零文档载体 | **成立** | 已补六份载体：`docs/中文/CHANGELOG.md` V1.3.12（新增 3 条 + 修复 1 条）、`docs/en/CHANGELOG.en.md` 英文薄层、两宿主 `help-content/changelog.ts` 与 `faq.ts`（帮助弹框）、`docs/中文/接口/API文档.md`（渲染管线 API 表 + `<PrintDesigner>`/`<PrintHtmlPreview>` 段）、`docs/中文/指南/模板设计器.md`（元素旋转 + 出纸提示两条能力）、`docs/中文/指南/使用指南.md`（`rotate` 口径段）；技能侧 `skills/print-template-json/references/template-schema.md` 加 `rotate` 行、`skills/worm-vue3-print-integration/references/integration-api.md` 加「元素级旋转与出纸裁切提示」小节（含判据命令与版本边界 V1.3.12） | `check:release-carriers` 绿；`help-modal.spec.ts` 逐字一致绿 |
| P3-C parity 脚本假绿 | **不成立，撤回** | 实测 `node …cross-end.parity.mjs` 与 `npm run parity:cross-end` 均 `exit 2`（脚本第 33–35 行本就有缺参退出）。错因：我把后台命令整体退出码（末尾 `tail` 的码）当成了门禁结果 | 已在第四节就地标注撤回 |

### 变异自证（证明新判据真被盯住）

临时把 `rotation.ts` 的 `dpi ?? opts?.printerDpi` 改回 `dpi`、把 `paginate()` 末尾的 `noteHorizontalOverflow()` 调用注掉，`rotation.test.ts` + `pagination-rotation.test.ts` + `geometry-warnings.spec.ts` **8 条变红**（3 个文件全挂）；复原后 md5 与基线一致、三个文件重跑全绿。

### 行为变更与存量影响（minor 建议）

- **语义贴合度**：四条修法的口径都取自 `docs/superpowers/specs/2026-10-27-element-rotation-design.md` 契约四/五与判据 5，不是新发明；`collectFollowMemberIds` / `collectPrintWarnings` 是把已有私有判据升级为公开单点，符合本仓「同源边界用工具强制、重复实现收编替换」的约定。
- **可能看得见的变化**：① 表格跟随区成员的元素台不再显示「旋转 (°)」行、画布也不再旋转该成员（此前画布会转）；模板里已写的 `rotate` 保留但出纸与画布都忽略。② 条码/二维码未声明打印头分辨率时角度输入框置灰（此前可填任意值，但出纸本就不该斜）。③ 二维码斜角在低分辨率打印机上被吸附成水平（此前照转）。④ 元素超出纸面左右缘、或旋转顶越页首时，保存会多一次不阻断提示、预览层多一条常驻提示。⑤ `PageLayout.warnings` 覆盖面扩大（新增横向越界条目），只读该字段的宿主会拿到更多文案。
- **产物零变化面**：未旋转、未越界的存量模板出纸 HTML 逐字不变（`warnings` 为空、`rotate` 声明不输出）；拼版与元素旋转叠加的四档几何、连续纸 128.46/134.03mm、90° PDF 矩阵在修复后与修复前一致（G1/G2/G4/G7 复跑数字未变）。
- **版本建议**：`core` / `canvas` 按 **minor** 走（新增能力 + 上述可见行为，无破坏性 API 变更），随主线升 `1.3.12`；`common` 仍走预览号 `1.3.7-beta.N`（与主线不同步）。

### 本轮仍未做

1. demo-common 四宿主的**预览可视展示**：数据出口 `warnings` 已同步到四份 `browser-render.js`，可视展示只在 jquery 宿主接了一行（副标题追加「出纸提示：…」）；vue2 / vue3 / react 三宿主的副标题落点与「打印输出」弹层各自结构不同，留给下一轮（判据：`rendered.warnings.length` 非空时在既有副标题/提示位追加文案）。
2. `verify-demo`（42 项）与 cross-end 双腿：前者需 6 端口且并发会话正在改 demo 模板，后者需服务端 PDF + 客户端 PDF 两个产物。
3. 真机扫码（203/300/600dpi 斜角条码与二维码识读率）与客户端真机走纸：本机无打印机/扫描枪，未验证。
4. 像素级 diff / 成品帧判读：本轮浏览器层是 mm 级几何量测，未做图像比对。
