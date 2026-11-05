# MCP 画布反馈性能优化设计

## 目标与边界

按“分段耗时埋点与基准 → 批量 Patch → 精简读取 → revision 缓存 → 画布即时进度反馈 → 复用 MCP Server 评估”的顺序优化。保留桌面客户端、WebSocket、本机鉴权、revision 防覆盖、契约校验、封禁元素和 4 MiB 限制。首阶段不修改 core 的 WebSocket 协议。

## 1. 可观测性与基准

- `/mcp` 记录工具名、请求总耗时、请求体字节数和成功状态，不记录模板、打印数据或 token。
- 会话注册表记录同会话排队耗时与浏览器请求往返耗时。
- 浏览器记录写回前 revision、画布提交、写回后 revision 三段耗时。
- 日志统一使用 debug；测试注入计时器验证分段，不用固定延时推断性能。
- 基准以本地集成测试中的工具调用耗时为参考，验收目标为 Patch P95 < 200 ms；只有真实环境采样达到后才能宣称达标。

## 2. 原子批量 Patch

新增 `print_patch_open_template`，输入 `sessionId/baseRevision/reason/operations`，操作白名单：

- `updateElement`：按 `elementId` 查找元素，浅合并 `changes` 到 `options`。
- `moveElement`：按 `elementId` 更新 `options.left/top`，输入以 mm 为单位。

支持单页、多页以及页内 content/header/footer；元素不存在、重复、操作字段非法时整批拒绝。实现先读取当前快照并核对其 revision 与 `baseRevision`，在结构化克隆上依次应用操作，再复用整份写回的契约、封禁元素、体积门禁和 `bridge.applyTemplate`。一次调用只产生一次画布写回和一次撤销历史。返回新 `revision/changedPaths/warnings`，后续 Patch 可链式使用，不要求重新读取完整模板。

## 3. 精简读取

`print_get_open_template` 保持不传新参数时的完整响应兼容。新增：

- `view: "summary"`：返回纸张、方向、页数及元素索引，不返回完整 `templateJson`。
- `elementIds`：只保留索引或完整模板中匹配的元素。
- `includeFields`：摘要模式返回的字段白名单，仅作用于元素 `options`。
- `includePrintData`：是否携带打印数据，默认 false；完整模板默认仍按原行为返回。

为降低首阶段复杂度，`elementIds/includeFields` 仅与 `view=summary` 搭配；非法组合明确报错，避免让调用方误以为完整模板已被安全裁剪。

## 4. revision 缓存

浏览器会话缓存“原始 JSON 序列化文本 → revision”。输入序列化文本一致时复用摘要；不一致时重新 canonicalize 和哈希。完整文本比较避免摘要碰撞导致错误复用，键顺序变化只造成缓存未命中，不影响正确性。只保留上一次结果，避免无界内存增长。

## 5. 即时进度反馈

在浏览器写回开始时发送 `pending`，App 立即显示“AI 正在修改模板…”；成功和冲突沿用现有结果提示。`pending` 不代表成功，也不提前清除冲突状态。宿主可不实现该通知，保持兼容。

## 6. MCP Server 复用门槛

先采集以上分段数据。仅当服务创建/销毁在总耗时中占据显著比例时，再单独设计可安全复用的 Server/Transport；本轮不提前引入跨请求状态、并发鉴权和资源生命周期风险。
