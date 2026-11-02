# 项目级审议角色包

本目录是 worm-vue3-print 项目专家团（`$experts`）的项目级角色包位置；角色字段约束以 `.agents/skills/multi-role-deliberation/scripts/validate_role_pack.py` 为准。

## 覆盖优先级

```text
插件内置角色
< 个人角色 ~/.agents/deliberation/role-packs/*.yaml
< 项目角色 .agents/deliberation/role-packs/*.yaml
< 单次调用临时覆盖
```

相同 `id` 由高层完整替换，不做字段深合并。

## 约定

- 文件名与角色 `id` 必须一致，扩展名固定 `.yaml`（校验器会拒绝其他后缀与非 `.yaml` 文件参与目录校验）。
- 手工修改后必须跑校验器，校验通过才算生效：

```bash
python3 .agents/skills/multi-role-deliberation/scripts/validate_role_pack.py \
  --directory .agents/deliberation/role-packs
```

解析最终生效角色（含 `source_layer` / `source_path`）：

```bash
python3 .agents/skills/multi-role-deliberation/scripts/resolve_roles.py \
  --personal "$HOME/.agents/deliberation/role-packs" \
  --project .agents/deliberation/role-packs
```

## 本项目约束

- 角色 Agent 一律只读：不改代码、不装依赖、不跑构建、不启动服务、不执行发布命令、不派生 Agent。
- 派遣子 Agent 须用户在当前任务中明确批准（见 `.agents/skills/experts/SKILL.md`）；无多 Agent 能力时降级为主 Agent 顺序模拟，并在输出中标记 `single-agent`。
- 角色包是提示配置，不是授权凭证；`skill_bindings` 不等于安装或调用技能，绑定不可用时换角色或记录覆盖缺口。
- `print-template-json` 绑定位于仓库 `skills/print-template-json/`，运行时未注册时直接读取该 SKILL.md 文件。

## 角色阵容（对应本项目包边界）

| 角色 | 覆盖范围 |
|---|---|
| `fullstack-architect` | 包边界、跨包契约、影响面 |
| `frontend-expert` | canvas/common 设计器 UI 与交互 |
| `render-pipeline-expert` | core 表达式引擎与同构渲染、四端一致性 |
| `service-client-expert` | print-render 服务、print-client 客户端、client-sdk |
| `security-expert` | 用户输入求值、模板/服务/MCP 暴露面、敏感数据 |
| `release-compat-engineer` | 模板 schema 兼容、存量迁移、npm 发版与回滚 |
| `code-reviewer` | spec/plan 定稿前质量门 |
| `deliberation-host` | 主持人（主 Agent 兼任，不派遣） |
