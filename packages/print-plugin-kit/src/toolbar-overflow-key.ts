/**
 * 顶栏「更多」收纳能力的跨实现共享注入键。
 *
 * canvas（Vue 3 composable）与 common（/vue3 兼容门面）各自维护一份同源实现，
 * 但 provide/inject 必须用同一个 key：两处若各自 Symbol()，宿主 App.vue 与
 * DemoTopbarMore.vue 分别 import 不同实现时会静默拿不到上下文。
 * 用 Symbol.for 保证即使被打包进两个 bundle 也是同一个全局 symbol。
 */
export const TOOLBAR_OVERFLOW_KEY: symbol = Symbol.for('worm-vue3-print.toolbar-overflow.v1')
