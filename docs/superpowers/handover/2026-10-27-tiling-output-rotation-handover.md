# 交接文档：拼版模式支持内容整体旋转角度（V1.4.0）

> 本文档自包含，供接手 agent 续作。写作时点：2026-10-27，工作区改动**未提交**。
> 接手前必读第六节（工作区混有另一会话的 in-flight 改动，禁动）。

## 一、任务与已裁口径

需求：让 worm-vue3-print 在拼版（tiling/imposition）模式下支持内容整体旋转角度 `outputRotation`。

用户已拍板口径 **A「每格内容旋转」**：

- 90°/270°：每格占位宽高互换（如 70×40 标签占 40×70 格位），列数上限 / 行数 / 每张格数按互换后重算；出纸时每份内容旋转对应角度落格。
- 0°/180°：格位几何不变（180° 仅翻转格内内容方向）。
- 连续纸仍无旋转概念（强制 0，不变）。
- 复用现有模板级字段 `outputRotation`，不新增字段。

实现要点：移除「拼版启用时强制 outputRotation=0」的限制（原来三处归零），只保留连续纸强制 0。

## 二、当前状态

本功能已在当前工作区**完整实现并全部验证通过**，尚未提交。接手 agent 的工作是：核对 → 提交 → 可选收尾（第五节），不是从头实现。

## 三、改动清单（本功能，28 个修改文件 + 1 个新测试文件）

### packages/print-core（内核）

- `src/render/types.ts`：`getOutputPaperDimensions` / `getOutputRotationAngle` / `shouldApplyOutputRotation` 三处移除 `|| template.tiling?.enabled === true`，只保留 `if (continuous)`；`outputRotation` 注释更新为每格口径。
- `src/print/tiling.ts`：
  - `TilingTemplateInput` 增加 `outputRotation?: 0 | 90 | 180 | 270`；
  - import 改 `getOutputPaperDimensions`（拼版下按旋转后纸面尺寸取标签占位）；
  - 新增 `rotationNote(t, tile)` helper，`COLUMNS_OVERFLOW` / `LABEL_TOO_TALL` 校验文案末尾追加「（内容旋转 90°，每格 40×70mm）」。
- `src/designer/types.ts`：**混改文件**（见第六节）——本功能只改了 `outputRotation` 的注释 hunk（去掉「非拼版」、补每格口径说明）；`rotate?: number` hunk 属另一会话。
- 测试：`src/render/types.test.ts`（拼版下 90/180 生效）、`src/print/__tests__/tiling.spec.ts`（新 describe「拼版内容旋转」6 例）、`src/render/css-builder.test.ts`（拼版+90/180 转子 CSS 2 例）、`src/print/__tests__/tile-compose.spec.ts`（90/180 2 例，inputs 支持 template 参数）、`src/print/__tests__/pipeline.spec.ts`（90° 列数重算 3 例）。

### packages/print-canvas（Vue3 设计器）

- `src/components/PropertyPanel.vue`：旋转控件显示条件 `!continuousPaper && !tilingEnabled` → `!continuousPaper`；提示改三元，拼版开启时显示每格口径文案。
- `src/components/property/TilingConfig.vue`：摘要追加 `· 每格 ${l.tile.width}×${l.tile.height}mm`。
- 测试：`src/__tests__/paper-preset-select.spec.ts`（新 describe 3 例）、`src/__tests__/TilingConfig.spec.ts`（摘要每格尺寸 1 例）。
- `src/help-content/faq.ts` + `src/help-content/changelog.ts`：补拼版旋转说明与 V1.4.0 段（**必须与 common 侧逐字同源**）。

### packages/print-common（零框架外壳）

- `src/shell/property-panel.ts`：同 canvas 的显示条件与提示文案。
- `src/shell/page-extras.ts`：摘要同 canvas 每格口径。
- `src/shell/help-content/faq.ts` + `changelog.ts`：canvas 逐字复制副本。
- `PARITY.md`：更新拼版对账条目。
- 测试：**新文件** `src/shell/__tests__/tiling-rotation.spec.ts`（4 例）。

### services/print-render（渲染服务）

- `src/tiling.integration.test.ts`：`parsePdf` 增加 firstItem transform 读取；新 describe「拼版 + 内容旋转端到端」4 例（真实 Chromium + PDF 变换矩阵断言）。

### 文档与技能

- `docs/中文/接口/API文档.md`（拼版小节加「内容旋转按每格生效」段）、`docs/中文/指南/使用指南.md`、`docs/中文/指南/模板设计器.md`（2 处）、`packages/print-core/README.md`。
- `skills/worm-vue3-print-integration/references/integration-api.md`、`skills/print-template-json/references/template-schema.md` §6。
- `docs/中文/CHANGELOG.md` + `docs/en/CHANGELOG.en.md`：新增 `## V1.4.0(2026-10-27)` 段（标题风格大写 V+半角括号；**package.json 版本号未动**，发布时统一升）。

## 四、已验证证据

### RED 基线（改前代码跑红，已留档）

core 14 红/77 绿、canvas 3 红/20 绿、common 3 红/1 绿、渲染集成 4 红/4 绿。

### 最终全量（改后，全绿）

