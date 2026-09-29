import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerAll } from '@worm-vue3-print/common'
import App from './App'
import './styles/demo-ui.css'

// 一次性注册 <print-designer>：组件本体零框架依赖，样式在 Shadow DOM 内，
// 宿主侧的 demo 版式样式统一来自 demo-ui.css（由 sync-demo-styles.mjs 从 demo 抽取）
registerAll()

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>,
)
