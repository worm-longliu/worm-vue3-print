# 运行时适配

只在选择评审或实施运行方式时阅读。目标是控制主上下文和调用成本，同时不伪造独立意见；以真实工具表、CLI 帮助和参数 schema 为准。

## 按风险选择模式

| 模式 | 使用条件 | Agent 数量与角色 | 独立性 |
|---|---|---|---|
| 主 Agent 评审 | 小型、低风险、短文档、少量证据 | 不创建子 Agent；1–2 个角色视角 | `single-agent` |
| 单子 Agent 评审 | 普通 spec/plan 评审，默认方式 | 优先只创建一个外部 CLI 子 Agent；串行承担 1–2 个角色 | 首角色可独立，后续 `reused-context` |
| 按需独立评审 | 表达式引擎语义、模板契约变更、发布链路、跨包大改等高风险 | 只为关键角色创建新的独立子 Agent；默认最多 2 个，超出须用户确认 | 新上下文可标独立 |

- 不默认创建常驻 teammate，不默认并行扇出，不为凑角色数创建 Agent。
- 需要子 Agent 时默认优先外部 Agent CLI，选择当前可用、成本最低且能力满足任务的模型；原生子 Agent 仅在外部 CLI 不可用或能力不满足时降级使用。小型低风险任务仍由主 Agent 完成，不为使用 CLI 额外付出启动成本。
- 用户未授权子 Agent 时只能主 Agent 评审；高风险议题须记录独立性缺口，不能谎称完成独立复核。
- 主 Agent 中的角色分析和证据**不能即时清空**，摘要只有在后续压缩时才可能释放上下文；长文档或多证据评审不要全部塞给主 Agent。

## Token 与上下文控制

1. brief 只传角色包路径、spec/plan 路径、必要代码坐标和输出契约，不复制角色包或 spec/plan 全文。
2. 子 Agent 只读取当前角色包和相关文档段落；主 Agent 不同时加载全部角色包。
3. 每个角色最多返回 3 条发现，每条只含结论、证据和最小修正；无发现直接写“无”。
4. 主 Agent 只接收和落盘精简结论，不回传完整分析过程，不为了留痕复制原始长回执。
5. R2 默认复用原子 Agent，只发送阻塞项、修正和新增证据；需要独立反证时才创建新上下文。
6. 角色完成后按工具能力关闭或释放子 Agent；CLI 进程退出即释放，不保留无后续任务的常驻团队或会话。

## 已知运行时映射

以下原生映射仅在外部 CLI 不可用或能力不满足时使用。

### Qoder Desktop（本项目主运行环境）

- 单子 Agent：`Agent(subagent_type="Plan", isolation="default")` 创建一次，可在一个任务中顺序完成 1–2 个角色。
- 一次性入口无法续话时，R2 重派只传原阻塞项和新增证据，并标记 `reused-context`；不要为了并行拆成多个普通角色任务。
- 不使用带写能力的 `general-purpose` 冒充只读角色；`Explore` 只读但会漏长文件内容，深评审优先 `Plan`。

### DeepSeek Harness

- 单子 Agent：`spawn_teammate(context="fresh")` 只创建一次，`send_message` 续话，`wait_agent` 等待。
- `list_agents` 与 `team_task_*` 仅在实际有帮助时使用；没有任务板不影响评审。
- 高风险独立复核才新建 teammate；普通 R2 不重建。

### Codex 多 Agent

- V1：`multi_agent_v1__spawn_agent(fork_context=false)` 只创建一次，`multi_agent_v1__send_input` 续话，`multi_agent_v1__wait_agent` 等待。
- V2：使用当次提供的创建、后续消息和等待工具；参数以实际 schema 为准，不沿用其他版本字段。
- 高风险独立复核才另建 Agent；完成后按工具能力关闭或释放。

### 外部 Agent CLI

需要子 Agent 时默认优先使用一次性外部 CLI 进程，以降低调用成本；原生多 Agent 是降级路径。外部 CLI 同样计入 Agent 数量并需要用户授权，不能借命令行调用绕过授权、只读边界或评审协议。

