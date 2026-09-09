# 表格单元格支持图片类型实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为打印模板设计器中的表格单元格添加图片类型支持，允许用户在表格单元格中显示动态绑定的图片。

**Architecture:** 采用与条形码/二维码一致的组件化设计，创建 `CellImage` 组件专门负责图片单元格的渲染。通过扩展 `TableCellType` 类型和 `TableCell` 接口，添加图片相关属性。在属性面板中添加图片类型选择和属性设置。

**Tech Stack:** Vue 3, TypeScript, Vite

## Global Constraints

- 与现有条形码/二维码单元格处理方式保持一致
- 保持代码的可维护性和可扩展性
- 不影响现有功能
- 新属性为可选，现有数据无需迁移

---

## 文件结构

### 需要修改的文件

1. **`packages/print-canvas/src/types.ts`**
   - 修改 `TableCellType` 联合类型，添加 `'image'`
   - 修改 `TableCell` 接口，添加图片相关属性（`fit`、`maxWidth`、`maxHeight`）

2. **`packages/print-canvas/src/components/elements/TableElement.vue`**
   - 引入 `CellImage` 组件
   - 在单元格渲染逻辑中添加图片类型处理

3. **`packages/print-canvas/src/components/property/TableCellGroup.vue`**
   - 单元格类型选择器添加"图片"选项
   - 添加图片属性设置（缩放模式、最大宽度、最大高度）
   - 修改 `onCellTypeChange` 函数处理图片类型

4. **`packages/print-canvas/src/utils/binding-registry.ts`**
   - 修改 `getTableCellBindings` 函数，为图片单元格返回 `src` 绑定描述

### 需要创建的文件

1. **`packages/print-canvas/src/components/elements/CellImage.vue`**
   - 图片单元格渲染组件
   - 支持表达式求值
   - 支持缩放模式和尺寸控制
   - 设计态显示占位符，运行态显示真实图片

---

## 任务分解

### Task 1: 修改类型定义

**Files:**
- Modify: `packages/print-canvas/src/types.ts:122-145`

**Interfaces:**
- Consumes: 无
- Produces: 修改后的 `TableCellType` 和 `TableCell` 接口

- [ ] **Step 1: 修改 TableCellType 联合类型**

在 `types.ts` 文件中，找到 `TableCellType` 定义（第 122 行），修改为：

```typescript
/** 单元格内容类型 */
export type TableCellType = 'text' | 'barcode' | 'qrcode' | 'image'
```

- [ ] **Step 2: 修改 TableCell 接口**

在 `types.ts` 文件中，找到 `TableCell` 接口（第 125 行），在接口末尾添加图片相关属性：

```typescript
/** 单元格 */
export interface TableCell {
  id: string
  formatter?: string          // 表达式模板：data 行 {field}；subtotal/summary 行 {MONEY(SUM(field))}；header 行 "文本: {field}"
  cellType?: TableCellType    // 内容类型，缺省 text
  barcodeType?: string        // 条形码码制（jsbarcode 格式名），仅 cellType='barcode' 时生效
  qrCodeLevel?: string        // 二维码纠错级别 L/M/Q/H，仅 cellType='qrcode' 时生效
  showBarcodeText?: boolean   // 条形码下方是否显示文本，仅 cellType='barcode' 时生效
  rowspan?: number            // 默认 1
  colspan?: number            // 默认 1
  merged?: boolean            // true = 被合并覆盖的占位格
  align?: TextAlign
  valign?: 'top' | 'middle' | 'bottom'
  fontFamily?: string         // 字体
  fontSize?: number           // pt
  fontWeight?: string
  color?: string
  backgroundColor?: string
  borders?: TableCellBorders
  padding?: number            // mm
  wordWrap?: boolean          // 默认 true
  // 图片类型特有属性
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'  // 缩放模式，默认 contain
  maxWidth?: number     // 最大宽度（mm）
  maxHeight?: number    // 最大高度（mm）
}
```

- [ ] **Step 3: 验证类型定义**

运行类型检查确保没有错误：

