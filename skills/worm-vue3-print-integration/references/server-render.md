# 服务端渲染微服务对接（print-render）

`services/print-render` 是 monorepo 内的 private 服务包（`@worm-vue3-print/render`，**不发布 npm**，Docker 部署）。它通过 npm workspace 本地软链依赖同仓库 `@worm-vue3-print/core`，在纯 Node 侧用 Playwright Headless Chromium 完成 PDF/截图渲染。宿主后端通过 HTTP 调用它。

## 1. 服务接口契约

| 方法 | 路径 | 鉴权 | 入参 | 出参 |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | 无 | - | `{status, activeRenders, maxConcurrent, queueLength}` |
| `POST` | `/render/pdf` | `X-Render-Key` 头 | `RenderRequest` | `application/pdf` 字节流 |
| `POST` | `/render/screenshot` | `X-Render-Key` 头 | `RenderRequest` | `image/png`（单遍，不分页，设计器叠层对比用） |

请求体 `RenderRequest`：

```json
{
  "templateJson": { "paperSize": "A4", "orientation": "portrait", "margins": {}, "elements": [] },
  "printData": { "order": { "no": "SO-001" } },
  "baseUrl": "https://host.example.com"
}
```

- `templateJson` 必填，且必须含 `paperSize`、`orientation`、`margins`，否则返回 400。即 `getTemplateJson()` 的产物，直接透传，不要自行裁剪。
- `printData` 兼容单对象与对象数组（数组=一次多份，每份独立分页）。
- `baseUrl` 用于把模板中相对路径图片（如 `/docfiles/xxx.png`）拼成渲染进程可访问的绝对地址。服务端渲染环境必须能访问这些图片 URL。
- 错误响应体：`{code, message}`，code 取值 `UNAUTHORIZED(401)`、`INVALID_REQUEST(400)`、`RENDER_TIMEOUT(504)`、`RENDER_FAILED/SCREENSHOT_FAILED(500)`。
- 限制：请求体 10MB，单请求 30s 超时（服务端内部）。宿主后端的 HTTP 读取超时应 **≥ 30s**（两遍渲染比单遍慢，复杂模板留足余量，实践中设 40s）。

鉴权：请求头 `X-Render-Key` 必须等于服务端环境变量 `RENDER_API_KEY`（默认 `dev-render-key`）。**密钥只能存在于宿主后端/代理层，绝不进前端 bundle。**

## 2. 渲染原理（两遍渲染）

见服务包 `src/pdf-render.ts`：

1. `core` 的 `bindData` 把 `printData` 变量/表达式替换进模板；
2. 第一遍测量：`generateHtml` 生成测量 HTML，`page.setContent()` 加载后测量各元素实际高度（mm）；
3. `paginate` 按实测高度分页（含表格重复表头、小计/汇总）；
4. 第二遍出图：按分页结果生成最终 HTML，`page.pdf()` 出 PDF。截图接口是单遍 `page.screenshot()`。

因此浏览器预览与服务端 PDF 分页一致的前提：同一份 `templateJson`、同一份 `printData`、同一个 `baseUrl`，以及渲染环境装了与设计时一致的中文字体。

## 3. 部署

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 服务端口 |
| `RENDER_API_KEY` | `dev-render-key` | 鉴权密钥，生产必须改 |
| `PLAYWRIGHT_CHROME_PATH` | 空 | 自定义 Chromium/Chrome 路径；不设时自动探测 PATH 与系统常见安装位置，再回退 Playwright 自带 Chromium |

浏览器不随 `npm install` 自动下载（仓库根 `.npmrc` 设了 `playwright_skip_browser_download=true`）；运行时自动使用系统已装的 Chromium/Chrome，系统中没有任何 Chromium 内核浏览器时才需 `npx playwright install chromium`。

### Linux 无界面服务器

```bash
# Chromium + 中文字体（中文打印缺字体则方块/乱码、分页错位）
# apt 安装的 /usr/bin/chromium 会被自动探测使用，无需再设 PLAYWRIGHT_CHROME_PATH
apt-get update && apt-get install -y chromium fonts-noto-cjk
```

