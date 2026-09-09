# 打印模板设计器帮助文档系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为打印模板设计器添加帮助文档系统，通过顶部工具栏帮助按钮打开模态框，提供全面的使用指南和参考文档。

**Architecture:** 使用 Vue3 原生组件实现帮助按钮和模态框，帮助内容以 TypeScript 模块形式组织，支持标签页导航。

**Tech Stack:** Vue3 Composition API, TypeScript, CSS

## Global Constraints

- 坐标单位：mm
- 纸张大小预设：A4, A3, A5, Letter, Legal, CUSTOM
- 缩放范围：50% ~ 200%
- 默认页边距：10mm
- 快捷键在 INPUT/TEXTAREA/SELECT 内不生效

---

## Task 1: 创建帮助内容模块

**Files:**
- Create: `packages/print-canvas/src/help-content/index.ts`
- Create: `packages/print-canvas/src/help-content/getting-started.ts`
- Create: `packages/print-canvas/src/help-content/features.ts`
- Create: `packages/print-canvas/src/help-content/shortcuts.ts`
- Create: `packages/print-canvas/src/help-content/faq.ts`

**Interfaces:**
- Consumes: 项目功能信息（快捷键、元素类型、表达式语法等）
- Produces: `helpSections` 数组，每项包含 `{ id, title, content }`

- [ ] **Step 1: 创建 getting-started.ts**

```typescript
// packages/print-canvas/src/help-content/getting-started.ts
export default {
  id: 'getting-started',
  title: '快速入门',
  content: `
## 界面布局

打印模板设计器采用三栏布局：

- **左侧面板**：字段树和图层管理，用于查看和管理画布上的元素
- **中间画布**：设计区域，支持标尺、参考线、网格显示
- **右侧面板**：属性设置和模板配置
- **顶部工具栏**：常用操作按钮
- **底部状态栏**：显示坐标、缩放比例、元素数量

## 添加第一个元素

1. 从左侧面板选择元素类型（文本、图片、条码等）
2. 拖拽到画布上松开
3. 选中元素后，通过拖拽调整位置
4. 拖拽元素边角手柄调整大小

## 数据绑定基础