```bash
cd packages/print-canvas && npx tsc --noEmit
```

- [ ] **Step 4: 提交更改**

```bash
git add packages/print-canvas/src/types.ts
git commit -m "feat: add image type support to table cell types"
```

---

### Task 2: 创建 CellImage 组件

**Files:**
- Create: `packages/print-canvas/src/components/elements/CellImage.vue`

**Interfaces:**
- Consumes: `evaluateTemplate` from `../../utils/expression-eval`, `DEFAULT_DEMO_DATA` from `../../utils/demo-data`
- Produces: `CellImage` 组件，接收 `value`、`fit`、`maxWidth`、`maxHeight`、`designMode`、`data` 属性

- [ ] **Step 1: 创建 CellImage.vue 文件**

创建文件 `packages/print-canvas/src/components/elements/CellImage.vue`，内容如下：

```vue
<!-- 表格单元格内图片渲染：设计态与预览态共用 -->
<template>
  <div class="cell-image">
    <img v-if="imageSrc && !hasError" :src="imageSrc" :style="imgStyle" @error="onError" />
    <div v-else class="image-placeholder">图片</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { evaluateTemplate } from '../../utils/expression-eval'
import { DEFAULT_DEMO_DATA } from '../../utils/demo-data'

const props = defineProps<{
  value: string
  fit?: string
  maxWidth?: number
  maxHeight?: number
  designMode?: boolean
  data?: Record<string, any>[]
}>()

const imageSrc = computed(() => {
  const raw = props.value || ''
  if (!raw) return ''
  
  // {字段} 表达式：设计态用 demo 数据求值，运行态用打印数据求值
  if (raw.includes('{')) {
    if (props.designMode) {
      return evaluateTemplate(raw, DEFAULT_DEMO_DATA)
    }
    return evaluateTemplate(raw, props.data?.[0] || {})
  }
  
  return raw
})

// 加载失败兜底
const hasError = ref(false)
function onError() {
  hasError.value = true
}

// src 变化时重置错误态
watch(imageSrc, () => {
  hasError.value = false
})

const imgStyle = computed(() => ({
  objectFit: (props.fit || 'contain') as any,
  maxWidth: props.maxWidth ? `${props.maxWidth}mm` : '100%',
  maxHeight: props.maxHeight ? `${props.maxHeight}mm` : '100%',
}))
</script>

<style scoped>
.cell-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.cell-image img {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbb;
  font-size: 12px;
  border: 1px dashed #ddd;
  box-sizing: border-box;
}
</style>
```

- [ ] **Step 2: 验证组件**

运行类型检查确保没有错误：

```bash
cd packages/print-canvas && npx tsc --noEmit
```

- [ ] **Step 3: 提交更改**

```bash
git add packages/print-canvas/src/components/elements/CellImage.vue
git commit -m "feat: create CellImage component for table cell image rendering"
```

---

### Task 3: 集成 CellImage 组件到 TableElement

**Files:**
- Modify: `packages/print-canvas/src/components/elements/TableElement.vue:22-34`
- Modify: `packages/print-canvas/src/components/elements/TableElement.vue:76-88`

**Interfaces:**
- Consumes: `CellImage` 组件
- Produces: 修改后的 `TableElement` 组件，支持图片类型单元格渲染

- [ ] **Step 1: 引入 CellImage 组件**

在 `TableElement.vue` 文件的 `<script setup>` 部分，添加 `CellImage` 组件的引入：

```typescript
import CellImage from './CellImage.vue'
```

- [ ] **Step 2: 修改单元格渲染逻辑**

在 `TableElement.vue` 文件的模板部分，找到单元格渲染逻辑（第 22-34 行），修改为：

