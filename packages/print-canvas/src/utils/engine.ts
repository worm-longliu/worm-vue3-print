// 打印设计器核心自持的表达式引擎单例。
// 独立于宿主（不依赖 @/utils），便于整体抽离为开源包；扩展函数由 ./expression-eval 注册。
import { TemplateEngine } from '@worm-vue3-print/core'

export const engine = new TemplateEngine()
