# 安装与产物形态

## NPM 宿主

```bash
npm install @worm-vue3-print/common @worm-vue3-print/core
```

common 与 core 使用相同主线版本。common 虽发布到 `latest`，仍是实验性包，不建议生产。

```js
import { registerAll } from '@worm-vue3-print/common'
registerAll()
```

包只公开以下子路径：

- `@worm-vue3-print/common`：ESM/CJS 与类型入口。
- `@worm-vue3-print/common/browser`：UMD 浏览器产物。
- `@worm-vue3-print/common/style.css`：light DOM 样式。

不要引用 `@worm-vue3-print/common/dist/...`。

## jQuery / 无打包器宿主

从安装包的 `browser` 子路径对应产物复制 `common.js` 与 `common.css` 到宿主静态目录。UMD 已内联 core 和码制库，挂出 `window.WormPrintCommon`：

```html
<script src="/vendor/worm-print-common.js"></script>
<script>
  WormPrintCommon.registerAll()
</script>
```

Shadow DOM 不需要外链 CSS；只有明确使用 light DOM 时才增加：

```html
<link rel="stylesheet" href="/vendor/worm-print-common.css" />
```

## 框架构建配置

Vue 2.7 使用 `@vitejs/plugin-vue2`，并把 `print-designer` 配置为自定义元素。React 不需要自定义元素编译配置。宿主框架依赖由宿主自行安装，common 不安装 Vue 或 React 运行时。
