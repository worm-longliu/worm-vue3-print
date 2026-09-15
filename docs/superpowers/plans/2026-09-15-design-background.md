# 设计背景（designBackground）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增仅供设计画布显示的「设计背景（定位底图）」，宿主通过独立上传接口提供完整图片路径，设计器内可 90° 步进旋转；预览、PDF、打印、截图一律不输出。

**Architecture:** 在 `core/designer` 的设计器 `TemplateData` 上新增可选字段 `designBackground` 与宿主适配器类型 `UploadDesignBackgroundFn`；渲染端 `render/types.ts` 不声明该字段，沿用 `guides` 的结构隔离模式保证不入打印管线。canvas 侧经新注入键 `UPLOAD_DESIGN_BACKGROUND_KEY` 由 `PrintDesigner` prop provide；`CanvasPaper` 在纸张容器最底层渲染不可交互的旋转图层；页面属性 tab 新增独立 `DesignBackgroundConfig.vue` 负责上传/旋转/移除，所有变更走 `update:templateData` 自动进入撤销历史。

**Tech Stack:** TypeScript、Vue 3（`<script setup>`）、Vitest + @vue/test-utils + happy-dom、tsup/vite 构建。

**Spec:** `docs/superpowers/specs/2026-09-15-design-background-design.md`

## Global Constraints

- 字段仅加在 `packages/print-core/src/designer/types.ts`；`packages/print-core/src/render/types.ts` 禁止改动。
- `src` 必须是宿主返回的、可直接用于 `<img src>` 的完整图片路径；设计器不内置上传、不做压缩。
- 旋转值仅允许 `0 | 90 | 180 | 270`；读取时非法值按 `0` 处理。
- 背景图层 `pointer-events: none`、`draggable=false`，不拦截选中、拖拽、缩放。
- 不做透明度、任意角度、缩放、位移、镜像、多背景（YAGNI）。
- 不改动既有 `uploadImage` / `baseUrl` 机制与「叠层对比」功能。
- 所有回复、注释、提交信息使用简体中文；文件 UTF-8 无 BOM；单次写入不超过 500 行。
- 每个任务结束独立提交；`git add` 只添加本任务文件，不碰工作区其他无关改动。

---

## 文件结构

- 修改 `packages/print-core/src/designer/types.ts`：新增 `DesignBackground` 接口、`TemplateData.designBackground?`、`UploadDesignBackgroundFn`（`src/designer/index.ts` 已 `export * from './types.js'`，无需改动）。
- 修改 `packages/print-canvas/src/composables/useHostAdapter.ts`：新增注入键 `UPLOAD_DESIGN_BACKGROUND_KEY`。
- 修改 `packages/print-canvas/src/components/PrintDesigner.vue`：新增 prop `uploadDesignBackground` 并 provide。
- 修改 `packages/print-canvas/src/index.ts`：导出新注入键。
- 修改 `packages/print-canvas/src/components/CanvasPaper.vue`：纸张容器最底层渲染背景图层（含旋转几何）。
- 新建 `packages/print-canvas/src/components/property/DesignBackgroundConfig.vue`：上传/路径只读/旋转/移除。
- 修改 `packages/print-canvas/src/components/PropertyPanel.vue`：页面属性 tab 接入新组件。
- 测试：
  - 修改 `packages/print-core/src/render/html-generator.test.ts`
  - 新建 `packages/print-canvas/src/__tests__/CanvasPaperDesignBackground.spec.ts`
  - 新建 `packages/print-canvas/src/__tests__/DesignBackgroundConfig.spec.ts`
  - 新建 `packages/print-canvas/src/__tests__/design-background-persistence.spec.ts`
- 修改文档（Task 6）：`docs/中文/指南/模板设计器.md`、`docs/中文/接口/API文档.md`、`packages/print-canvas/README.md`。

---

## Task 1: core 类型与渲染隔离回归