使用花括号 \`{field.path}\` 语法绑定数据字段：

\`\`\`
供应商：{supplier.name}
日期：{order.date}
金额：{MONEY(order.total)}
\`\`\`

双击元素可打开表达式编辑器配置绑定。

## 保存与预览

- 点击工具栏"保存"按钮，模板以 JSON 格式导出
- 点击"预览"按钮查看打印效果
- 模板数据包含页面设置、元素定义、样式配置
  `
}
```

- [ ] **Step 2: 创建 features.ts**

```typescript
// packages/print-canvas/src/help-content/features.ts
export default {
  id: 'features',
  title: '功能说明',
  content: `
## 元素类型

| 类型 | 说明 |
|------|------|
| 文本 | 静态或动态文本，支持表达式绑定 |
| 长文本 | 多行文本，支持自动换行 |
| 数据表格 | 动态行列，支持分页、表头重复、序号/小计/汇总 |
| 条形码 | 支持 code128 等多种码制 |
| 二维码 | 支持 L/M/Q/H 纠错级别 |
| 图片 | 静态或动态图片 |
| 线条 | 水平线或垂直线 |
| 形状 | 矩形、椭圆，支持边框和背景色 |
| HTML | 自定义 HTML 内容 |
| 页码 | 自动页码显示 |

## 表达式编辑器

### 基础语法

使用花括号 \`{}\` 包裹表达式，花括号外为字面文本。

### 内置函数

| 函数 | 说明 | 示例 |
|------|------|------|
| MONEY(value) | 金额格式化（千分位+两位小数） | \`{MONEY(order.total)}\` → "69,543.75" |
| DATE(value, format) | 日期格式化 | \`{DATE(order.date, 'YYYY-MM-DD')}\` |
| UPPER(value) | 数字转大写金额 | \`{UPPER(order.total)}\` → "陆万玖仟伍佰肆拾叁元柒角伍分" |
| IF(cond, true, false) | 条件判断 | \`{IF(qty > 100, '大量', '少量')}\` |
| CONCAT(str1, str2, ...) | 字符串拼接 | \`{CONCAT(name, '-', spec)}\` |
| IFEMPTY(value, default) | 空值默认 | \`{IFEMPTY(remark, '无')}\` |
| ROUND(num, decimals) | 四舍五入 | \`{ROUND(price, 2)}\` |
| NOW() | 当前日期 | \`{NOW()}\` |
| SUBSTR(str, start, len) | 子字符串 | \`{SUBSTR(name, 0, 3)}\` |
| LEN(str) | 字符串长度 | \`{LEN(name)}\` |
| PAD(value, len, char) | 左侧补位 | \`{PAD(qty, 5, '0')}\` |

### 聚合函数（表格小计/汇总行使用）

| 函数 | 说明 |
|------|------|
| SUM(field) | 求和 |
| AVG(field) | 平均值 |
| COUNT(field) | 计数 |
| MIN(field) | 最小值 |
| MAX(field) | 最大值 |

### 系统变量

| 变量 | 说明 |
|------|------|
| pageIndex | 当前页码 |
| totalPages | 总页数 |
| printDate | 打印日期 (YYYY-MM-DD) |
| printTime | 打印时间戳 |

## 数据表格配置

### 行类型

- **标题行 (header)**：可设置每页重复显示
- **数据行 (data)**：绑定列表数据源迭代显示
- **小计行 (subtotal)**：当前页末尾显示汇总
- **汇总行 (summary)**：仅最后一页显示

### 表格操作

- 右键菜单支持插入/删除行和列
- 支持单元格合并/拆分
- 支持边框预设：全部/外边框/内边框/无
- 无边框表格设计态显示虚拟虚线

## 对齐与吸附

### 自动对齐

拖拽元素时自动显示对齐引导线：
- 蓝色：左/顶对齐
- 绿色：居中对齐
- 橙色：右/底对齐

### 网格吸附

开启吸附功能后，元素自动吸附到网格点。

### 手动参考线

通过标尺区域拖拽添加参考线，参考线参与吸附检测。

## 图层管理

- 调整元素显示顺序（置顶/置底/上移/下移）
- 显示/隐藏元素
- 锁定/解锁元素（锁定后不可编辑）

## 三区布局

页面分为三个区域：
- **页眉 (header)**：顶部区域
- **内容区 (content)**：主体区域
- **页脚 (footer)**：底部区域

页眉/页脚支持的元素类型：文本、图片、线条、形状、条形码、二维码

## 水印配置

- 支持固定文本或绑定字段
- 可设置旋转角度和透明度
- 支持显示打印时间戳
  `
}
```

- [ ] **Step 3: 创建 shortcuts.ts**

```typescript
// packages/print-canvas/src/help-content/shortcuts.ts
export default {
  id: 'shortcuts',
  title: '快捷键',
  content: `
## 常用操作

| 快捷键 | 功能 |
|--------|------|
| Ctrl + C | 复制选中元素 |
| Ctrl + V | 粘贴元素（偏移 10mm） |
| Ctrl + D | 原地复制（偏移 5mm, 5mm） |
| Ctrl + A | 全选元素 |
| Delete / Backspace | 删除选中元素 |
| Ctrl + Z | 撤销 |
| Ctrl + Shift + Z / Ctrl + Y | 重做 |

## 元素移动

| 快捷键 | 功能 |
|--------|------|
| 方向键 | 移动 1mm |
| Shift + 方向键 | 移动 10mm |
| Ctrl + 方向键 | 移动 0.5mm |

## 缩放控制

| 快捷键 | 功能 |
|--------|------|
| Ctrl + 1 | 重置缩放至 100% |
| Ctrl + 0 | 适应窗口 |

## 对齐操作（多选时）

| 快捷键 | 功能 |
|--------|------|
| Ctrl + L | 左对齐 |
| Ctrl + R | 右对齐 |
| Ctrl + E | 水平居中 |
| Ctrl + T | 顶对齐 |
| Ctrl + B | 底对齐 |

## 组合操作

| 快捷键 | 功能 |
|--------|------|
| Ctrl + G | 组合选中元素 |
| Ctrl + Shift + G | 取消组合 |

> **注意**：当焦点在输入框、文本框、下拉框内时，快捷键不生效。
  `
}
```

- [ ] **Step 4: 创建 faq.ts**

```typescript
// packages/print-canvas/src/help-content/faq.ts
export default {
  id: 'faq',
  title: '常见问题',
  content: `
## 如何调整纸张大小？

1. 在右侧面板选择"页面设置"
2. 选择预设纸张（A4、A3、A5、Letter、Legal）
3. 或选择"自定义"输入宽度和高度（mm）
4. 设置方向：纵向（portrait）或横向（landscape）

## 如何处理分页？

数据表格支持自动分页：
1. 在表格属性中设置"每页显示行数"
2. 启用"表头重复"确保跨页时显示标题行
3. 添加小计行显示当前页汇总
4. 添加汇总行显示整表汇总

## 如何导入外部数据？

通过组件 props 传入数据：
- \`fields\`：字段定义数组，用于字段树显示
- \`initialTemplate\`：初始模板数据
- \`loadDefaultTemplate\`：加载默认模板的回调函数

## 如何使用表达式绑定字段？

1. 双击元素打开表达式编辑器
2. 使用 \`{field.path}\` 语法绑定字段
3. 使用内置函数格式化数据（如 \`{MONEY(price)}\`）
4. 点击确认保存

## 如何调整元素层级？

1. 选中一个或多个元素
2. 点击工具栏的层级按钮：
   - ⤒ 置顶
   - ↑ 上移一层
   - ↓ 下移一层
   - ⤓ 置底

或使用快捷键在图层面板中调整。

## 如何组合多个元素？

1. 按住 Ctrl 逐个点击选中多个元素
2. 点击工具栏"组合"按钮，或按 Ctrl + G
3. 组合后点击任一元素可选中整个组
4. 取消组合：选中组合后点击"取消组合"，或按 Ctrl + Shift + G

## 如何使用参考线？

1. 在标尺区域拖拽添加参考线
2. 参考线自动参与吸附检测
3. 拖拽参考线可调整位置
4. 拖出标尺区域可删除参考线

## 如何预览打印效果？

1. 点击工具栏"预览"按钮
2. 预览使用同构渲染管线，确保与实际打印一致
3. 可通过"叠层对比"功能对比设计稿与截图

## 模板数据格式是什么？

模板以 JSON 格式存储，包含：
- \`paperSize\`：纸张大小
- \`orientation\`：方向
- \`margins\`：页边距
- \`header\`：页眉配置
- \`footer\`：页脚配置
- \`elements\`：元素数组
- \`watermark\`：水印配置
  `
}
```

- [ ] **Step 5: 创建 index.ts**

```typescript
// packages/print-canvas/src/help-content/index.ts
import gettingStarted from './getting-started'
import features from './features'
import shortcuts from './shortcuts'
import faq from './faq'

