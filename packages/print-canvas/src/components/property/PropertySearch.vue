<template>
  <div class="property-search">
    <input
      v-model="searchText"
      class="pd-input"
      type="search"
      placeholder="搜索属性..."
      aria-label="搜索属性"
      @input="onSearch"
    >
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const searchText = ref('')
const emit = defineEmits<{ search: [text: string] }>()

function onSearch() {
  emit('search', searchText.value)
}
</script>

<style scoped>
.property-search {
  padding: 0 0 10px;
  background: transparent;
}
</style>
