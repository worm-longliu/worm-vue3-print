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
