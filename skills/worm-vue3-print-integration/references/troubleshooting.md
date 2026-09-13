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

## 调用了组件上不存在的方法/事件

- `PrintDesigner` 只 emit `save`、`preview`，只 expose `getTemplateJson()`。
- 不存在 `back` 事件（返回导航属宿主职责），也不存在 `setTemplateMeta` 方法——若宿主用无类型 `ref` + 可选链调用它，TS 不报错但**静默失效**。模板名称/业务类型/备注等元信息由宿主自行展示和持久化。
- 以包内 `.d.ts`（`dist/components/PrintDesigner.vue.d.ts`）为唯一契约来源，不要信旧文档或 demo README 的过时描述。

## 模板重新进入设计器后是空白模板

1. 回填前先 `JSON.parse(elements)`，并判断 `json.paperSize` 存在才赋给 `initial-template`，否则保留 `createDefaultTemplate()`（损坏/空 elements 会拖垮画布）。
2. 新建模板时 elements 不要留空，服务端应存入 `JSON.stringify(createDefaultTemplate())`。
3. 确认设计器页父容器有确定高度（`height:100%` 链不断）。

## render 微服务相关（服务端 PDF）

- **401 UNAUTHORIZED**：请求头 `X-Render-Key` 与服务端 `RENDER_API_KEY` 不一致；确认密钥只在服务端/代理层注入。
- **504 RENDER_TIMEOUT**：超过服务端 30s 上限；复杂模板先排查图片/字体加载，宿主后端读取超时要 ≥30s（建议 40s）。
- **PDF 中文方块/分页错位**：渲染服务器缺中文字体，装 `fonts-noto-cjk`（或对应中文字体）后重试。
- **图片不显示/403**：渲染进程访问不到图片地址；相对路径用正确的对外 `baseUrl`，内网地址/鉴权图片要保证渲染环境可达。
- **浏览器起不来**：确认 `PLAYWRIGHT_CHROME_PATH`、Linux 已装 Chromium 与 `libnss3 libatk-bridge2.0-0 libx11-xcb1`，容器内使用 `--no-sandbox`（已默认）。
- **前端跨域/密钥泄露**：浏览器不要直连 3001；dev 用 Vite proxy 注入密钥，生产用宿主后端反代。参见 `demo/vite.config.ts`。
- 先用 `GET /health` 判断服务与浏览器池状态，再排查业务请求。

## 静默打印客户端相关（链路 C）

- **`CLIENT_NOT_RUNNING`**：SDK 探测不到本机客户端。确认工位电脑已安装并运行客户端、浏览器与客户端同机（客户端仅监听 `127.0.0.1`）；客户端重启期间 SDK 正在指数退避重连，稍后自动恢复。
- **`UNAUTHORIZED`**：客户端「安全开关」开启后未调用 `client.pair(token)` 配对，或浏览器 Origin 不在白名单。token 在客户端配置窗口查看，不明文进日志。
- **`PRINTER_NOT_FOUND`**：`printerName` 不在本机枚举列表；先 `client.listPrinters()` 拿真实名称（中文名保持一致）。
- **`PRINTER_OFFLINE` / `PRINT_FAILED`**：打印机脱机/缺纸/驱动异常，检查打印机状态；任务记录可在客户端配置窗口查看。
- **`BUSY`**：客户端单任务串行，已有任务在打；宿主侧延时重试或自己排队，客户端不排队。
- **`RENDER_TIMEOUT`**：两遍渲染超过客户端默认 30s；排查模板图片/字体加载，大任务可调大 `timeoutMs`。
- **静默出纸结果与浏览器预览分页不一致**：模板字体需在客户端电脑已安装；同一份 `templateJson + printData + baseUrl`、同一 core 版本。
- **连续纸末尾多走纸/裁切**：驱动对自定义纸高有步进/舍入，客户端探针推导公差不满足时，用 `paperSize.height`（微米）显式覆盖；宽度用 `paperSize.width`。
- **macOS 首次打不开客户端**：绿色版未签名，首次右键 → 打开。