| 用途 | CLI | 模型选择 |
|---|---|---|
| 头脑风暴、spec/plan 评审 | Qoder | `Qwen3.8-Flash` |
| 头脑风暴、spec/plan 评审 | OpenCode | `opencode/glm-5.3-flash-free` |
| 头脑风暴、spec/plan 评审 | Codex | 省略 `-m`，使用当前默认模型 |
| 实施 | OpenCode | 当前账号免费模型中实测速度最快者 |

- 评审默认优先 OpenCode 免费 GLM；Qoder Qwen3.8-Flash 与 Codex 默认模型作为可用替代或按任务能力选用。高风险任务不得仅因免费而降低证据、独立性或只读要求。
- 实施默认优先 OpenCode 免费且实测最快模型；主 Agent 只分派已获授权的实施任务并负责验收，不默认转用原生执行 Agent。

```bash
# Qoder：头脑风暴或只读评审
qodercli -p -m Qwen3.8-Flash --cwd "$PWD" --max-output-tokens 3000 "$BRIEF"

# OpenCode：头脑风暴或只读评审
opencode run -m opencode/glm-5.3-flash-free --agent plan "$BRIEF"

# Codex：默认模型，只读沙箱
codex exec -C "$PWD" -s read-only -o /tmp/experts-codex-last.md "$BRIEF"

# OpenCode：实施，须用户另行授权写操作
opencode run -m "$OPENCODE_FAST_FREE_MODEL" --agent build "$TASK"
```

- 先用 `qodercli --list-models`、`opencode models` 核对当前账号可用 ID；模型下线或不可用时记录覆盖缺口并换用已核实模型，不臆造别名。
- `OPENCODE_FAST_FREE_MODEL` 从 `opencode models` 的当前 `-free` 清单中选择；以同机同任务实测时延判断“最快”，未测速时不得凭 `flash` 名称宣称最快，可暂用 `opencode/glm-5.3-flash-free` 并标明未测速。
- Qoder/OpenCode 不使用权限绕过或自动批准参数；只读由运行时权限、只读 brief 和产物审计共同约束。Codex 评审固定使用 `read-only`。
- 首轮使用新会话，不混用 `--continue`。R2 可用 Qoder `--resume`、OpenCode `--session`、Codex `exec resume` 复用原会话，只传阻塞项和新增证据，并标记 `reused-context`；需要独立反证时新建会话。
- 主 Agent 只读取最终精简结论和退出状态，不加载完整事件流、调试日志或思考过程。CLI 失败按真实状态重试一次，仍失败则记录缺口。
- 免费额度和速度以当前账号与实测为准，不视为永久保证。实施委派不替代主 Agent 的规范加载、差异审查和定向验收；未明确授权实施时只能评审。

#### 状态缓存与 4 小时复验

1. 主 Agent 选择外部 CLI 前必须读取 `.agents/deliberation/experts-agent-cli-status.json`；只记录各后端 `status`、`checked_at`、`next_check_at`、模型、精简证据或错误，状态写入由主 Agent 负责。
2. 缺少记录、配置或账号变化、达到 `next_check_at` 时视为待复验，必须先执行最小只读真实调用；`--version` 和模型清单只能用于发现，不能单独判定 `available`。
3. 成功与失败都要立即更新状态，并设置 `next_check_at = checked_at + 4 小时`。`unavailable` 在 4 小时内跳过并使用降级路径，满 4 小时必须重新验证，不能永久排除；实际任务失败同样记录。
4. `available` 要求非交互进程退出成功且返回有效最终回复。状态仅适用于当前机器、账号和 CLI 配置，不跨环境复用；不保存密钥、完整提示词、完整输出或思考过程。

### 其他运行时

- 映射为“创建一次 / 续话 / 等待 / 释放”四类能力；缺续话能力时按一次性入口处理。
- 外部 CLI 与原生子 Agent 均不可用或用户未授权时，直接主 Agent 评审，不尝试调用臆测工具。

## 证据与复核

1. 首轮只给相同版本的评审对象和必要证据路径，不给主持人结论或其他角色意见。
2. 同一子 Agent 换角色时必须重新声明角色 ID；上一角色结论不能作为下一角色证据。
3. 角色无回执时按真实状态等待或重试一次；仍无结果则记录覆盖缺口，不编造意见。
4. 只读无法由权限保证时，使用最小工具面、brief 禁止写操作并检查异常产物；越权输出作废。