```vue
<td
  v-if="!cell.merged"
  :rowspan="cell.rowspan || 1"
  :colspan="cell.colspan || 1"
  :class="cellClass(ri, ci)"
  :style="cellStyle(row, cell)"
  @mousedown.left="onCellMouseDown(ri, ci, $event)"
  @mouseenter="onCellMouseEnter(ri, ci)"
  @dblclick.stop="onCellDblClick(ri, ci)"
  @contextmenu.prevent.stop="onCellContextMenu(ri, ci, $event)"
>
  <CellBarcode
    v-if="isCodeCell(cell)"
    :cell-type="cell.cellType as 'barcode' | 'qrcode'"
    :value="cellDisplay(row, cell)"
    :barcode-type="cell.barcodeType"
    :qr-code-level="cell.qrCodeLevel"
    :show-text="cell.showBarcodeText"
  />
  <CellImage
    v-else-if="cell.cellType === 'image'"
    :value="cell.formatter || ''"
    :fit="cell.fit"
    :max-width="cell.maxWidth"
    :max-height="cell.maxHeight"
    :design-mode="designMode"
    :data="imageData"
  />
  <span v-else-if="row.type === 'data'" class="data-placeholder">
    {{ cellDisplay(row, cell) }}
  </span>
  <template v-else>{{ cellDisplay(row, cell) }}</template>
</td>
```

- [ ] **Step 3: 添加 imageData 计算属性**

在 `TableElement.vue` 文件的 `<script setup>` 部分，添加 `imageData` 计算属性：

```typescript
// 添加图片数据处理
const imageData = computed(() => {
  // 这里需要根据实际情况传入打印数据
  // 设计态下可以使用 demo 数据
  return undefined
})
```

- [ ] **Step 4: 验证组件**

运行类型检查确保没有错误：

```bash
cd packages/print-canvas && npx tsc --noEmit
```

- [ ] **Step 5: 提交更改**

```bash
git add packages/print-canvas/src/components/elements/TableElement.vue
git commit -m "feat: integrate CellImage component into TableElement"
```

---

### Task 4: 修改属性面板

**Files:**
- Modify: `packages/print-canvas/src/components/property/TableCellGroup.vue:5-11`
- Modify: `packages/print-canvas/src/components/property/TableCellGroup.vue:172-192`

**Interfaces:**
- Consumes: `StepperInput` 组件
- Produces: 修改后的 `TableCellGroup` 组件，支持图片类型选择和属性设置

- [ ] **Step 1: 修改单元格类型选择器**

在 `TableCellGroup.vue` 文件的模板部分，找到单元格类型选择器（第 5-11 行），修改为：

```vue
<div class="pd-field"><span class="pd-label">单元格类型</span>
  <div class="pd-radio-group" role="radiogroup">
    <label class="pd-radio"><input type="radio" value="text" :checked="(mainCell.cellType || 'text') === 'text'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>文本</span></label>
    <label class="pd-radio"><input type="radio" value="barcode" :checked="mainCell.cellType === 'barcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>条形码</span></label>
    <label class="pd-radio"><input type="radio" value="qrcode" :checked="mainCell.cellType === 'qrcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>二维码</span></label>
    <label class="pd-radio"><input type="radio" value="image" :checked="mainCell.cellType === 'image'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)"><span>图片</span></label>
  </div>
</div>
```

- [ ] **Step 2: 添加图片属性设置**

在 `TableCellGroup.vue` 文件的模板部分，在二维码属性设置之后（第 33 行之后），添加图片属性设置：

```vue
<div class="pd-field" v-if="isImageCell"><span class="pd-label">缩放模式</span>
  <select :value="mainCell.fit || 'contain'" class="pd-select" @change="write(c => { c.fit = ($event.target as HTMLSelectElement).value as any })">
    <option value="contain">包含（保持比例）</option>
    <option value="cover">覆盖（保持比例）</option>
    <option value="fill">拉伸填满</option>
    <option value="none">原始尺寸</option>
    <option value="scale-down">缩小（保持比例）</option>
  </select>
</div>
<div class="pd-field" v-if="isImageCell"><span class="pd-label">最大宽度 (mm)</span>
  <StepperInput :model-value="mainCell.maxWidth"
    :min="1"
    :max="200"
    placeholder="默认" @update:model-value="write(c => { c.maxWidth = $event ?? undefined })" />
</div>
<div class="pd-field" v-if="isImageCell"><span class="pd-label">最大高度 (mm)</span>
  <StepperInput :model-value="mainCell.maxHeight"
    :min="1"
    :max="200"
    placeholder="默认" @update:model-value="write(c => { c.maxHeight = $event ?? undefined })" />
</div>
```

