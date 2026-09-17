# demo 批量打印（同模板多份不同数据）设计

日期：2026-09-17
范围：仅 `demo/`（Vite 集成示例），不改动任何 workspace 包（core / canvas / client / render / print-client）。

## 1. 目标与约束

在 demo 中验证批量打印能力，要求：

1. 使用模拟数据批量打印多份（固定 3 份）；
2. 3 份使用同一个模板（当前画布 JSON）；
3. 每份打印数据不同，且每份之间强制分页，一次浏览器打印对话框出 3 份。

输出链路：**浏览器预览打印**（`window.print()` via iframe）。服务端 PDF 与 Electron 静默打印链路本次不改动。

技术约束：

- core 的 `renderHtmlPages`（`packages/print-core/src/browser/browser-pagination.ts`）当前实际只支持单条对象数据，签名中的数组类型并未实现批量语义。本次不扩展 core（YAGNI），批量组合放在 demo 侧完成。
- demo 侧只做平台/示例层的「多次调用 + 文档拼接」，不重实现测量、分页、码制渲染等 core 逻辑，不触碰架构守卫。

## 2. 方案选型（已确认）

- **方案 A（采纳）**：demo 侧对 3 条数据各调一次 `renderHtmlPages`，用 `DOMParser` 把 3 份完整 HTML 文档拼接为单文档写入同一 iframe，每份之间强制分页，一次 `iframe.print()`。
- 方案 B（否决）：在 core 增加真批量能力。改动同构渲染管线与三端消费方，超出 demo 验证范围。
- 方案 C（否决）：3 个 iframe 顺序打印，会连弹 3 次系统打印对话框，体验不成立且无法自动化验证。

## 3. 结构与数据流

### 3.1 新增文件

1. `demo/src/batch-data.ts`
   - 导出常量 `BATCH_SIZE = 3`。
   - 导出纯函数 `deriveBatchData(base: Record<string, any>): Record<string, any>[]`：对 base 深拷贝 3 份，按下标派生差异字段（规则见 3.2）。函数无 DOM 依赖。
2. `demo/src/batch-render.ts`
   - 导出 `renderBatchInBrowser(templateJson, dataList, baseUrl): Promise<{ html: string; pageCount: number; copies: number }>`。
   - 内部对每条数据调用一次 core/browser 的 `renderHtmlPages`（复用现有浏览器适配器 `browserCodeRenderer`），再按 3.3 拼接。
3. `demo/src/components/BatchPrintPreview.vue`
   - 参照 `packages/print-canvas/src/components/PrintHtmlPreview.vue` 的薄壳实现：props 为 `templateJson`、`printDataList`、`baseUrl`；挂载/templateJson 变化时调用 `renderBatchInBrowser` 并写入 iframe；渲染中/失败态；`defineExpose({ print })`；渲染序号（renderSeq）丢弃过期结果。

### 3.2 模拟数据派生规则

以 `DEFAULT_DEMO_DATA`（采购收货单，结构：supplier / receiver / order / goods[50]）为原型，下标 i = 0,1,2：

- `order.no`：原型末尾追加 `-B0{i+1}`，即 `PO20260801001-B01 / -B02 / -B03`。
- `order.date`：原型日期加 i 天 → `2026-08-01 / 2026-08-02 / 2026-08-03`。
- `supplier` 三组轮换：
  - 鑫达五金有限公司 / 0571-88776655 / 杭州市萧山区经济开发区88号
  - 恒泰机电设备有限公司 / 0571-86554433 / 杭州市钱塘区智造六路12号
  - 瑞安钢材贸易有限公司 / 0577-65558899 / 瑞安市塘下镇工业园北区3号
- `receiver.name`：李四 / 王五 / 赵六（phone、address 沿用原型，不影响「每份不同」判定）。
- `goods`：截取行数分别为前 8 行 / 前 20 行 / 全部 50 行，制造每份页数差异；每行 `qty` 乘 `(i+1)`，`amount = qty * price`（保留两位小数）重算。
- `order.total`：等于该份各行 `amount` 求和（保留两位小数），不沿用原型常量。
- 不新增模板中不存在的字段。

### 3.3 HTML 拼接与分页

core 每份产出完整 `<!DOCTYPE html>` 文档：`<head>` 内含同模板一致的 `@page` 与样式，`<body>` 内为若干 `.print-page`（末页 `break-after: auto`，其余 always）。拼接规则：

1. `new DOMParser().parseFromString(html, 'text/html')` 解析每份文档。
2. 以首份文档为骨架（`@page`、样式以首份为准；同模板三次渲染必然一致，不做去重）。
3. 每份 `body.innerHTML` 包一层 `<section class="print-copy">…</section>`，3 段顺序写入骨架 `<body>`。
4. 注入样式：`.print-copy:not(:last-child) { break-after: page; page-break-after: always; }`，保证每份末页（auto）之后仍强制翻页，下一份从新纸开始。连续纸（CONTINUOUS）同样适用——每份的纸高推导在各自渲染阶段已独立完成。
5. 序列化骨架（`'<!DOCTYPE html>\n' + documentElement.outerHTML`）返回；`pageCount` 为三份结果之和，`copies = dataList.length`。
6. iframe 写入方式与现有预览一致：`document.open() / write(html) / close()`；`print()` 调 `iframe.contentWindow.print()`，一次对话框出 3 份。

### 3.4 UI 改动（demo/src/App.vue）

- 现有预览弹层头部增加分段切换：`单份预览` / `批量预览（3 份模拟数据）`，默认单份，现有行为完全不变。
- 单份：继续使用现有 `PrintHtmlPreview` + `DEFAULT_DEMO_DATA`。
- 批量：挂载 `BatchPrintPreview`，模板取当前画布 JSON（`designerRef.getTemplateJson()`），数据取 `deriveBatchData(DEFAULT_DEMO_DATA)`；副标题显示「共 3 份 · N 页」（N 为回传 pageCount）；「打印」按钮调用批量组件的 `print()`。
- 「打印输出」弹窗（PrintOutputDialog：服务端 PDF / 客户端静默打印）不改动。

## 4. 错误处理

- 3 次渲染中任一次失败：整个批量预览进入失败态，展示「第 i 份渲染失败：<message>」，不写 iframe。
- 沿用渲染序号机制，模板/数据快速变化时丢弃过期结果。
- 模板为空（画布空白未加载布局）时组件不渲染，与现有单份预览表现一致。

## 5. 测试与验证

不落地永久单测文件（demo 不在 npm workspaces 内、无 vitest 设施，引入配置与任务不匹配）。以 Playwright 端到端实测为准（复用仓库已安装的 Playwright Chromium，临时脚本收尾删除）：

1. 启动 `demo` dev server（`cd demo && npm run dev`）；
2. 脚本：点击「加载默认布局」→ 打开「打印预览」→ 切到「批量预览」；
3. 断言 iframe 文档内：
   - 存在 3 个 `.print-copy`；
   - 文本包含三个订单号后缀 `…-B01 / -B02 / -B03`；
   - 副标题页数 = 三份各自 pageCount 之和；
   - `.print-copy:not(:last-child)` 生效 `break-after: page`（emulateMedia print 下检查应用样式）；
4. 不实际触发系统打印对话框（无法自动化）；`打印` 按钮人工确认一次。

收尾验收：

- `git diff` 自审：改动仅在 `demo/`（及本设计文档）；
- 不需全仓 `npm run build`（未改 core/canvas）；
- demo dev server 手动冒烟单份预览回归无变化。
