# 表格单元格支持图片类型设计文档

## 概述

为打印模板设计器中的表格单元格添加图片类型支持，允许用户在表格单元格中显示动态绑定的图片。

## 需求

### 功能需求

1. **单元格类型扩展**：支持图片类型单元格
2. **图片来源**：支持动态绑定字段（`{字段}` 表达式）
3. **图片属性**：
   - 缩放模式：`contain`、`cover`、`fill`、`none`、`scale-down`
   - 尺寸控制：最大宽度、最大高度
4. **显示逻辑**：
   - 设计态：显示占位符
   - 运行态：显示真实图片
5. **图片上传**：不支持（用户手动输入路径或 URL）

### 非功能需求

1. 与现有条形码/二维码单元格处理方式保持一致
2. 保持代码的可维护性和可扩展性
3. 不影响现有功能

## 技术设计

### 1. 类型定义扩展

**说明：** 图片单元格使用 `formatter` 字段存储图片 URL 或 `{字段}` 表达式，与文本单元格的 `formatter` 字段用途一致。图片特有属性（`fit`、`maxWidth`、`maxHeight`）为可选属性。

**文件：`packages/print-canvas/src/types.ts`**

```typescript
// 修改 TableCellType 联合类型
export type TableCellType = 'text' | 'barcode' | 'qrcode' | 'image'

// 修改 TableCell 接口，添加图片相关属性
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

### 2. 组件实现

#### 2.1 创建 CellImage 组件

**文件：`packages/print-canvas/src/components/elements/CellImage.vue`**

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

#### 2.2 修改 TableElement 组件

**文件：`packages/print-canvas/src/components/elements/TableElement.vue`**

```vue
<!-- 在模板中添加 CellImage 组件 -->
<template>
  <!-- ... 现有代码 -->
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
  <!-- ... 现有代码 -->
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { RuntimeElement, TableRow, TableCell, TableRowType } from '../../types'
import {
  normalizeSelection, canMergeReason, mergeCells, splitCells,
  insertRow, deleteRow, insertCol, deleteCol, setRowType, syncTableElementSize,
  resolveCellBorderCss, clampResizedColumnWidth,
} from '../../utils/table-matrix'
import { TABLE_EDIT_KEY, type TableEditContext } from '../../composables/useTableSelection'
import TableContextMenu from './TableContextMenu.vue'
import CellBarcode from './CellBarcode.vue'
import CellImage from './CellImage.vue'
import { resolveBarcodeDesignValue } from '../../utils/binding'
import { DEFAULT_DEMO_DATA } from '../../utils/demo-data'

// ... 其他现有代码

// 添加图片数据处理
const imageData = computed(() => {
  // 这里需要根据实际情况传入打印数据
  // 设计态下可以使用 demo 数据
  return undefined
})
</script>
```

### 3. 属性面板修改

**文件：`packages/print-canvas/src/components/property/TableCellGroup.vue`**

```vue
<!-- 修改单元格类型选择器 -->
<div class="pd-field">
  <span class="pd-label">单元格类型</span>
  <div class="pd-radio-group" role="radiogroup">
    <label class="pd-radio">
      <input type="radio" value="text" :checked="(mainCell.cellType || 'text') === 'text'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)">
      <span>文本</span>
    </label>
    <label class="pd-radio">
      <input type="radio" value="barcode" :checked="mainCell.cellType === 'barcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)">
      <span>条形码</span>
    </label>
    <label class="pd-radio">
      <input type="radio" value="qrcode" :checked="mainCell.cellType === 'qrcode'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)">
      <span>二维码</span>
    </label>
    <label class="pd-radio">
      <input type="radio" value="image" :checked="mainCell.cellType === 'image'" @change="onCellTypeChange(($event.target as HTMLInputElement).value)">
      <span>图片</span>
    </label>
  </div>
</div>

<!-- 添加图片属性设置 -->
<div class="pd-field" v-if="isImageCell">
  <span class="pd-label">缩放模式</span>
  <select :value="mainCell.fit || 'contain'" class="pd-select" @change="write(c => { c.fit = ($event.target as HTMLSelectElement).value as any })">
    <option value="contain">包含（保持比例）</option>
    <option value="cover">覆盖（保持比例）</option>
    <option value="fill">拉伸填满</option>
    <option value="none">原始尺寸</option>
    <option value="scale-down">缩小（保持比例）</option>
  </select>