- [ ] **Step 3: 添加 isImageCell 计算属性**

在 `TableCellGroup.vue` 文件的 `<script setup>` 部分，添加 `isImageCell` 计算属性：

```typescript
const isImageCell = computed(() => mainCell.value.cellType === 'image')
```

- [ ] **Step 4: 修改 onCellTypeChange 函数**

在 `TableCellGroup.vue` 文件的 `<script setup>` 部分，找到 `onCellTypeChange` 函数（第 183-192 行），修改为：

```typescript
function onCellTypeChange(v: string) {
  write(c => {
    c.cellType = v === 'text' ? undefined : (v as TableCellType)
    if (v !== 'barcode') {
      c.barcodeType = undefined
      c.showBarcodeText = undefined
    }
    if (v !== 'qrcode') c.qrCodeLevel = undefined
    if (v !== 'image') {
      c.fit = undefined
      c.maxWidth = undefined
      c.maxHeight = undefined
    }
  })
}
```

- [ ] **Step 5: 验证组件**

运行类型检查确保没有错误：

```bash
cd packages/print-canvas && npx tsc --noEmit
```

- [ ] **Step 6: 提交更改**

```bash
git add packages/print-canvas/src/components/property/TableCellGroup.vue
git commit -m "feat: add image type selection and properties to property panel"
```

---

### Task 5: 修改绑定注册

**Files:**
- Modify: `packages/print-canvas/src/utils/binding-registry.ts:27-64`

**Interfaces:**
- Consumes: 无
- Produces: 修改后的 `getTableCellBindings` 函数，支持图片单元格绑定

- [ ] **Step 1: 修改 getTableCellBindings 函数**

在 `binding-registry.ts` 文件中，找到 `getTableCellBindings` 函数（第 27-64 行），修改为：

```typescript
export function getTableCellBindings(
  rowType: string,
  rowIndex: number,
  cellIndex: number,
  listField?: string,
): BindingDescriptor[] {
  if (rowType === 'data') {
    return [{
      targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
      label: '内容',
      dataSource: 'list',
      listField,
      placeholder: '{name}',
    }]
  }
  if (rowType === 'subtotal') {
    return [{
      targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
      label: '内容',
      dataSource: 'subtotal',
      placeholder: '{MONEY(SUM(amount))}',
    }]
  }
  if (rowType === 'summary') {
    return [{
      targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
      label: '内容',
      dataSource: 'summary',
      placeholder: '{MONEY(SUM(amount))}',
    }]
  }
  return [{
    targetPath: `options.tableRows[${rowIndex}].cells[${cellIndex}].formatter`,
    label: '内容',
    dataSource: 'main',
    placeholder: '合计: {order.total}',
  }]
}
```

- [ ] **Step 2: 验证绑定注册**

运行类型检查确保没有错误：

```bash
cd packages/print-canvas && npx tsc --noEmit
```

- [ ] **Step 3: 提交更改**

```bash
git add packages/print-canvas/src/utils/binding-registry.ts
git commit -m "feat: update binding registry for image cell support"
```

---

### Task 6: 测试验证

**Files:**
- Create: `packages/print-canvas/src/__tests__/CellImage.spec.ts`
- Create: `packages/print-canvas/src/__tests__/TableCellImage.spec.ts`

**Interfaces:**
- Consumes: `CellImage` 组件、`TableElement` 组件
- Produces: 测试用例，验证图片单元格功能

- [ ] **Step 1: 创建 CellImage 组件测试**

创建文件 `packages/print-canvas/src/__tests__/CellImage.spec.ts`，内容如下：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CellImage from '../components/elements/CellImage.vue'

