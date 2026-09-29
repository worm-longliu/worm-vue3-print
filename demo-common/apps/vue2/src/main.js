// Vue 2.7 子 demo 的应用入口：注册元素 + 声明自定义元素 + 挂载 SFC。
// 集成过程（模板 / 脚本 / 样式）全部在 src/App.vue 单文件组件里。
import Vue from 'vue'
import { registerAll } from '@worm-vue3-print/common'
import App from './App.vue'

// ① 一次性注册 <print-designer>：样式在组件 Shadow DOM 内，宿主不需要引 css
registerAll()

// ② 告诉 Vue 2：print-designer 是原生自定义元素，不是未注册组件。
// 漏掉这条会报 Unknown custom element，画面上是个空壳。
Vue.config.ignoredElements = ['print-designer']

new Vue({ render: h => h(App) }).$mount('#app')