非标准安装路径才需要 `PLAYWRIGHT_CHROME_PATH` 显式指定。

容器内已默认带 `--no-sandbox`；缺共享库时补 `libnss3 libatk-bridge2.0-0 libx11-xcb1`。

### Docker

镜像以 **monorepo 仓库根**为构建上下文（core 经 workspace 软链一并构建，不依赖 npm registry 版本）：

```bash
# 仓库根执行
docker build -f services/print-render/Dockerfile -t worm-vue3-print-render .
docker run -p 3001:3001 \
  -e RENDER_API_KEY="your-key" \
  -e PLAYWRIGHT_CHROME_PATH="/usr/bin/chromium" \
  worm-vue3-print-render
```

### 本地开发

```bash
npm install
npx playwright install chromium            # 仅首次
npm run dev -w @worm-vue3-print/render     # http://localhost:3001
```

## 4. 宿主后端对接

宿主后端是唯一持有渲染密钥、并负责组装业务数据的一方。职责：取模板 elements → 组装 printData → 带上密钥转发 → 把字节流返回前端（或落盘归档）。

Java 参考（JDK HttpClient，可直接照搬到任意语言）：

```java
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create(renderBaseUrl + "/render/pdf"))
    .header("Content-Type", "application/json")
    .header("X-Render-Key", renderApiKey)
    .timeout(Duration.ofSeconds(40))         // ≥ 服务端 30s
    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
    .build();
HttpResponse<byte[]> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofByteArray());
if (resp.statusCode() != 200) {
    // 记录 resp.body()（{code,message}），向调用方返回业务错误
}
return resp.body();                          // application/pdf
```

配置项建议：`print.render.url`（默认 `http://localhost:3001`）、`print.render.key`、`print.render.base-url`（服务端对外基址，用于拼图片绝对地址）、连接超时 2s、读取超时 40s。密钥/基址用环境变量覆盖。

两类服务端端点：
- **已保存模板打印**：入参 `{templateId, businessType, orderId?}` → 后端取模板 + 组装真实业务数据 → 转发。
- **设计器免保存预览/截图**：入参直接带 `{templateJson, printData}` → 后端原样转发（printData 用 demo 数据），供设计器里的截图叠层对比。

## 5. 前端如何调用（不要直连渲染服务）

浏览器不能持有 `X-Render-Key`，也常遇跨域。正确做法是前端调同源地址，由后端/dev 代理转发并注入密钥。

- 开发联调：Vite 配置 `server.proxy`，把 `/render-api` 转发到 `http://localhost:3001`，`rewrite` 去掉前缀，并在 `proxyReq` 上 `setHeader('X-Render-Key', key)`。密钥通过只在 dev 读取的环境变量注入，不进 bundle。完整示例见本仓库 `demo/vite.config.ts`。
- 生产：由宿主后端提供等价反向代理端点（如 `/sys/print/render/pdf`），前端以 `responseType: 'blob'` 接收。
- 前端最小封装见 `demo/src/render-client.ts`（健康探测 `/health`、请求 PDF Blob、新标签打开/降级下载）。

## 6. 上线核对清单

- [ ] `RENDER_API_KEY` 已改为非默认值，且只存在于服务端/代理配置。
- [ ] `/health` 返回 200 且浏览器池正常。
- [ ] Linux 已装 Chromium 与 `fonts-noto-cjk`，`PLAYWRIGHT_CHROME_PATH` 指向正确。
- [ ] 宿主读取超时 ≥ 30s（建议 40s），请求体上限覆盖模板+数据（服务端上限 10MB）。
- [ ] 模板内图片 URL 对渲染进程可访问（相对路径 + 正确 `baseUrl`）。
- [ ] 前端不直连 3001、不包含密钥；经同源代理访问。
- [ ] 同一模板在浏览器预览与服务端 PDF 的分页一致（同 templateJson/printData/baseUrl/字体）。