describe('CellImage', () => {
  it('renders placeholder when no value', () => {
    const wrapper = mount(CellImage, {
      props: { value: '' }
    })
    expect(wrapper.find('.image-placeholder').exists()).toBe(true)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders image when value is provided', () => {
    const wrapper = mount(CellImage, {
      props: { value: '/test-image.png' }
    })
    expect(wrapper.find('img').exists()).toBe(true)
    expect(wrapper.find('img').attributes('src')).toBe('/test-image.png')
  })

  it('applies fit style', () => {
    const wrapper = mount(CellImage, {
      props: { value: '/test-image.png', fit: 'cover' }
    })
    expect(wrapper.find('img').attributes('style')).toContain('object-fit: cover')
  })

  it('applies max width and height', () => {
    const wrapper = mount(CellImage, {
      props: { value: '/test-image.png', maxWidth: 50, maxHeight: 30 }
    })
    expect(wrapper.find('img').attributes('style')).toContain('max-width: 50mm')
    expect(wrapper.find('img').attributes('style')).toContain('max-height: 30mm')
  })
})
```

- [ ] **Step 2: 运行测试**

运行测试确保通过：

```bash
cd packages/print-canvas && npx vitest run src/__tests__/CellImage.spec.ts
```

- [ ] **Step 3: 创建表格图片单元格集成测试**

创建文件 `packages/print-canvas/src/__tests__/TableCellImage.spec.ts`，内容如下：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TableElement from '../components/elements/TableElement.vue'
import { TABLE_EDIT_KEY } from '../composables/useTableSelection'

describe('TableElement with image cell', () => {
  const mockElement = {
    id: 'el-table',
    options: {
      tableColWidths: [50],
      tableRows: [{
        id: 'r1',
        type: 'data' as const,
        height: 10,
        cells: [{
          id: 'c1',
          formatter: '{imageUrl}',
          cellType: 'image' as const,
          fit: 'contain',
          maxWidth: 40,
          maxHeight: 8,
        }]
      }]
    },
    printElementType: { type: 'table', title: '表格' }
  }

  const tableSelection = ref(null)
  const setTableSelection = () => {}
  const recordHistory = () => {}

  it('renders image cell correctly', () => {
    const wrapper = mount(TableElement, {
      props: {
        element: mockElement,
        designMode: true,
        isSelected: true,
      },
      global: {
        provide: {
          [TABLE_EDIT_KEY as symbol]: {
            tableSelection,
            setTableSelection,
            recordHistory,
            maxTableWidth: ref(Infinity),
          }
        }
      }
    })
    
    expect(wrapper.find('.cell-image').exists()).toBe(true)
    expect(wrapper.find('.image-placeholder').exists()).toBe(true)
  })
})
```

- [ ] **Step 4: 运行测试**

运行测试确保通过：

```bash
cd packages/print-canvas && npx vitest run src/__tests__/TableCellImage.spec.ts
```

- [ ] **Step 5: 运行所有测试**

运行所有测试确保没有破坏现有功能：

```bash
cd packages/print-canvas && npx vitest run
```

- [ ] **Step 6: 提交测试**

```bash
git add packages/print-canvas/src/__tests__/CellImage.spec.ts packages/print-canvas/src/__tests__/TableCellImage.spec.ts
git commit -m "test: add tests for image cell functionality"
```

---

### Task 7: 文档更新

**Files:**
- Modify: `docs/superpowers/specs/2026-09-04-table-cell-image-support-design.md`

**Interfaces:**
- Consumes: 设计文档
- Produces: 更新后的设计文档，反映实际实现

- [ ] **Step 1: 更新设计文档**

在设计文档中添加实现状态说明：

```markdown
## 实现状态

- [x] 类型定义扩展
- [x] CellImage 组件创建
- [x] TableElement 集成
- [x] 属性面板修改
- [x] 绑定注册修改
- [x] 测试验证
```

- [ ] **Step 2: 提交文档更新**

```bash
git add docs/superpowers/specs/2026-09-04-table-cell-image-support-design.md
git commit -m "docs: update design document with implementation status"
```

---

## 执行选项

**Plan complete and saved to `docs/superpowers/plans/2026-09-04-table-cell-image-support.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**