export type HelpSection = {
  id: string
  title: string
  content: string
}

export const helpSections: HelpSection[] = [
  gettingStarted,
  features,
  shortcuts,
  faq,
]

export type { HelpSection as default }
```

- [ ] **Step 6: 运行类型检查**

Run: `cd packages/print-canvas && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add packages/print-canvas/src/help-content/
git commit -m "feat: add help content modules"
```

---

## Task 2: 创建 HelpButton 组件

**Files:**
- Create: `packages/print-canvas/src/components/HelpButton.vue`

**Interfaces:**
- Consumes: 无
- Produces: `HelpButton` 组件，点击触发 `click` 事件

- [ ] **Step 1: 创建 HelpButton.vue**

```vue
<!-- packages/print-canvas/src/components/HelpButton.vue -->
<template>
  <button
    class="help-button"
    title="帮助文档"
    @click="$emit('click')"
  >
    <span class="help-icon">?</span>
  </button>
</template>

<script setup lang="ts">
defineEmits<{
  click: []
}>()
</script>

<style scoped>
.help-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s;
}

.help-button:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
}

.help-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--pd-accent, #165DFF);
  color: white;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}
</style>
```

- [ ] **Step 2: 运行类型检查**

Run: `cd packages/print-canvas && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add packages/print-canvas/src/components/HelpButton.vue
git commit -m "feat: add HelpButton component"
```

---

## Task 3: 创建 HelpModal 组件

**Files:**
- Create: `packages/print-canvas/src/components/HelpModal.vue`

**Interfaces:**
- Consumes: `helpSections` from `help-content/index.ts`
- Produces: `HelpModal` 组件，支持 `visible`、`initialTab` props，触发 `close`、`update:tab` 事件

- [ ] **Step 1: 创建 HelpModal.vue**

```vue
<!-- packages/print-canvas/src/components/HelpModal.vue -->
<template>
  <Teleport to="body">
    <Transition name="help-modal">
      <div
        v-if="visible"
        class="help-modal-overlay"
        @click.self="$emit('close')"
      >
        <div class="help-modal">
          <div class="help-modal-header">
            <h2 class="help-modal-title">帮助文档</h2>
            <button
              class="help-modal-close"
              title="关闭"
              @click="$emit('close')"
            >
              ×
            </button>
          </div>
          
          <div class="help-modal-body">
            <div class="help-modal-sidebar">
              <button
                v-for="section in sections"
                :key="section.id"
                :class="['help-tab', { active: activeTab === section.id }]"
                @click="switchTab(section.id)"
              >
                {{ section.title }}
              </button>
            </div>
            
            <div class="help-modal-content">
              <div
                class="help-content"
                v-html="currentContent"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { helpSections } from '../help-content'

