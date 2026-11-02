---
name: experts
description: Use when 用户显式调用 $experts（兼容别名 $experts-team），或明确要求项目专家团、多 Agent 专家团进行需求、设计或实施计划二次评审；按风险选择主 Agent、单个子 Agent 或按需独立子 Agent，控制上下文与评审成本。普通头脑风暴、日常问答和单 Agent 代码评审不启用。
---

# experts（worm-vue3-print 轻量专家团）

## 目标与边界

- 用少量角色视角复核 spec 与 plan，发现单视角容易遗漏的包边界、同构渲染一致性、模板契约兼容和安全问题。
- `$experts-team` 为兼容别名；普通“项目专家团”请求也进入本技能，不重复启动多套评审。
- 复用 `brainstorming`、`writing-plans`、`executing-plans`，不复制其流程，不绕过用户批准。
- 默认只维护已有 spec/plan；评审记录追加对应文档末尾，不额外制作看板或过程副本。

## 启动前

1. 小型低风险评审可由主 Agent 完成；创建任何子 Agent 仍须用户在当前任务中明确授权，未授权时只能主 Agent 评审。
2. 明确评审对象、影响面、风险和用户批准状态；spec 未形成时不跳过头脑风暴直接评审。
3. 校验角色包：
   `python3 .agents/skills/multi-role-deliberation/scripts/validate_role_pack.py --directory .agents/deliberation/role-packs`
4. 检查参与角色的 `skill_bindings` 是否可用；缺失时换角色或记录覆盖缺口，不假装已加载。
5. 选择运行方式时读 `references/runtime-adapters.md`，按风险和真实工具表控制 Agent 数量，禁止调用不存在的工具。

## 角色选择

默认选择 **2–4 位角色视角**，不等于子 Agent 数量；主持人由主 Agent 兼任，不派遣主持人：

| 角色 | 使用条件 |
|---|---|
| `fullstack-architect` | 跨包契约、core→canvas→宿主边界、影响面不清或需要主持技术取舍时 |
| `frontend-expert` | canvas/common 设计器 UI、交互、响应式状态或构建链路受影响时 |
| `render-pipeline-expert` | core 表达式引擎、同构渲染管线或三端（浏览器/Node/Playwright/Electron）一致性受影响时 |
| `service-client-expert` | print-render 渲染服务、print-client 客户端、client-sdk 静默打印链路或 Docker 部署受影响时 |
| `security-expert` | 表达式求值、模板 JSON 输入、渲染服务/MCP 对外暴露面或敏感打印数据受影响时优先替换低相关角色 |
| `release-compat-engineer` | 模板契约版本、schema 迁移、npm 多包发布或存量模板兼容受影响时优先替换低相关角色 |

纯文档或局部议题不要凑满人数；高风险议题可额外安排 `code-reviewer` 做质量门。角色细则见 `references/review-protocol.md`。

## 执行流程

### 1. spec 二次评审

- 前置：spec 已获方向批准，评审对象与代码证据可读。
- R1：各角色按选定运行方式阅读同一版本，结论必须包含证据、风险和建议；首轮不得注入其他角色结论。
- **R2 按需**：只处理高影响分歧、反证和阻塞项；无分歧、无阻塞时直接结束，不为凑轮次制造问题。
- 阻塞项由提出角色复验；主持人不能代签。阻塞清零且用户批准 spec 定稿后才进入实施计划定稿。

### 2. plan 二次评审

- 使用 `writing-plans` 形成可执行 plan，再让同一批或按影响面调整后的角色复核。
- 重点核对精确文件、包边界、执行顺序、定向测试（`lint:print-architecture` / 受影响 workspace 测试）、运行验证和回滚路径。
- 模板契约变更、表达式引擎语义变更、发布链路调整等高风险议题增加一次独立质量门；`Pass/Warning/Critical` 均由证据决定。
- 阻塞清零、Critical 闭环且用户批准 plan 后才实施。

### 3. 实施与收口

- 主持人按 `executing-plans` 实施；评审角色保持只读，不写代码、不跑构建、不启动服务。
- 默认执行与改动直接相关的定向测试；只有项目规则允许的高风险、发布或基础设施异常场景才扩大范围。
- 隔离工作区仅在用户明确要求时创建；收尾遵循当前环境真实的分支完成技能与项目 Git 规则。

## 运行方式与独立性

- **小型低风险**：主 Agent 顺序评审 1–2 个视角，不创建子 Agent，标记 `single-agent`。
- **普通评审**：默认只创建一个子 Agent，串行承担 1–2 个最相关角色；主 Agent 只接收精简结论，后续角色标记 `reused-context`。
- **高风险**：仅对安全、契约/发布等关键角色增加独立子 Agent，使用新上下文获取反证；不固定创建 2–4 个 Agent。
- 不默认使用常驻团队或并行扇出；任何运行方式都不得伪造独立性和并行度。

## 只读与证据

- 派遣 brief 使用 `templates/role-brief.md`；角色不得写文件、安装依赖、跑构建、启动渲染服务或派生 Agent。
- 工具能力不等于授权；只读主要靠 brief、最小工具面和结果审计，不宣称运行时提供权限级只读。
- 事实必须附 `文件:行`、命令输出或既有测试/校验结果；推导与假设分别标明，无证据不得作为阻塞结论。
- 主持人负责汇总裁决并当场写入对应 spec/plan，角色不直接修改评审文档。

## 完成条件

- 参与角色与影响面匹配，缺失覆盖已显式记录。
- spec/plan 评审记录包含角色、证据、分歧、阻塞项、复核与用户批准状态。
- 没有未闭环阻塞或 Critical；非阻塞建议不扩大本次实施范围。
- 所有实际派遣均可由真实工具回执核对，未伪造独立性、并行度或角色意见。
