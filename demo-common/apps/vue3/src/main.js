import { createApp } from 'vue'
import { registerAll } from '@worm-vue3-print/common'
import App from './App.vue'

// 一次性注册 <print-designer>：不自动污染全局，宿主按需调用
registerAll()

// SFC 的编译期配置见 vite.config.js 的 @vitejs/plugin-vue → template.compilerOptions.isCustomElement
// （runtime-only 构建下 app.config.compilerOptions 不生效，只在用运行时编译器的宿主里才需要那条）
createApp(App).mount('#app')