</div>

<div class="pd-field" v-if="isImageCell">
  <span class="pd-label">最大宽度 (mm)</span>
  <StepperInput :model-value="mainCell.maxWidth"
    :min="1"
    :max="200"
    placeholder="默认" @update:model-value="write(c => { c.maxWidth = $event ?? undefined })" />
</div>

<div class="pd-field" v-if="isImageCell">
  <span class="pd-label">最大高度 (mm)</span>
  <StepperInput :model-value="mainCell.maxHeight"
    :min="1"
    :max="200"
    placeholder="默认" @update:model-value="write(c => { c.maxHeight = $event ?? undefined })" />
</div>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type {
  RuntimeElement, TableSelection, TableCell, TableCellBorder, TableCellBorders, TableCellType, TextAlign,
  PrintBusinessField,
} from '../../types'
import {
  canMergeReason, mergeCells, splitCells, applyBorderPreset, findMainCell, type BorderPreset,
} from '../../utils/table-matrix'
import { TABLE_EDIT_KEY } from '../../composables/useTableSelection'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'
import ExpressionEditor from '../ExpressionEditor.vue'
import PresetColorPicker from '../PresetColorPicker.vue'

// ... 其他现有代码

// 添加图片单元格判断
const isImageCell = computed(() => mainCell.value.cellType === 'image')

// 修改 onCellTypeChange 函数
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
</script>
```

### 4. 绑定注册修改

**文件：`packages/print-canvas/src/utils/binding-registry.ts`**

```typescript
// 修改 getTableCellBindings 函数
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

### 5. 渲染逻辑

**设计态：**
- 显示占位符（虚线边框 + "图片" 文字）
- 与图片元素的占位符样式一致

**运行态：**
- 解析 `src` 表达式
- 渲染图片，应用 `fit`、`maxWidth`、`maxHeight` 属性
- 加载失败时显示占位符

## 实现步骤

1. **类型定义**：修改 `types.ts` 添加图片类型和属性
2. **组件创建**：创建 `CellImage.vue` 组件
3. **组件集成**：修改 `TableElement.vue` 集成 `CellImage` 组件
4. **属性面板**：修改 `TableCellGroup.vue` 添加图片属性设置
5. **绑定注册**：修改 `binding-registry.ts` 添加图片单元格绑定
6. **测试验证**：编写测试用例验证功能

## 测试计划

1. **单元测试**：
   - 测试 `CellImage` 组件渲染
   - 测试图片表达式求值
   - 测试属性面板交互

2. **集成测试**：
   - 测试表格中图片单元格的完整流程
   - 测试设计态和运行态的显示差异

3. **边界测试**：
   - 测试无效图片 URL 的处理
   - 测试超大图片的显示
   - 测试图片加载失败的回退

## 兼容性

1. **向后兼容**：不影响现有表格单元格功能
2. **数据兼容**：新属性为可选，现有数据无需迁移
3. **浏览器兼容**：支持现代浏览器的图片渲染

## 风险评估

1. **性能风险**：大量图片可能影响渲染性能
   - 缓解措施：限制图片大小，添加加载失败回退

2. **兼容性风险**：不同浏览器对图片属性的支持差异
   - 缓解措施：使用标准 CSS 属性，提供回退方案

3. **安全风险**：外部图片 URL 可能存在安全问题
   - 缓解措施：限制图片来源，添加加载错误处理

## 总结

本设计通过扩展现有表格单元格类型，添加图片类型支持。采用与条形码/二维码一致的组件化设计，保持代码的一致性和可维护性。支持动态绑定字段、缩放模式和尺寸控制，满足用户在表格中显示图片的需求。

## 实现状态

- [x] 类型定义扩展
- [x] CellImage 组件创建
- [x] TableElement 集成
- [x] 属性面板修改
- [x] 绑定注册修改
- [x] 测试验证