**Files:**
- Modify: `packages/print-core/src/designer/types.ts`（`TemplateData` 约 L25-57；`UploadImageFn` 约 L335）
- Test: `packages/print-core/src/render/html-generator.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `export interface DesignBackground { src: string; rotation: 0 | 90 | 180 | 270 }`
  - `TemplateData`（designer）新增可选字段 `designBackground?: DesignBackground`
  - `export type UploadDesignBackgroundFn = (file: File) => Promise<string>`

- [ ] **Step 1: 写失败测试**

在 `packages/print-core/src/render/html-generator.test.ts` 的「页面背景色渲染」describe 之后追加：

```ts
// ─── 设计背景隔离：仅设计画布可见，渲染 HTML 必须完全不感知 ───

describe('设计背景不进入渲染管线', () => {
  it('模板带 designBackground 时，生成的 HTML/CSS 不包含其图片路径与节点', () => {
    const t = makeTemplate({}) as unknown as TemplateData & {
      designBackground?: { src: string; rotation: number }
    }
    t.designBackground = { src: 'https://host.example.com/scan-form.png', rotation: 90 }
    const html = generateHtml(t, singlePage)
    expect(html).not.toContain('scan-form.png')
    expect(html).not.toContain('designBackground')
    expect(html).not.toContain('design-background')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/html-generator.test.ts`

Expected: FAIL（`designBackground` 经 JS 展开进入模板对象后，当前用例对路径的断言即应失败；若 `makeTemplate` 产物序列化不含额外字段导致先通过，保留该用例作为回归锁，继续 Step 3）。

- [ ] **Step 3: 实现类型**

在 `packages/print-core/src/designer/types.ts` 的 `TemplateData` 中，`guides?` 字段之后新增：

```ts
  /** 设计背景（定位底图）：仅设计画布显示，用于套打对位；预览与打印管线一律忽略 */
  designBackground?: DesignBackground
```

在 `AlignLine` 等辅助类型附近（文件基础类型区）新增：

```ts
/** 设计背景（定位底图）：仅设计画布显示，预览/PDF/打印/截图均不输出 */
export interface DesignBackground {
  /** 宿主上传接口返回的完整图片路径，可直接用于 <img src> */
  src: string
  /** 旋转角度，仅允许 90° 步进；非法值读取时按 0 处理 */
  rotation: 0 | 90 | 180 | 270
}
```

在 `UploadImageFn` 之后新增：

```ts
/**
 * 设计背景图上传适配器（由宿主实现注入）。
 * 入参为用户选择的图片文件；返回值必须是可直接 <img src> 访问的完整图片路径。
 * 与 UploadImageFn 语义独立：不配合 baseUrl，不要求相对路径。
 */
export type UploadDesignBackgroundFn = (file: File) => Promise<string>
```

确认 `packages/print-core/src/render/types.ts` 不做任何改动。

- [ ] **Step 4: 运行测试与构建**

Run: `npm test -w @worm-vue3-print/core -- --run src/render/html-generator.test.ts && npm run build -w @worm-vue3-print/core`

Expected: PASS；core 构建成功。

- [ ] **Step 5: 提交**

```bash
git add packages/print-core/src/designer/types.ts packages/print-core/src/render/html-generator.test.ts
git commit -m "feat: 新增设计背景模型与上传适配器类型"
```

---

## Task 2: 宿主注入链路

**Files:**
- Modify: `packages/print-canvas/src/composables/useHostAdapter.ts`
- Modify: `packages/print-canvas/src/components/PrintDesigner.vue`（import 约 L132；props 约 L154-167；provide 约 L218）
- Modify: `packages/print-canvas/src/index.ts`（L23）

**Interfaces:**
- Consumes: Task 1 的 `UploadDesignBackgroundFn`
- Produces:
  - `export const UPLOAD_DESIGN_BACKGROUND_KEY: InjectionKey<ComputedRef<UploadDesignBackgroundFn | undefined>>`
  - `<PrintDesigner>` 新增 prop `uploadDesignBackground?: UploadDesignBackgroundFn`

- [ ] **Step 1: 新增注入键**

将 `packages/print-canvas/src/composables/useHostAdapter.ts` 改为：

```ts
import type { ComputedRef, InjectionKey } from 'vue'
import type { UploadDesignBackgroundFn, UploadImageFn } from '@worm-vue3-print/core/designer'

/** 图片上传适配器：PrintDesigner provide，ImageContentUpload inject */
export const UPLOAD_IMAGE_KEY: InjectionKey<ComputedRef<UploadImageFn | undefined>> =
  Symbol('print-upload-image')

/** 设计背景上传适配器：PrintDesigner provide，DesignBackgroundConfig inject */
export const UPLOAD_DESIGN_BACKGROUND_KEY: InjectionKey<ComputedRef<UploadDesignBackgroundFn | undefined>> =
  Symbol('print-upload-design-background')
```

- [ ] **Step 2: PrintDesigner 接入 prop 与 provide**

在 `PrintDesigner.vue` 的类型 import 中加入 `UploadDesignBackgroundFn`：

```ts
import type { RuntimeElement, PrintBusinessField, TemplateData, TableCell, RequestScreenshotFn, UploadImageFn, UploadDesignBackgroundFn } from '@worm-vue3-print/core/designer'
```

将 `useHostAdapter` 的 import 改为：

```ts
import { UPLOAD_IMAGE_KEY, UPLOAD_DESIGN_BACKGROUND_KEY } from '../composables/useHostAdapter'
```

在 props 中 `uploadImage?` 之后新增：

```ts
  /** 设计背景图上传适配器：未注入时背景上传入口禁用；返回值须为完整图片路径 */
  uploadDesignBackground?: UploadDesignBackgroundFn
```

在现有 `provide(UPLOAD_IMAGE_KEY, ...)` 之后新增一行：

```ts
provide(UPLOAD_DESIGN_BACKGROUND_KEY, computed(() => props.uploadDesignBackground))
```

- [ ] **Step 3: 包入口导出注入键**

将 `packages/print-canvas/src/index.ts` 末尾改为：

```ts
// 宿主能力注入键（高级自定义可选；常规接入仅需给 PrintDesigner 传 props）
export { UPLOAD_IMAGE_KEY, UPLOAD_DESIGN_BACKGROUND_KEY } from './composables/useHostAdapter'
```

- [ ] **Step 4: 类型构建验证**

Run: `npm run build -w @worm-vue3-print/canvas`

Expected: `vite build` 与 `vue-tsc -p tsconfig.build.json` 均通过。

- [ ] **Step 5: 提交**

```bash
git add packages/print-canvas/src/composables/useHostAdapter.ts packages/print-canvas/src/components/PrintDesigner.vue packages/print-canvas/src/index.ts
git commit -m "feat: 新增设计背景上传适配器注入链路"
```

---

## Task 3: CanvasPaper 背景图层与旋转几何

**Files:**
- Modify: `packages/print-canvas/src/components/CanvasPaper.vue`（模板 L7-10 区域；script props 约 L211-221、`paperWidthMM/paperHeightMM` 约 L243-248；style 区 L477 起）
- Test: `packages/print-canvas/src/__tests__/CanvasPaperDesignBackground.spec.ts`

**Interfaces:**
- Consumes: `TemplateData.designBackground: { src, rotation }`（Task 1）
- Produces: 画布内 DOM `.design-background > img`（无对外接口）

- [ ] **Step 1: 写失败测试**

新建 `packages/print-canvas/src/__tests__/CanvasPaperDesignBackground.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CanvasPaper from '../components/CanvasPaper.vue'
import type { TemplateData } from '@worm-vue3-print/core/designer'

function makeTemplate(designBackground?: TemplateData['designBackground']): TemplateData {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    header: { height: 10, elements: [] },
    footer: { height: 10, elements: [] },
    firstPageOverlay: { height: 0, elements: [] },
    elements: [],
    designBackground,
  } as TemplateData
}

function mountPaper(templateData: TemplateData, designMode = true) {
  return mount(CanvasPaper, {
    props: { templateData, runtimeElements: [], designMode, printData: [], scale: 1, guides: [] },
    global: { stubs: { BaseElement: true } },
  })
}

const SRC = 'https://host.example.com/scan-form.png'

describe('CanvasPaper 设计背景', () => {
  it('未设置背景时不渲染背景图层', () => {
    expect(mountPaper(makeTemplate()).find('.design-background').exists()).toBe(false)
  })

  it('非设计模式不渲染背景图层', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 0 }), false)
    expect(wrapper.find('.design-background').exists()).toBe(false)
  })

  it('0° 时图层与纸张同尺寸、无旋转、不拦截事件', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 0 }))
    const layer = wrapper.find('.design-background')
    const img = wrapper.find('.design-background img')
    expect(layer.exists()).toBe(true)
    expect(img.attributes('src')).toBe(SRC)
    expect(img.attributes('draggable')).toBe('false')
    const style = layer.attributes('style') ?? ''
    expect(style).toContain('width: 210mm')
    expect(style).toContain('height: 297mm')
    expect(style).toContain('left: 0mm')
    expect(style).toContain('top: 0mm')
    expect(style).not.toContain('rotate')
  })

  it('90° 时图层宽高交换并居中，绕纸张中心旋转', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 90 }))
    const style = wrapper.find('.design-background').attributes('style') ?? ''
    expect(style).toContain('width: 297mm')
    expect(style).toContain('height: 210mm')
    expect(style).toContain('left: -43.5mm')
    expect(style).toContain('top: 43.5mm')
    expect(style).toContain('rotate(90deg)')
  })

  it('非法旋转值按 0 处理', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 45 as 0 }))
    const style = wrapper.find('.design-background').attributes('style') ?? ''
    expect(style).toContain('width: 210mm')
    expect(style).toContain('height: 297mm')
    expect(style).not.toContain('rotate')
  })

  it('背景图层位于纸张容器内、内容层之前（最底层）', () => {
    const wrapper = mountPaper(makeTemplate({ src: SRC, rotation: 0 }))
    const paper = wrapper.find('.hiprint-printPaper')
    expect(paper.findAll('.design-background')).toHaveLength(1)
    expect(paper.element.children[0]?.classList.contains('design-background')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/CanvasPaperDesignBackground.spec.ts`

Expected: FAIL（`.design-background` 不存在）。

- [ ] **Step 3: 实现模板节点**

在 `CanvasPaper.vue` 的 `.hiprint-printPaper` 起始标签之后、`.hiprint-printPaper-content` 之前插入：

```vue
      <!-- 设计背景（定位底图）：仅设计画布显示，位于纸张最底层，不参与打印管线 -->
      <div
        v-if="designMode && designBackground?.src && !backgroundLoadFailed"
        class="design-background"
        :style="designBackgroundStyle"
      >
        <img
          :src="designBackground.src"
          draggable="false"
          alt=""
          @error="onBackgroundError"
        >
      </div>
```

- [ ] **Step 4: 实现 script 逻辑**

在 `paperHeightMM` computed 之后新增（需把 `ref` 已在现有 import 中，`watch` 加入 vue import）：

```ts
import { computed, ref, watch, onUnmounted } from 'vue'
```

```ts
// ─── 设计背景（仅设计画布显示，旋转为 90° 步进；90/270 交换宽高后居中再绕纸心旋转）───
const designBackground = computed(() => props.templateData.designBackground)
const backgroundLoadFailed = ref(false)
watch(() => designBackground.value?.src, () => { backgroundLoadFailed.value = false })

const normalizedBackgroundRotation = computed<0 | 90 | 180 | 270>(() => {
  const r = designBackground.value?.rotation
  return r === 90 || r === 180 || r === 270 ? r : 0
})

const designBackgroundStyle = computed(() => {
  const rotation = normalizedBackgroundRotation.value
  const swapped = rotation === 90 || rotation === 270
  const layerW = swapped ? paperHeightMM.value : paperWidthMM.value
  const layerH = swapped ? paperWidthMM.value : paperHeightMM.value
  const style: Record<string, string> = {
    width: layerW + 'mm',
    height: layerH + 'mm',
    left: (paperWidthMM.value - layerW) / 2 + 'mm',
    top: (paperHeightMM.value - layerH) / 2 + 'mm',
  }
  if (rotation !== 0) style.transform = `rotate(${rotation}deg)`
  return style
})

function onBackgroundError() {
  backgroundLoadFailed.value = true
  console.warn('[print-designer] 设计背景图加载失败：', designBackground.value?.src)
}
```

在 `<style scoped>` 的 `.grid-bg` 规则之前新增：

```css
/* 设计背景：铺满纸张最底层，不拦截任何指针事件 */
.design-background {
  position: absolute;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.design-background img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}
```

- [ ] **Step 5: 运行测试与构建**

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/CanvasPaperDesignBackground.spec.ts && npm run build -w @worm-vue3-print/canvas`

Expected: PASS；构建通过。

- [ ] **Step 6: 提交**

```bash
git add packages/print-canvas/src/components/CanvasPaper.vue packages/print-canvas/src/__tests__/CanvasPaperDesignBackground.spec.ts
git commit -m "feat: 设计画布支持定位底图显示与90度步进旋转"
```

---

## Task 4: 属性面板配置组件

**Files:**
- Create: `packages/print-canvas/src/components/property/DesignBackgroundConfig.vue`
- Modify: `packages/print-canvas/src/components/PropertyPanel.vue`（页面 tab 模板约 L102-137；import 区 L147-165；`emitUpdate` 约 L307-317）
- Test: `packages/print-canvas/src/__tests__/DesignBackgroundConfig.spec.ts`

**Interfaces:**
- Consumes:
  - 注入键 `UPLOAD_DESIGN_BACKGROUND_KEY: ComputedRef<UploadDesignBackgroundFn | undefined>`（Task 2）
  - 类型 `DesignBackground`（Task 1）
- Produces:
  - 组件 props：`modelValue?: DesignBackground`
  - 组件事件：`update:modelValue: [value: DesignBackground | undefined]`
  - `PropertyPanel` 在页面 tab 渲染该组件，`undefined` 表示移除字段

- [ ] **Step 1: 写失败测试**

新建 `packages/print-canvas/src/__tests__/DesignBackgroundConfig.spec.ts`：

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DesignBackgroundConfig from '../components/property/DesignBackgroundConfig.vue'
import { UPLOAD_DESIGN_BACKGROUND_KEY } from '../composables/useHostAdapter'
import { computed } from 'vue'

function setFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
}

function mountWith(uploader?: (file: File) => Promise<string>, modelValue?: { src: string; rotation: 0 | 90 | 180 | 270 }) {
  return mount(DesignBackgroundConfig, {
    props: { modelValue },
    global: uploader
      ? { provide: { [UPLOAD_DESIGN_BACKGROUND_KEY as symbol]: computed(() => uploader) } }
      : {},
  })
}

describe('DesignBackgroundConfig', () => {
  it('未注入上传适配器时上传入口禁用', () => {
    const wrapper = mountWith(undefined)
    const label = wrapper.find('label')
    expect(label.classes()).toContain('disabled')
    expect(wrapper.find('input[type="file"]').attributes('disabled')).toBeDefined()
  })

  it('上传成功后发出 { src, rotation: 0 }', async () => {
    const uploader = vi.fn(async () => 'https://host.example.com/bg.png')
    const wrapper = mountWith(uploader)
    const input = wrapper.find('input[type="file"]')
    setFile(input.element as HTMLInputElement, new File(['x'], 'bg.png', { type: 'image/png' }))
    await input.trigger('change')
    expect(uploader).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { src: 'https://host.example.com/bg.png', rotation: 0 },
    ])
  })

  it('非图片文件被拒绝且不调用适配器', async () => {
    const uploader = vi.fn(async () => 'https://host.example.com/bg.png')
    const wrapper = mountWith(uploader)
    const input = wrapper.find('input[type="file"]')
    setFile(input.element as HTMLInputElement, new File(['x'], 'a.txt', { type: 'text/plain' }))
    await input.trigger('change')
    expect(uploader).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('点击旋转按 0→90 循环发出新角度', async () => {
    const wrapper = mountWith(undefined, { src: 'https://host.example.com/bg.png', rotation: 0 })
    await wrapper.find('button.rotate-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([
      { src: 'https://host.example.com/bg.png', rotation: 90 },
    ])
  })

  it('点击移除发出 undefined', async () => {
    const wrapper = mountWith(undefined, { src: 'https://host.example.com/bg.png', rotation: 180 })
    await wrapper.find('button.remove-btn').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([undefined])
  })

  it('已设置时只读展示完整路径', () => {
    const wrapper = mountWith(undefined, { src: 'https://host.example.com/bg.png', rotation: 0 })
    const path = wrapper.find('.design-background-path')
    expect(path.text()).toBe('https://host.example.com/bg.png')
    expect(path.attributes('title')).toBe('https://host.example.com/bg.png')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/DesignBackgroundConfig.spec.ts`

Expected: FAIL（组件不存在，导入失败）。

- [ ] **Step 3: 实现组件**

新建 `packages/print-canvas/src/components/property/DesignBackgroundConfig.vue`：

```vue
<template>
  <div class="design-background-config">
    <h3 class="pd-divider">设计背景</h3>
    <p class="design-background-tip">仅设计器显示，用于套打定位，不会出现在预览和打印中</p>

    <template v-if="modelValue?.src">
      <div class="design-background-path" :title="modelValue.src">{{ modelValue.src }}</div>
      <div class="design-background-actions">
        <button type="button" class="pd-button small rotate-btn" @click="onRotate">
          旋转（{{ rotation }}°）
        </button>
        <button type="button" class="pd-button small remove-btn" @click="onRemove">移除</button>
      </div>
    </template>

    <label v-else class="pd-button small upload-label" :class="{ disabled: uploadDisabled }">
      {{ uploading ? '上传中...' : '上传背景图' }}
      <input
        class="visually-hidden"
        type="file"
        accept="image/*"
        :disabled="uploadDisabled"
        @change="onFileChange"
      >
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { DesignBackground } from '@worm-vue3-print/core/designer'
import { UPLOAD_DESIGN_BACKGROUND_KEY } from '../../composables/useHostAdapter'

const props = defineProps<{ modelValue?: DesignBackground }>()
const emit = defineEmits<{ 'update:modelValue': [value: DesignBackground | undefined] }>()

const uploading = ref(false)
const uploadDesignBackground = inject(UPLOAD_DESIGN_BACKGROUND_KEY, computed(() => undefined))
const uploadDisabled = computed(() => uploading.value || !uploadDesignBackground.value)

const rotation = computed(() => props.modelValue?.rotation ?? 0)

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    alert('仅支持上传图片文件')
    input.value = ''
    return
  }
  if (!uploadDesignBackground.value) {
    alert('设计背景上传能力未配置')
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const src = await uploadDesignBackground.value(file)
    if (src) {
      emit('update:modelValue', { src, rotation: 0 })
    } else {
      alert('设计背景上传失败')
    }
  } catch (err) {
    alert(err instanceof Error ? err.message : '设计背景上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function onRotate() {
  if (!props.modelValue?.src) return
  const next = ((rotation.value + 90) % 360) as DesignBackground['rotation']
  emit('update:modelValue', { src: props.modelValue.src, rotation: next })
}

function onRemove() {
  emit('update:modelValue', undefined)
}
</script>

<style scoped>
.design-background-config {
  padding: 0 4px;
}
.design-background-tip {
  margin: 2px 0 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--pd-text-muted, #909399);
}
.design-background-path {
  margin-bottom: 6px;
  padding: 4px 6px;
  font-size: 11px;
  color: var(--pd-text-regular, #606266);
  background: var(--pd-fill-light, #f5f7fa);
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.design-background-actions {
  display: flex;
  gap: 6px;
}
.upload-label {
  cursor: pointer;
}
.upload-label.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
```

- [ ] **Step 4: PropertyPanel 接线**

在 `PropertyPanel.vue` 的 import 区加入：

```ts
import DesignBackgroundConfig from './property/DesignBackgroundConfig.vue'
```

在页面 tab 模板中「页面背景色」`pd-field` 结束之后、`<h3 class="pd-divider">页边距 (mm)</h3>` 之前插入：

```vue
          <DesignBackgroundConfig
            :model-value="designBackgroundModel"
            @update:model-value="onDesignBackgroundChange"
          />
```

在 `<script setup>` 的页面属性模型区（`watermarkModel` 附近）新增：

```ts
const designBackgroundModel = computed(() => props.templateData?.designBackground)

function onDesignBackgroundChange(value: TemplateData['designBackground'] | undefined) {
  if (!props.templateData) return
  if (!value) {
    // 移除：物理删除字段，避免 JSON 中保留 designBackground: undefined
    const { designBackground: _removed, ...rest } = props.templateData
    emit('update:templateData', rest as TemplateData)
    return
  }
  emitUpdate({ designBackground: value })
}
```

- [ ] **Step 5: 运行测试与构建**

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/DesignBackgroundConfig.spec.ts && npm run build -w @worm-vue3-print/canvas`

Expected: PASS；构建通过（若提示 `_removed` 未使用，确保 `tsconfig.build.json` 未开启 `noUnusedLocals` 报错；如报错则改写为 `const rest = { ...props.templateData }; delete rest.designBackground`）。

- [ ] **Step 6: 提交**

```bash
git add packages/print-canvas/src/components/property/DesignBackgroundConfig.vue packages/print-canvas/src/components/PropertyPanel.vue packages/print-canvas/src/__tests__/DesignBackgroundConfig.spec.ts
git commit -m "feat: 页面属性支持上传旋转移除设计背景"
```

---

## Task 5: 序列化透传回归与文档、全量验证

**Files:**
- Test: `packages/print-canvas/src/__tests__/design-background-persistence.spec.ts`（新建）
- Modify: `docs/中文/指南/模板设计器.md`
- Modify: `docs/中文/接口/API文档.md`
- Modify: `packages/print-canvas/README.md`

**Interfaces:**
- Consumes: Task 1-4 全部产物
- Produces: 可发布的完整功能与中文接入文档

- [ ] **Step 1: 写序列化透传测试**

新建 `packages/print-canvas/src/__tests__/design-background-persistence.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { useDesignerState } from '../composables/useDesignerState'
import type { TemplateData } from '@worm-vue3-print/core/designer'

describe('designBackground 序列化透传', () => {
  it('updateTemplateData 后 getTemplateJson 保留背景与旋转角度', () => {
    const state = useDesignerState()
    state.updateTemplateData({
      ...state.templateData.value,
      designBackground: { src: 'https://host.example.com/bg.png', rotation: 270 },
    })
    const json = state.getTemplateJson()
    expect(json.designBackground).toEqual({ src: 'https://host.example.com/bg.png', rotation: 270 })
    // 序列化字符串中必须真实存在，而不是 undefined 占位
    expect(JSON.stringify(json)).toContain('designBackground')
  })

  it('loadTemplate 后背景被保留（toRuntimePool 整体展开透传）', () => {
    const state = useDesignerState()
    const incoming = {
      ...state.getTemplateJson(),
      designBackground: { src: 'https://host.example.com/bg2.png', rotation: 90 },
    } as TemplateData
    state.loadTemplate(incoming)
    expect(state.templateData.value.designBackground).toEqual({
      src: 'https://host.example.com/bg2.png',
      rotation: 90,
    })
  })

  it('移除背景后序列化 JSON 不含该字段', () => {
    const state = useDesignerState()
    state.updateTemplateData({
      ...state.templateData.value,
      designBackground: { src: 'https://host.example.com/bg.png', rotation: 0 },
    })
    const { designBackground: _removed, ...rest } = state.templateData.value
    state.updateTemplateData(rest as TemplateData)
    expect(JSON.stringify(state.getTemplateJson())).not.toContain('designBackground')
  })
})
```

Run: `npm test -w @worm-vue3-print/canvas -- --run src/__tests__/design-background-persistence.spec.ts`

Expected: PASS（`getTemplateJson` / `toRuntimePool` 均为整体展开，无需改实现；若失败，检查是否有白名单过滤，并在 `useDesignerState.ts` 补透传后重跑）。

- [ ] **Step 2: 更新中文指南 `docs/中文/指南/模板设计器.md`**

Props 表格在 `uploadImage` 行之后新增：

```markdown
| `uploadDesignBackground` | `(file: File) => Promise<string>` | 设计背景（定位底图）上传适配器，返回可直接访问的完整图片路径；不传则上传入口禁用。背景仅设计画布显示，不进入预览与打印 |
```

「六、宿主能力适配器」的代码块中，在 `uploadImage` 示例之后新增：

```ts
// 设计背景：宿主上传后必须返回完整图片路径（绝对 URL / 完整可访问地址），不配合 baseUrl
const uploadDesignBackground: UploadDesignBackgroundFn = async (file) => {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/files/design-background', { method: 'POST', body: form })
  const { url } = await res.json()
  return url
}
```

并将 import 示例类型改为 `import type { RequestScreenshotFn, UploadImageFn, UploadDesignBackgroundFn } from '@worm-vue3-print/canvas'`。

「七、模板模型 TemplateData」代码块中 `guides?` 之后新增：

```ts
  designBackground?: {                  // 设计背景（定位底图），仅设计画布显示，渲染端忽略
    src: string                         // 宿主上传返回的完整图片路径
    rotation: 0 | 90 | 180 | 270        // 90° 步进旋转，默认 0
  }
```

- [ ] **Step 3: 更新 API 文档 `docs/中文/接口/API文档.md`**

import 类型列表中加入 `UploadDesignBackgroundFn`；「另导出」一段的注入键说明改为 ``注入键 `UPLOAD_IMAGE_KEY`、`UPLOAD_DESIGN_BACKGROUND_KEY` ``；Props 表格在 `uploadImage` 行后新增：

```markdown
| `uploadDesignBackground` | `UploadDesignBackgroundFn` | 设计背景上传适配器，返回完整图片路径；背景仅设计画布显示，预览/打印不输出 |
```

- [ ] **Step 4: 更新 canvas 包 README `packages/print-canvas/README.md`**

关键 props 列表在 `uploadImage(...)` 一行之后新增：

```markdown
- `uploadDesignBackground(file) => Promise<string>`：设计背景（定位底图）上传，返回完整图片路径；背景仅设计画布显示，不进入预览与打印。
```

- [ ] **Step 5: 全量验证**

Run:

```bash
npm test -w @worm-vue3-print/core
npm test -w @worm-vue3-print/canvas
npm run build -w @worm-vue3-print/core
npm run build -w @worm-vue3-print/canvas
git diff --stat
```

Expected: core/canvas 测试全部通过（canvas 既有 157 个用例 + 本次新增），两个包构建成功。不运行根 `npm run build`（`clients/print-client` 存在与本功能无关的存量 tsc 错误）。手工验证清单（在接入了适配器的宿主或临时 demo 中执行）：

1. 上传后底图铺在纸张最底层，元素可正常选中拖拽；
2. 旋转 0→90→180→270→0，90/270 铺满不溢出；
3. 预览与浏览器打印/PDF 中无底图；
4. 保存后重新加载，背景与角度恢复；
5. 移除后画布恢复、JSON 无该字段；
6. 不传适配器时上传入口禁用。

- [ ] **Step 6: 提交**

```bash
git add packages/print-canvas/src/__tests__/design-background-persistence.spec.ts docs/中文/指南/模板设计器.md docs/中文/接口/API文档.md packages/print-canvas/README.md
git commit -m "docs: 补充设计背景接入说明与序列化回归"
```
