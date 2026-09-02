# 快速开始

## 安装

```bash
npm install worm-vue3-print
```

## 引入

```js
import { createApp } from 'vue'
import PrintDesigner from 'worm-vue3-print'
import 'worm-vue3-print/dist/style.css'

const app = createApp(App)
app.use(PrintDesigner)
```

## 简单示例

```vue
<template>
  <print-designer :template="template" @save="onSave" />
</template>

<script setup>
import { ref } from 'vue'

const template = ref({
  width: 210,
  height: 297,
  elements: []
})

function onSave(data) {
  console.log('已保存模板', data)
}
</script>
```

## 下一步

- 查看[使用指南](./guide/)了解更多功能
- 查看[API 文档](./api/)获取完整 API 说明
