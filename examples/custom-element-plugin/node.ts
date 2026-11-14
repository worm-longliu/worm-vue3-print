// Node 宿主入口（服务端 PDF / Electron 主进程）：同样 import 即注册，
// 但**绝不 import index.ts**（那里带 Vue 组件），否则会把设计器依赖拖进服务端。
//
// 服务端装配：
//   import '@acme/print-signature/node'          // 部署白名单：注册插件
//   createDomHostRuntime(factory, loadExecutorBundle(), undefined, collectExecutorBundles())
//
// core 的 collectExecutorBundles() 会按注册态收集本描述符的 executorBundle()；
// 只有 createRenderer 的插件（如本示例）走进程内 SSR，连页面注入都不需要。
import { registerElementPlugin } from '@worm-vue3-print/core/designer'
import { SIGNATURE_PLUGIN, SIGNATURE_TYPE } from './plugin.js'

registerElementPlugin(SIGNATURE_PLUGIN)

export { SIGNATURE_PLUGIN, SIGNATURE_TYPE }
