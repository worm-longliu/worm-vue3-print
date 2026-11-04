---
name: worm-vue3-print-common
description: Use when 用户需要在 Vue 2.7、React、jQuery、原生 JavaScript 或其他非 Vue 3 宿主中集成 @worm-vue3-print/common，包括 Custom Element 设计器、浏览器/服务端/静默打印，以及宿主页面接入 MCP 实时模板读写。
---

# common 通用宿主集成

`@worm-vue3-print/common` 是零框架运行时的 Custom Element + Shadow DOM 适配包。它仍是实验性版本，不建议用于生产；Vue 3 宿主优先使用成熟的 `@worm-vue3-print/canvas` 与 `worm-vue3-print-integration` 技能。

## 工作流程

1. 确认宿主框架、构建器、打印链路和是否接受实验性风险。
2. 按 [安装方式](references/installation.md) 选择 NPM 或浏览器直挂，不使用未公开深路径。
3. 按 [接入 API](references/integration-api.md) 注册 `<print-designer>`，注入字段、模板和上传函数。
4. 按 [框架接入](references/framework-recipes.md) 处理 Vue 2.7、React 或 jQuery 生命周期。
5. 按 [打印链路](references/printing.md) 复用同一模板和数据完成浏览器打印、PDF 或静默出纸。
6. 需要 AI 修改当前画布时，按 [宿主 MCP 集成](references/mcp-host-integration.md) 实现 `template.get/apply` 和 revision 防覆盖。
7. 用“打开 → 修改 → 保存 → 再打开 → 预览/打印”验证；异常按 [故障排查](references/troubleshooting.md) 定位。

## 不可违反的契约

- `fields`、`template`、`fonts`、函数等复杂值赋 element property；字符串开关可用 attribute。
- `save`、`preview` 等是 `CustomEvent`，载荷在 `event.detail`；React 不能用 `onSave` 代替原生事件监听。
- 自定义元素默认 `display:inline`，宿主必须提供块级宽高。
- Shadow DOM 默认内联样式；只有 light DOM 形态额外引入 `@worm-vue3-print/common/style.css`。
- `getTemplateJson()` 返回 JSON 字符串，并绕过保存按钮的拼版闸门；导出、另存和 MCP 写回前按用途校验。
- common 不改变 core/canvas/client 的包边界，不引入宿主 UI 或业务后端依赖。
