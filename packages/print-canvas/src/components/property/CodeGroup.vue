<!-- 条形码/二维码配置分组：码制/条宽/显示文本/字号/纠错级别 + 自定义设置（缩放模式/最大宽高） -->
<template>
  <PropertyGroup title="条码设置" icon="Postcard" default-expanded group-key="code">
    <form class="pd-form" @submit.prevent>
      <template v-if="isBarcode">
        <div class="pd-field" v-show="showItem('cd-type')"><span class="pd-label">码制</span>
          <select class="pd-select" :value="barcodeType" @change="onBarcodeTypeChange">
            <option value="CODE128">CODE128（通用）</option>
            <option value="EAN13">EAN13（商品码）</option>
            <option value="EAN8">EAN8</option>
            <option value="UPC">UPC</option>
            <option value="CODE39">CODE39</option>
            <option value="ITF14">ITF14</option>
          </select>
        </div>
        <div class="pd-field" v-show="showItem('cd-dpi')"><span class="pd-label">打印机分辨率</span>
          <select class="pd-select" :value="dpiValue" @change="onDpiChange">
            <option value="">不对齐（按元素框缩放）</option>
            <option value="203">203 dpi（8 点/mm）</option>
            <option value="300">300 dpi（11.8 点/mm）</option>
            <option value="600">600 dpi（23.6 点/mm）</option>
          </select>
        </div>
        <p class="pd-hint" v-show="showItem('cd-dpi')">填写后条宽吸附到整数打印点（消除出纸「条宽忽宽忽窄」）；条码尺寸按元素框宽高与该分辨率反算，元素框宽度此时真正生效</p>
        <div class="pd-field" v-if="!dotAligned" v-show="showItem('cd-bar-width')"><span class="pd-label">条宽（倍率）</span>
          <StepperInput :model-value="element.options.barWidth ?? 2"
            :min="2"
            :max="4"
            :step="0.5"
            @update:model-value="element.options.barWidth = $event; emitChange()" />
        </div>
        <p class="pd-hint" v-else v-show="showItem('cd-bar-width')">条宽已由打印机分辨率自动对齐到整数打印点，无需手工调整</p>
        <div class="pd-field" v-show="showItem('cd-show-text')"><span class="pd-label">显示文本</span>
          <input :checked="element.options.hideTitle !== true" type="checkbox" class="pd-switch"
            @input="element.options.hideTitle = ($event.target as HTMLInputElement).checked ? undefined : true; emitChange()" />
        </div>
        <div class="pd-field" v-show="showItem('cd-font-size')"><span class="pd-label">文本字号（相对条高，条高为 30）</span>
          <StepperInput :model-value="element.options.fontSize"
            :min="5"
            :max="24"
            placeholder="默认 10"
            @update:model-value="element.options.fontSize = $event ?? undefined; emitChange()" />
        </div>
      </template>

      <template v-else-if="isQrcode">
        <div class="pd-field" v-show="showItem('cd-ec-level')"><span class="pd-label">纠错级别</span>
          <select class="pd-select" :value="String(element.options.qrCodeLevel ?? 'M')"
            @change="element.options.qrCodeLevel = ($event.target as HTMLSelectElement).value; emitChange()">
            <option value="L">L（最低，容量大）</option>
            <option value="M">M（推荐）</option>
            <option value="Q">Q</option>
            <option value="H">H（最高）</option>
          </select>
        </div>
      </template>

      <h3 class="pd-divider">自定义设置</h3>
      <p class="pd-hint" v-if="dotAligned">条码尺寸已按整数打印点对齐，由元素框与打印机分辨率决定；缩放模式与最大宽高此时不参与，需要它们请把「打印机分辨率」改为「不对齐」</p>
      <div class="pd-field" v-if="!dotAligned" v-show="showItem('cd-fit')"><span class="pd-label">缩放模式</span>
        <select class="pd-select" :value="element.options.fit || 'contain'" @change="onFitChange">
          <option value="contain">包含（保持比例）</option>
          <option value="cover">覆盖（保持比例）</option>
          <option value="fill">拉伸填满</option>
          <option value="none">原始尺寸</option>
          <option value="scale-down">缩小（保持比例）</option>
        </select>
      </div>
      <div class="pd-field" v-if="!dotAligned" v-show="showItem('cd-max-width')"><span class="pd-label">最大宽度 (mm)</span>
        <StepperInput :model-value="element.options.maxWidth"
          :min="1"
          :max="200"
          placeholder="默认"
          @update:model-value="element.options.maxWidth = $event ?? undefined; emitChange()" />
      </div>
      <div class="pd-field" v-if="!dotAligned" v-show="showItem('cd-max-height')"><span class="pd-label">最大高度 (mm)</span>
        <StepperInput :model-value="element.options.maxHeight"
          :min="1"
          :max="200"
          placeholder="默认"
          @update:model-value="element.options.maxHeight = $event ?? undefined; emitChange()" />
      </div>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RuntimeElement } from '@worm-vue3-print/core/designer'
import PropertyGroup from './PropertyGroup.vue'
import StepperInput from './StepperInput.vue'

const props = defineProps<{
  element: RuntimeElement
  matchedKeys?: Set<string>
  searching?: boolean
}>()

const emit = defineEmits<{ change: [] }>()

const isBarcode = computed(() => props.element.printElementType.type === 'barcode')
const isQrcode = computed(() => props.element.printElementType.type === 'qrcode')

/**
 * 码制归一化为大写的 jsbarcode 格式名。
 * jsbarcode 对格式名大小写不敏感，但存量模板存有小写（元素工厂缺省 `code128`），
 * 不归一化会导致下拉框匹配不到选项、显示为空。
 */
const barcodeType = computed(() => (props.element.options.barcodeType || 'CODE128').toUpperCase())

/** 打印机分辨率：'' 表示不启用点对齐（保持原有按框缩放行为） */
const dpiValue = computed(() => (props.element.options.printerDpi ? String(props.element.options.printerDpi) : ''))
const hasPrinterDpi = computed(() => !!props.element.options.printerDpi)
/** 点对齐只作用于条形码（二维码模块数固定，尺寸由 fit/最大宽高决定） */
const dotAligned = computed(() => isBarcode.value && hasPrinterDpi.value)

function onDpiChange(e: Event) {
  const value = Number((e.target as HTMLSelectElement).value)
  props.element.options.printerDpi = value > 0 ? value : undefined
  emitChange()
}

function onBarcodeTypeChange(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  props.element.options.barcodeType = value === 'CODE128' ? undefined : value
  emitChange()
}

function onFitChange(e: Event) {
  props.element.options.fit = (e.target as HTMLSelectElement).value || undefined
  emitChange()
}

function showItem(key: string): boolean {
  if (!props.searching) {
    return true
  }
  return props.matchedKeys?.has(key) ?? true
}

function emitChange() {
  emit('change')
}
</script>
