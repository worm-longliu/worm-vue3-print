# MCP 画布反馈性能优化实施计划

## 文件边界

- `packages/print-mcp/src/template-operations.ts`：白名单 Patch 与摘要投影纯函数。
- `packages/print-mcp/src/template-session-tools.ts`：工具注册、参数门禁、读取/写回桥接。
- `packages/print-mcp/src/__tests__/`：Patch、摘要与工具行为测试。
- `clients/print-client/src/main/mcp-host.ts`、`template-sessions.ts`：分段耗时日志。
- `clients/print-client/src/main/*.test.ts`：日志与真实链路回归。
- `demo/src/template-session.ts`：revision 缓存、浏览器分段日志、pending 通知。
- `demo/src/App.vue`：pending 的即时提示。
- `clients/print-client/src/main/mcp-live-demo.integration.test.ts`：端到端工具数量、链式 Patch、摘要读取和通知。

## 任务 1：埋点与基准

1. 先写 MCP 请求耗时、会话排队/往返、浏览器 revision/提交分段测试并观察失败。
2. 使用 `Date.now()/performance.now()` 实现只含元数据的 debug 日志。
3. 运行相关 workspace 测试，记录实现前后本地集成测试耗时作为参考，不将其冒充用户环境 P95。

## 任务 2：批量 Patch

1. 为单页、多页、header/footer、重复/缺失元素、非法操作、陈旧 revision、封禁元素、链式 revision 写失败测试。
2. 实现纯 Patch 函数；所有修改发生在结构化克隆上，失败不得写回。
3. 注册工具并复用现有校验和 apply 通道，返回 `changedPaths`。

## 任务 3：精简读取

1. 为默认完整响应兼容、summary 元素索引、元素过滤、字段白名单、printData 开关和非法参数组合写失败测试。
2. 实现无副作用的摘要投影，接入 `print_get_open_template`。

## 任务 4：revision 缓存与进度

1. 为相同序列化内容复用哈希、内容变化重新计算、pending→success/conflict 顺序写失败测试。
2. 实现单项 revision 缓存和耗时日志。
3. 在 App 中显示 pending 提示，成功前不宣告写回完成。

## 任务 5：整体验证与复用评估

1. 更新真实 MCP 集成测试并运行 print-mcp、print-client 测试。
2. 运行 `npm test` 与 `npm run build`。
3. 审查 `git diff`、日志隐私和包边界。
4. 根据分段日志判断是否需要另开 MCP Server 复用任务；没有数据支持则不实现。

## 实测记录（2026-11-05）

- 进程内真实 MCP/WebSocket 协议链路、简单内存画布，12 次采样：整份写回 P50/P95 约 5.81/9.31ms，Patch 约 6.00/9.79ms。
- 该结果不包含模型生成时间和真实 Vue 画布重载，不能据此宣称 Patch 协议往返更快或用户侧 P95 已达标。
- 浏览器测试画布的写回前 revision 缓存命中约 0.005–0.03ms；写回后重新计算约 0.09–0.19ms。
- 暂不复用 MCP Server：保留 `serverSetupMs` 埋点，待真实环境证明创建/销毁占显著比例后另行实施。
