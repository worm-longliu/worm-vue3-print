<!-- 条形码/二维码配置分组：码制/条宽/显示文本/字号/纠错级别 -->
<template>
  <PropertyGroup title="条码设置" icon="Postcard" default-expanded group-key="code">
    <form class="pd-form" @submit.prevent>
      <template v-if="element.printElementType.type === 'barcode'">
        <div class="pd-field" v-show="showItem('cd-type')"><span class="pd-label">码制</span>
          <select class="pd-select" v-model="element.options.barcodeType"
>
            <option value="CODE128">CODE128（通用）</option>
            <option value="EAN13">EAN13（商品码）</option>
            <option value="EAN8">EAN8</option>
            <option value="UPC">UPC</option>
            <option value="CODE39">CODE39</option>
            <option value="ITF14">ITF14</option>
          </select>
        </div>
        <div class="pd-field" v-show="showItem('cd-bar-width')"><span class="pd-label">条宽（粗细）</span>
          <input :value="element.options.barWidth ?? 2" type="number" class="pd-input"
            :min="0.5"
            :max="4"
            :step="0.5"
            @input="element.options.barWidth = ($event.target as HTMLInputElement).valueAsNumber; emitChange()" />
        </div>
        <div class="pd-field" v-show="showItem('cd-show-text')"><span class="pd-label">显示文本</span>
          <input :checked="!element.options.hideTitle" type="checkbox" class="pd-switch"
            @input="element.options.hideTitle = !($event.target as HTMLInputElement).checked; emitChange()" />
        </div>
        <div class="pd-field" v-show="showItem('cd-font-size')"><span class="pd-label">文本字号 (pt)</span>
          <input type="number" class="pd-input" v-model.number="element.options.fontSize"
            :min="5"
            :max="24" />
        </div>
      </template>

      <template v-else-if="element.printElementType.type === 'qrcode'">
        <div class="pd-field" v-show="showItem('cd-ec-level')"><span class="pd-label">纠错级别</span>
          <select :value="String(element.options.qrCodeLevel ?? 'M')" class="pd-select"
            @change="element.options.qrCodeLevel = ($event.target as HTMLSelectElement).value; emitChange()">
            <option value="L">L（最低，容量大）</option>
            <option value="M">M（推荐）</option>
            <option value="Q">Q</option>
            <option value="H">H（最高）</option>
          </select>
        </div>
      </template>
    </form>
  </PropertyGroup>
</template>

<script setup lang="ts">
import type { RuntimeElement } from '../../types'
import PropertyGroup from './PropertyGroup.vue'

const props = defineProps<{
  element: RuntimeElement
  matchedKeys?: Set<string>
  searching?: boolean
}>()

const emit = defineEmits<{ change: [] }>()

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
