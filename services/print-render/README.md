# @worm-vue3-print/render

基于 Playwright（Headless Chromium）的 PDF/截图打印渲染微服务，位于 monorepo 的
`services/print-render`（`private` 服务包，不发布 npm，仅 Docker 部署）。
通过 npm workspace 本地软链依赖同仓库的 `@worm-vue3-print/core`（表达式引擎与渲染管线），
修改 core 无需发版即可在本服务生效。
宿主（如管理后台 `web`）的后端 `PrintRenderClient` 调用本服务的 `POST /render/pdf` 与
`POST /render/screenshot`，传入 `templateJson`（模板 JSON）与 `printData`（打印数据），
由服务端**纯 Node 侧**完成渲染。

## 渲染流程

两遍渲染（见 `src/pdf-render.ts`）：

1. 数据绑定：`@worm-vue3-print/core` 的 `bindData` 将 `printData` 变量/表达式替换进模板；
2. 第一遍测量：`generateHtml` 生成测量 HTML，`page.setContent()` 加载后测量各元素实际高度（mm）；
3. 分页计算：`paginate` 基于实测高度执行分页算法（含表格重复表头、小计/汇总）；
4. 第二遍出图：按分页结果生成最终 HTML，`page.pdf()` 输出 PDF（截图接口为单遍 `page.screenshot()`）。

生成内容仅含 HTML/CSS/SVG 与 base64 `<img>`，页码 `{pageIndex}/{totalPages}` 在第二遍按分页填充。

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET`  | `/health` | 健康检查，返回浏览器池状态（活跃数/并发上限/队列长度） |
| `POST` | `/render/pdf` | 渲染并返回 `application/pdf` |
| `POST` | `/render/screenshot` | 渲染并返回 `image/png`（设计器叠层对比用，不分页） |

- 鉴权：`/render/*` 需携带请求头 `X-Render-Key`，与环境变量 `RENDER_API_KEY` 一致（默认 `dev-render-key`）。
- 请求体：`{ templateJson, printData, baseUrl }`。`templateJson` 必含 `paperSize`、`orientation`、`margins`；`baseUrl` 用于把相对路径图片（如 `/docfiles/...`）拼成可访问的绝对地址。
- 限制：请求体上限 10MB，单请求 30s 超时。

## 本地开发

浏览器**不随 `npm install` 自动下载**（仓库根 `.npmrc` 设置了
`playwright_skip_browser_download=true`），首次开发需手动安装一次 Chromium：

```bash
# 在仓库根安装依赖
npm install

# 仅首次：安装 Playwright Chromium（macOS 也可不装，运行时优先使用系统 Chrome）
npx playwright install chromium

# 常用命令（仓库根执行）
npm run dev -w @worm-vue3-print/render     # 开发运行（tsx 直跑 src/server.ts）
npm run build -w @worm-vue3-print/render   # tsc 编译到 services/print-render/dist/
npm run start -w @worm-vue3-print/render   # 生产运行（node dist/server.js）
npm run test -w @worm-vue3-print/render    # vitest（截图/分页用例需可启动浏览器）
```

> macOS 下 `BrowserPool` 优先使用系统 Chrome，其次回退 Playwright 自带 Chromium。
> render 的浏览器集成测试不包含在根 `npm test` 中（根测试仅覆盖 core/canvas），
> 由 CI 的独立 `render` job 执行。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务端口 |
| `RENDER_API_KEY` | `dev-render-key` | `X-Render-Key` 鉴权密钥 |
| `PLAYWRIGHT_CHROME_PATH` | （空） | 自定义 Chromium/Chrome 可执行路径；不设时优先 macOS 系统 Chrome，再回退 Playwright 自带 Chromium |

## Linux 无界面（命令行）环境浏览器安装

打印依赖 Playwright 启动浏览器。在不带图形界面的 Linux 服务器上，可安装
Chromium 或 Google Chrome 并以 headless 模式运行。`BrowserPool.launchBrowser`
优先读取环境变量 `PLAYWRIGHT_CHROME_PATH`，其次使用 macOS 系统 Chrome，最后
回退到 Playwright 自带 Chromium。

**Debian/Ubuntu 安装 Chromium：**

```bash
apt-get update && apt-get install -y chromium \
  && apt-get install -y fonts-noto-cjk    # 中文打印需要中文字体
```

**安装 Google Chrome：**

```bash
wget -qO- https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  -O /tmp/chrome.deb && apt-get install -y /tmp/chrome.deb
```

**启用系统 Chrome（二选一）：**

```bash
export PLAYWRIGHT_CHROME_PATH="$(command -v chromium)"   # Chromium
# 或
export PLAYWRIGHT_CHROME_PATH="$(command -v google-chrome)"   # Google Chrome
```

提示：容器内启动依赖 `--no-sandbox` 参数（`browser-pool.ts` 已默认带上）；若提示
缺少共享库，安装 `libnss3 libatk-bridge2.0-0 libx11-xcb1` 后重试。

## Docker 构建

镜像以**monorepo 仓库根为构建上下文**，`@worm-vue3-print/core` 经 workspace 本地软链
一并拷入镜像构建，不依赖 npm registry 发布版本：

```bash
# 在仓库根执行
docker build -f services/print-render/Dockerfile -t worm-vue3-print-render .
```

运行：

```bash
docker run -p 3001:3001 \
  -e RENDER_API_KEY="your-key" \
  worm-vue3-print-render
```

## 目录

- `src/server.ts` — Express 服务入口（HTTP 适配层：鉴权、超时、端点）
- `src/pdf-render.ts` — 两遍渲染主流程与公共 API（`renderPdf` / `renderScreenshot`）
- `src/browser-pool.ts` — Playwright 浏览器池（并发、复用、优雅关闭）
- `src/barcode-renderer.ts` — 服务端条码/二维码生成（bwip-js，注入 core CodeRenderer）
