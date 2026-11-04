# 框架接入要点

## Vue 2.7

在 Vite 插件中配置 `isCustomElement: tag => tag === 'print-designer'`。模板中只放字符串 attribute；`fields`、`template` 和函数在 mounted 或数据变化后通过 `$refs.designer` 赋 property。`beforeDestroy` 移除事件监听和 MCP 会话。

## React 18

用 `ref` 获取 element，在 effect 中注入 property 并通过 `addEventListener('save', handler)` 订阅。effect 返回清理函数；处理器需要最新 state 时用 ref 桥接，避免每次渲染重绑。JSX 的 `onSave` 不会自动绑定 CustomEvent。

## jQuery / 原生 JavaScript

使用 `WormPrintCommon.registerAll()` 后，直接操作 DOM element property 和 `addEventListener`。页面或组件销毁时调用 `removeEventListener`，并关闭 `PrintClient`。jQuery 的 `.on('save')` 不是本技能的推荐契约，统一使用原生 CustomEvent API。

## 换模板与读回

四种宿主都通过 `el.template = 新对象` 重载画布。保存后再次打开时重新赋值，不假设宿主响应式数据与 Shadow DOM 内部 store 自动双向同步。
