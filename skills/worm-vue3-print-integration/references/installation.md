# 安装方式选择与操作

## 推荐询问方式

如果用户没有说明，用一句话确认：「需要直接使用发布包集成，还是要修改/调试 worm-vue3-print 源码？」不要把源码安装作为默认方案。

## 方案 A：NPM 包安装（生产集成默认）

### 仅使用渲染/表达式引擎

```bash
npm install @worm-vue3-print/core@^1.1.0
```

### 使用可视化设计器 + 浏览器预览

```bash
npm install @worm-vue3-print/core@^1.1.0 @worm-vue3-print/canvas@^1.1.0
```

- `canvas` 会自动带入 `dompurify`、`jsbarcode`、`qrcode`、`sortablejs` 等依赖。
- 宿主必须满足 `vue@^3.5.0`。
- 建议提交锁文件，避免 NPM 侧依赖升级引入构建差异。
- 已发布的当前版本为 `1.1.0`。

### 样式导入

```ts
import '@worm-vue3-print/canvas/style.css'
```

NPM 安装时不要写：

```ts
// 源码别名方式专用；NPM 包未暴露该子路径
import '@worm-vue3-print/canvas/native-controls.css'
```

## 方案 B：源码安装

适合调试/修改库源码、验证未发布分支、在 monorepo 内开发。

### B1. 准备源码仓库

```bash
git clone <用户提供的 worm-vue3-print 仓库地址>
cd worm-vue3-print
npm install
npm run build
npm test
```

`npm run build` 会构建所有 workspace 包。若后续通过 Vite 别名直接消费 `src`，构建仍建议执行一次，用于验证当前源码可构建。

### B2. 外部宿主使用 `file:` 安装本地包

```bash
npm install <仓库路径>/packages/print-core <仓库路径>/packages/print-canvas
```

或固定为依赖声明：

```json
{
  "dependencies": {
    "@worm-vue3-print/core": "file:../worm-vue3-print/packages/print-core",
    "@worm-vue3-print/canvas": "file:../worm-vue3-print/packages/print-canvas"
  }
}
```

该方式消费 `packages/*/dist`。修改库源码后必须回到仓库根目录执行 `npm run build`。样式仍导入 `@worm-vue3-print/canvas/style.css`。

### B3. Vite 直接消费源码（最接近 demo）

适用于需要调试 `.vue/.ts` 源码或让本地修改立即生效。外部宿主需要：

1. 声明 Vite Vue 插件与浏览器侧依赖：

```bash
npm install -D @vitejs/plugin-vue
npm install dompurify jsbarcode qrcode sortablejs
```

2. 在 `vite.config.ts` 中配置别名；CSS 子路径必须排在包名别名之前：

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const repo = fileURLToPath(new URL('../worm-vue3-print', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@worm-vue3-print/canvas/native-controls.css': `${repo}/packages/print-canvas/src/styles/native-controls.css`,
      '@worm-vue3-print/canvas': `${repo}/packages/print-canvas/src/index.ts`,
      '@worm-vue3-print/core': `${repo}/packages/print-core/src/index.ts`,
    },
  },
  server: {
    fs: {
      allow: [repo],
    },
  },
})
```

3. 组件入口与样式：

```ts
import { PrintDesigner, PrintHtmlPreview } from '@worm-vue3-print/canvas'
import '@worm-vue3-print/canvas/native-controls.css'
```

该模式下 Vite 直接编译包内源码，不再依赖 `dist`；浏览器侧依赖必须由宿主显式声明，demo 就是这种结构。

### 方案选择速查

| 条件 | 选择 |
| --- | --- |
| 使用已发布稳定功能 | NPM 包 |
| 本地验证打包产物 | 源码 + `file:` |
| 调试/修改 `.vue/.ts` 源码 | 源码 + Vite 别名 |
| 项目在 monorepo 内 | workspace + Vite 别名 |
| 需要 Node/浏览器同构渲染但不需要设计器 | 只安装 `core` |