const props = withDefaults(defineProps<{
  visible: boolean
  initialTab?: string
}>(), {
  initialTab: 'getting-started'
})

const emit = defineEmits<{
  close: []
  'update:tab': [tab: string]
}>()

const sections = helpSections
const activeTab = ref(props.initialTab)

// 从 localStorage 恢复上次阅读的标签页
const STORAGE_KEY = 'worm-print-help-tab'
onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && sections.some(s => s.id === saved)) {
    activeTab.value = saved
  }
})

// 监听 visible 变化，打开时恢复标签页
watch(() => props.visible, (v) => {
  if (v) {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && sections.some(s => s.id === saved)) {
      activeTab.value = saved
    }
  }
})

function switchTab(tabId: string) {
  activeTab.value = tabId
  localStorage.setItem(STORAGE_KEY, tabId)
  emit('update:tab', tabId)
}

const currentContent = computed(() => {
  const section = sections.find(s => s.id === activeTab.value)
  return section?.content || ''
})

// ESC 键关闭
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<style scoped>
.help-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.help-modal {
  width: 800px;
  max-width: 90vw;
  height: 600px;
  max-height: 85vh;
  background: var(--pd-surface, #ffffff);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.help-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--pd-border, #d9dde6);
}

.help-modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--pd-text, #2a2e37);
}

.help-modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--pd-text-muted, #8b909c);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.15s;
}

.help-modal-close:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
  color: var(--pd-text, #2a2e37);
}

