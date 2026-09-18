# @worm-vue3-print/render

基于 Playwright（Headless Chromium）的 PDF/截图打印渲染微服务，位于 monorepo 的
`services/print-render`（`private` 服务包，不发布 npm，仅 Docker 部署）。
通过 npm workspace 本地软链依赖同仓库的 `@worm-vue3-print/core`（表达式引擎与渲染管线），
修改 core 无需发版即可在本服务生效。
宿主（如管理后台 `web`）的后端 `PrintRenderClient` 调用本服务的 `POST /render/pdf` 与
`POST /render/screenshot`，传入 `templateJson`（模板 JSON）与 `printData`（打印数据），
模板绑定、分页与 HTML 生成在 Node 侧完成；测量、连续纸探针、码制渲染与出图由 `@worm-vue3-print/core` 的 DOM 执行器在页面上下文执行（与浏览器预览、桌面客户端共用同一份管线）。

## 渲染流程

两遍渲染由 `@worm-vue3-print/core` 的打印管线统一实现（`src/pdf-render.ts` 只做宿主装配，`src/driver-playwright.ts` 提供页面能力）：

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
- 请求体：`{ templateJson, printData, baseUrl, fontBaseUrl }`。`templateJson` 必含 `paperSize`、`orientation`、`margins`；`baseUrl` 用于把相对路径图片（如 `/docfiles/...`）拼成可访问的绝对地址；`fontBaseUrl` 用于相对路径字体（模板 `fonts[].files[].url`），缺省回落 `baseUrl`，容器部署常用环境变量 `FONT_BASE_URL` 统一指定（容器内 `localhost` 指向容器自身，模板里的相对字体地址必须指向容器可达的静态站/CDN）。
- **字体文件必须允许跨源加载**：容器加载模板 HTML 时的 origin 为 `null`，字体站点/CDN 需返回 `Access-Control-Allow-Origin`（如 `*`），否则字体静默回退系统字体、出图与设计稿不一致。
- `printData`：业务数据，传对象渲染单份；传非空对象数组时按数组长度批量渲染，各份数据不同、份间自动分页，合并为同一个 PDF（最多 500 份）。空数组、超过上限或数组项不是对象时返回 `400 INVALID_REQUEST`。`/render/screenshot` 传数组时仅渲染第一条数据。
- 限制：请求体上限 10MB，单请求 30s 超时。

## 本地开发

浏览器**不随 `npm install` 自动下载**（仓库根 `.npmrc` 设置了
`playwright_skip_browser_download=true`）。运行时 `BrowserPool` 会自动探测并使用
系统已安装的 Chromium/Chrome（PATH → 常见安装路径），因此本机有 Chrome 时无需额外操作；
只有系统中没有任何 Chromium 内核浏览器时，才需要手动安装一次：

```bash
# 在仓库根安装依赖
npm install

# 仅在系统没有 Chromium/Chrome 时执行：安装 Playwright 自带 Chromium
npx playwright install chromium

# 常用命令（仓库根执行）
npm run dev -w @worm-vue3-print/render     # 开发运行（tsx 直跑 src/server.ts）
npm run build -w @worm-vue3-print/render   # tsc 编译到 services/print-render/dist/
npm run start -w @worm-vue3-print/render   # 生产运行（node dist/server.js）
npm run test -w @worm-vue3-print/render    # vitest（截图/分页用例需可启动浏览器）
```

> `BrowserPool` 自动探测系统浏览器（env 覆盖 → PATH → 常见安装路径），找不到才回退
> Playwright 自带 Chromium。
> render 的浏览器集成测试不包含在根 `npm test` 中（根测试仅覆盖 core/canvas），
> 由 CI 的独立 `render` job 执行。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务端口 |
| `RENDER_API_KEY` | `dev-render-key` | `X-Render-Key` 鉴权密钥 |
| `PLAYWRIGHT_CHROME_PATH` | （空） | 自定义 Chromium/Chrome 可执行路径，优先级最高；不设时自动探测 PATH 与系统常见安装位置，再回退 Playwright 自带 Chromium |

## Linux 无界面（命令行）环境浏览器安装

打印依赖 Playwright 启动浏览器。**推荐直接安装系统 Chromium/Chrome，`BrowserPool` 会自动探测使用，无需下载 Playwright 浏览器、也无需设置环境变量。** 探测顺序：`PLAYWRIGHT_CHROME_PATH` → PATH 中的 `chromium`/`google-chrome` 等 → 各平台常见安装路径 → Playwright 自带 Chromium。

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

安装在非标准路径（或需要强制指定）时才设置：

```bash
export PLAYWRIGHT_CHROME_PATH="/opt/google/chrome/chrome"
```

提示：容器内启动依赖 `--no-sandbox` 参数（`browser-pool.ts` 已默认带上）；若提示
缺少共享库，安装 `libnss3 libatk-bridge2.0-0 libx11-xcb1` 后重试。系统浏览器与
Playwright 自带 Chromium 都不存在时，服务启动会报明确错误，按提示安装系统浏览器或执行
`npx playwright install chromium` 即可。

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
- `src/driver-playwright.ts` — Playwright driver（借页、视口、注入 core 执行器、`page.pdf`/`page.screenshot`）