- core + canvas + common + client：**192 文件 / 2290 条全绿**（core 1161、canvas 692、common 327、client 110）。〔更正：初稿误写 154 文件，2026-10-27 验收时以独立复跑实测更正〕
- 复验（元素旋转测试入库后混合树）：194 文件 / 2308 条全绿，其中 core 1179 = 1161 + 他人 `rotation.test.ts`(10) + `pagination-rotation.test.ts`(8)。
- 渲染服务：10 文件 / 38 条全绿。
- `npm run build` 全工作区通过；`lint:print-architecture` 通过。
- 0° 基线逐项不变（存量零变化）；落纸复核数字与预演一致。

### 真实链路预演（真实 Chromium，A4 纸 / 70×40 标签 / 2mm 间距）

| 场景 | 结果 |
| --- | --- |
| r0-c2 | 格位 70×40、2×6=12 格/张、无转子（不变） |
| r90-c4 | 纸张 40×70、maxCol 4、rows 3、12 格/张、格位 left 10/52/94/136 |
| r90-c2 | 6 格/张 → 12 条出 2 张 |
| r180-c2 | 格位 70×40 不变 |
| r270-c4 | 纸张 40×70、12 格/张 |

PDF 文本变换矩阵：90° `a=d=0、|b|=|c|=12`；180° `a=d=−12`；270° `b=+12、c=−12`。校验文案实测：r90 列数超宽 → 「最多可放 4 列；当前 5 列 40mm 标签含间距需要 208mm（内容旋转 90°，每格 40×70mm）」。

### 复跑命令

```bash
npm run build
npm test                                   # 全量四包；退出码看 echo EXIT=$?
npm run test -w @worm-vue3-print/render    # 渲染服务集成
npm run lint:print-architecture
```

注意：`npm test | tail` 管道会吃掉退出码，用 `> /tmp/x.log 2>&1; echo EXIT=$?`。

## 五、剩余动作（按序）

1. **提交**：中文描述式提交信息（不加 Conventional 前缀）。`designer/types.ts` 是混改文件——只提交 `outputRotation` 注释 hunk，**不得**带走 `rotate?: number` hunk；用临时索引 + `commit-tree` 拆分（仓库已有先例），每笔 add 后 `git diff --cached --stat` 对账、提交后 `git show --stat` 复核。新测试文件 `tiling-rotation.spec.ts` 一并入库。
2. **提交后**重建 core dist 并快验 canvas/common 测试（它们消费 dist）。
3. **可选（问用户）**：同步 `~/.agents/skills` 全局副本（两个 skill references 已改；仓库是权威源，覆盖前先备份、逐文件 md5 收尾）。
4. **发布未授权**：V1.4.0 号段已写进 CHANGELOG，但发版（tag / npm / 安装包）需用户按 `project-release-workflow-manual` 流程单独授权，接手 agent 不得自行发布。

## 六、工作区他人 in-flight 改动（禁动、禁提交）

以下属于「元素级旋转」另一会话（用户明示单独处理），本会话与其并行共用工作区：

- `docs/superpowers/specs/2026-10-27-element-rotation-design.md`（未跟踪 spec）
- `packages/print-core/src/render/rotation.ts`（未跟踪新文件，元素级 AABB 几何单点）
- `packages/print-core/src/render/rotation.test.ts`、`packages/print-core/src/render/pagination-rotation.test.ts`（未跟踪测试）
- `packages/print-core/src/render/continuous-paper.ts`（整个 diff：rotatedContentBottomMm）
- `packages/print-core/src/render/html-generator.ts`（整个 diff）
- `packages/print-core/src/render/pagination-engine.ts`（整个 diff，约 +101 行）
- `packages/print-core/src/index.ts`（整个 diff：仅新增 rotation helpers 的 export hunk）
- `packages/print-core/src/designer/index.ts`、`packages/print-core/src/designer/utils/property-search.ts`（整个 diff）
- `packages/print-canvas/src/components/elements/BaseElement.vue`、`packages/print-canvas/src/components/property/AppearanceGroup.vue`（整个 diff：rotate 样式与属性台旋转控件）
- `packages/print-common/src/shell/elements.ts`（整个 diff）
- `packages/print-core/src/designer/types.ts` 中 `rotate?: number` 相关 hunk（该文件其余 hunk 属本功能）

判据：以上文件的 diff 内容均不含 tiling / outputRotation 关键字（已核）。**该会话仍在推进中（会话 a7050270 running），以上清单可能继续增长——接手 agent 动手前必须重新核对 `git status` 与各 diff 归属，再按当时实况执行。**

## 七、门禁（接手 agent 必须遵守）

- 简体中文回复、注释、提交信息。
- 禁删测试、禁放宽断言；新判据必须有 RED（改前跑红）佐证。
- core 源码改完必须重建 dist（canvas/common 测试消费 dist）。
- `help-content/*.ts` 改动必须 canvas/common 两侧逐字同步（`help-modal.spec.ts` 对拍）。
- 探针/临时验证代码不入库。
- 混改文件只提交本功能 hunk；提交后 `git show --stat` 对账。
- 提交范围仅本功能清单（第三节）；第六节文件一律不碰。
