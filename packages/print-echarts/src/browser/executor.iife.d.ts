/**
 * `@worm-vue3-print/echarts/browser/executor.iife` 的 types 入口。
 *
 * 该路径是副作用导入用的 IIFE 全局脚本，本身不导出任何符号；它注入的
 * `globalThis.__wormDom` 类型由主入口的 `src/type-augmentation.ts` 声明。
 * 本文件只负责让 TypeScript 解析该子路径时不再报「找不到声明」。
 */
export {}
