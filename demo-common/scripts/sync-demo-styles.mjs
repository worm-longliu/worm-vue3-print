import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// demo-common 样式单一来源：把 Vue3 demo 的版式样式逐字抽成一份 CSS，落到四个宿主工程。
// 子 demo 的宿主 UI 必须与 demo 完全一致，因此这里只做「抽取 + 拼接」，不改一个像素值；
// demo 的样式改了之后重跑本脚本即可（禁止手改产物 demo-ui.css，会被下次同步覆盖）。
// 用法：node demo-common/scripts/sync-demo-styles.mjs
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')

/** 抽取来源：顺序即层叠顺序，与 demo 中各组件的 scoped 样式互不干扰 */
const SOURCES = [
  { file: 'demo/src/App.vue', title: 'demo 骨架：顶栏 / 画布容器 / 全屏预览层' },
  { file: 'demo/src/components/PrintOutputDialog.vue', title: '打印输出弹窗（服务端 PDF / 客户端静默打印）' },
  { file: 'demo/src/components/TemplateGalleryDialog.vue', title: '示例模板库弹窗' },
  { file: 'demo/src/components/CustomDataDialog.vue', title: '自定义字段与数据弹窗' },
  { file: 'demo/src/components/SampleThumb.vue', title: '示例卡片缩略图' },
  { file: 'packages/print-canvas/src/components/PrintHtmlPreview.vue', title: '预览 iframe 容器（子 demo 用原生 iframe 复刻同一 DOM）' },
]

/**
 * 通用宿主适配相对 demo 必然多出的两条：
 * demo 里 PrintDesigner 是 Vue 组件、根节点自带高度；`<print-designer>` 是自定义元素，
 * 默认 display:inline，不显式给块级宽高会整体塌陷。根选择器一并覆盖四工程挂载点。
 */
const COMMON_EXTRA = `
/* ── 通用宿主适配补充（非 demo 样式，仅为让自定义元素拿到与组件根节点相同的高度） ── */
html,
body,
#app,
#root,
.demo-app {
  height: 100%;
  margin: 0;
}
.demo-container print-designer {
  display: block;
  width: 100%;
  height: 100%;
}
`

/** 取出一个 SFC 里所有 style 块的正文 */
function extractStyleBlocks(source) {
  const blocks = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
  if (!blocks.length) throw new Error('未找到 <style> 块')
  return blocks.map(([, css]) => css.trim()).join('\n\n')
}

const sections = SOURCES.map(({ file, title }) => {
  const css = extractStyleBlocks(readFileSync(join(REPO, file), 'utf8'))
  return `/* ══ ${title} ══ 逐字来自 ${file} */\n${css}`
})

const banner = `/*
 * 宿主 UI 样式：与 ./demo（Vue 3 打印设计器示例）完全一致。
 * 由 demo-common/scripts/sync-demo-styles.mjs 自动生成，请勿手改。
 */`
const output = `${banner}\n\n${sections.join('\n\n')}\n${COMMON_EXTRA.trimEnd()}\n`

const APPS = ['vue3', 'vue2', 'react', 'jquery']
for (const app of APPS) {
  const dir = join(REPO, 'demo-common', 'apps', app, 'src', 'styles')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'demo-ui.css'), output, 'utf8')
}
console.log(`已同步 ${APPS.length} 份 demo-ui.css（${output.split('\n').length} 行）`)
