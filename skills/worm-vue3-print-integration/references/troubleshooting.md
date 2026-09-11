# 常见问题排查

先区分安装方式：NPM 包、`file:` 构建产物、Vite 源码别名。三种方式的问题定位完全不同。

## 组件渲染为空白或样式异常

1. 确认已导入一次样式。
   - NPM/`file:`：`import '@worm-vue3-print/canvas/style.css'`
   - Vite 源码别名：`import '@worm-vue3-print/canvas/native-controls.css'`
2. 检查导入顺序：全局 CSS 应在页面私有样式之前加载。
3. 检查宿主容器高度；`PrintDesigner` 使用 `height: 100%` 的布局，父级没有高度时画布会塌陷。

## TypeScript 找不到组件或类型

1. 确认从 `@worm-vue3-print/canvas` 导入，而不是深层 `.vue` 文件。
2. 确认 `package.json` 的 `types`/`exports` 能被解析。
3. 清理构建缓存后重新运行 `vue-tsc --noEmit`。
4. `file:`/源码方式必须先在仓库根执行 `npm run build`，确保 `dist` 与当前源码一致。

## NPM 安装后模块或依赖解析失败

1. 检查 Vue：

```bash
npm ls vue
```

   `canvas` 要求 `vue@^3.5.0`。
2. 检查包版本：

```bash
npm ls @worm-vue3-print/core @worm-vue3-print/canvas
```

   同一项目中不应混用不同版本的 `core`。
3. 不要在 NPM 安装中导入 `@worm-vue3-print/canvas/native-controls.css`；该路径只在源码别名模式可用。

## 源码别名不生效

1. 检查 `resolve.alias` 中更具体的 CSS 路径是否写在包名路径之前。
2. 确认路径指向：
   - `packages/print-canvas/src/index.ts`
   - `packages/print-core/src/index.ts`
   - `packages/print-canvas/src/styles/native-controls.css`
3. 确认 Vite 的 `server.fs.allow` 允许读取 monorepo 目录。
4. 确认宿主安装并启用了 `@vitejs/plugin-vue`。
5. 源码别名模式下，宿主需要声明 `dompurify`、`jsbarcode`、`qrcode`、`sortablejs`。

## `file:` 源码修改没有生效

`file:` 安装消费的是 `packages/*/dist`。回到仓库根执行：

```bash
npm run build
```

然后刷新宿主依赖缓存；必要时重新安装本地包。

## 表格没有数据

1. 检查表格元素的 `options.dataSource` 是否等于字段列表容器 `fieldKey`，例如 `goods`。
2. 检查 `printData.goods` 是否为数组。
3. 明细列表达式必须是完整路径，例如 `{goods.name}`。
4. 表格分页由 `options.tablePagination.enabled` 控制。

## 图片不显示

1. 相对路径需要通过 `base-url` 拼接；检查浏览器 Network 请求。
2. 图片上传必须由宿主实现 `upload-image`，返回可直接访问的 URL。
3. 服务端渲染时确认 `baseUrl` 对渲染进程可访问，且图片服务允许被读取。

## 预览页数或分页与最终输出不一致

1. 浏览器和浏览器/服务端必须使用同一份模板 JSON、同一份打印数据和同一个 `baseUrl`。
2. 检查浏览器字体、图片是否加载完成；分页前会等待，但有兜底超时。
3. 比较第一遍测量结果和 `paginate` 输入，不要只看最终 HTML。
4. 服务端 PDF 最终由 monorepo 内的 `services/print-render` 服务负责（经 workspace 软链使用同仓库 core）；先确认 render 服务与浏览器使用一致的 core 代码。
