// 内置测试打印模板：A4 竖版，静态标题 + {printDate} 系统变量，无外部资源，
// 用于「测试打印」全链路自检。数据放 JSON 便于冒烟脚本直接读取，避免重复维护。
import data from './test-template.json'

export const TEST_TEMPLATE: Record<string, unknown> = data