.help-modal-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.help-modal-sidebar {
  width: 160px;
  padding: 12px;
  border-right: 1px solid var(--pd-border, #d9dde6);
  background: var(--pd-field-bg, #f4f6fa);
  overflow-y: auto;
}

.help-tab {
  display: block;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--pd-text, #2a2e37);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.help-tab:hover {
  background: var(--pd-sidebar-hover, #f0f3f9);
}

.help-tab.active {
  background: var(--pd-accent-soft, rgba(22, 93, 255, 0.09));
  color: var(--pd-accent, #165DFF);
  font-weight: 500;
}

.help-modal-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.help-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--pd-text, #2a2e37);
}

.help-content :deep(h2) {
  margin: 0 0 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--pd-border-soft, #e9ecf2);
  font-size: 18px;
  font-weight: 600;
}

.help-content :deep(h3) {
  margin: 20px 0 12px;
  font-size: 15px;
  font-weight: 600;
}

.help-content :deep(p) {
  margin: 0 0 12px;
}

.help-content :deep(ul),
.help-content :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.help-content :deep(li) {
  margin-bottom: 4px;
}

.help-content :deep(code) {
  padding: 2px 6px;
  border-radius: 3px;
  background: var(--pd-field-bg, #f4f6fa);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 13px;
}

.help-content :deep(pre) {
  margin: 0 0 12px;
  padding: 12px;
  border-radius: 4px;
  background: var(--pd-field-bg, #f4f6fa);
  overflow-x: auto;
}

.help-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.help-content :deep(table) {
  width: 100%;
  margin: 0 0 12px;
  border-collapse: collapse;
}

.help-content :deep(th),
.help-content :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--pd-border, #d9dde6);
  text-align: left;
}

.help-content :deep(th) {
  background: var(--pd-field-bg, #f4f6fa);
  font-weight: 600;
}

.help-content :deep(blockquote) {
  margin: 0 0 12px;
  padding: 12px 16px;
  border-left: 3px solid var(--pd-accent, #165DFF);
  background: var(--pd-accent-soft, rgba(22, 93, 255, 0.09));
}

/* 过渡动画 */
.help-modal-enter-active,
.help-modal-leave-active {
  transition: opacity 0.2s ease;
}

.help-modal-enter-active .help-modal,
.help-modal-leave-active .help-modal {
  transition: transform 0.2s ease;
}

.help-modal-enter-from,
.help-modal-leave-to {
  opacity: 0;
}

.help-modal-enter-from .help-modal,
.help-modal-leave-to .help-modal {
  transform: scale(0.95);
}
</style>
```

- [ ] **Step 2: 运行类型检查**

Run: `cd packages/print-canvas && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add packages/print-canvas/src/components/HelpModal.vue
git commit -m "feat: add HelpModal component"
```

---

## Task 4: 集成到设计器

**Files:**
- Modify: `packages/print-canvas/src/components/DesignerToolbar.vue`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue`

**Interfaces:**
- Consumes: `HelpButton`, `HelpModal` 组件
- Produces: 设计器工具栏显示帮助按钮，点击打开帮助模态框

- [ ] **Step 1: 修改 DesignerToolbar.vue**

在工具栏顶部添加帮助按钮：

```vue
<!-- 在 DesignerToolbar.vue 的 template 中，在标题区域之后添加 -->
<HelpButton @click="$emit('help')" />
```

在 script 中导入组件：

```typescript
import HelpButton from './HelpButton.vue'
```

在 emit 定义中添加：

```typescript
help: []
```

- [ ] **Step 2: 修改 PrintDesigner.vue**

在 template 中添加 HelpModal：

```vue
<!-- 在 ExpressionEditor 之后添加 -->
<HelpModal
  v-model:visible="helpVisible"
  @close="helpVisible = false"
/>
```

在 script 中导入并添加状态：

```typescript
import HelpModal from './HelpModal.vue'

const helpVisible = ref(false)

function toggleHelp() {
  helpVisible.value = !helpVisible.value
}
```

在 DesignerToolbar 上添加 help 事件处理：

```vue
<DesignerToolbar
  ...
  @help="toggleHelp"
/>
```

- [ ] **Step 3: 运行类型检查**

Run: `cd packages/print-canvas && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 运行测试**

Run: `cd packages/print-canvas && npm test`
Expected: 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add packages/print-canvas/src/components/DesignerToolbar.vue packages/print-canvas/src/components/PrintDesigner.vue
git commit -m "feat: integrate help system into designer"
```

---

## Task 5: 验证和清理

**Files:**
- 无新文件

**Interfaces:**
- 无

- [ ] **Step 1: 运行完整构建**

Run: `npm run build`
Expected: 构建成功，无错误

- [ ] **Step 2: 运行完整测试**

Run: `npm test`
Expected: 所有测试通过

- [ ] **Step 3: 验证帮助按钮功能**

在浏览器中打开设计器：
1. 确认工具栏显示帮助按钮（蓝色问号图标）
2. 点击按钮，模态框正确显示
3. 标签页切换正常工作
4. ESC 键关闭模态框
5. 点击模态框外部关闭
6. 标签页状态持久化到 localStorage

- [ ] **Step 4: 提交最终代码**

```bash
git add -A
git commit -m "feat: complete help documentation system"
```
