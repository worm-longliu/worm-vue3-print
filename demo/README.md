# 打印模板设计器 Demo

`@worm-vue3-print/canvas` 的独立使用示例（Vite + Vue 3，无 Element Plus）。

## 内容

- 加载真实模板数据：模板 `106977040967000141`（采购收货单，A5 横向），其 `elements`
  已导出到 `src/template-purchase-receipt.json`
- 集成 `PrintDesigner`：初始模板 / 业务字段注入，`loadDefaultTemplate` 默认布局回调，
  以及 `back / preview / save` 三个事件的宿主实现
- 浏览器端免保存预览：`preview` 时把当前画布 JSON + `DEFAULT_DEMO_DATA`
  交给 `PrintHtmlPreview` 同构渲染、分页并支持打印（无需后端 PDF 服务）
- 服务端 PDF 打印：顶栏「服务端 PDF」按钮把当前画布 JSON + `DEFAULT_DEMO_DATA`
  提交给同仓库的 render 微服务（`services/print-render`），服务端两遍渲染出 PDF 后在新标签页打开；
  顶栏实时显示渲染服务在线状态（经 `/render-api/health` 探测）
- 保存演示：`save` 时输出控制台并将模板 JSON 下载为本地文件

## 运行

```bash
# 终端 1：启动 render 微服务（首次需 npx playwright install chromium，macOS 可直接使用系统 Chrome）
npm run dev -w @worm-vue3-print/render   # http://localhost:3001

# 终端 2：启动 demo
npm install
npm run dev      # http://localhost:9303
```

demo 通过 Vite dev 代理调用服务：前端只请求同源 `/render-api/*`，由 `vite.config.ts`
转发到 `http://localhost:3001`（规避浏览器跨域），并在代理层注入 `X-Render-Key`，
密钥不进入前端 bundle。可用环境变量覆盖目标地址与密钥（仅 dev 生效）：

```bash
VITE_RENDER_TARGET=http://127.0.0.1:3001 VITE_RENDER_API_KEY=your-key npm run dev
```

> 生产部署需由宿主后端做等价的反向代理（转发并注入鉴权头），Vite 代理仅用于本地联调。


## 验证

```bash
npm run typecheck   # vue-tsc 类型检查
npm run build       # 生产构建
```

## 接入关系

与 `web` 宿主一致：设计器/核心包走 monorepo 源码消费（`vite.config.ts` 中 alias
指向 `packages/print-canvas/src`、`packages/print-core/src`，由 Vite 直接编译包内
`.vue/.ts`）；包内 `jsbarcode / qrcode / dompurify / sortablejs` 等依赖由宿主声明。