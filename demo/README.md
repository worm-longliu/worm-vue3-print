# 打印模板设计器 Demo

`@worm-vue3-print/canvas` 的独立使用示例（Vite + Vue 3，无 Element Plus）。

## 内容

- 示例模板库：顶栏「加载示例」唤出选择弹窗（`src/samples/`），8 份内置示例
  全部自带静态数据，选中后同时回写模板、字段树与打印数据（宿主自渲染入口，设计器不内置）；
  页面进入后默认载入综合示例模板
- 集成 `PrintDesigner`：初始模板 / 业务字段注入，以及 `preview / save` 事件的宿主实现
- 浏览器端免保存预览：`preview` 时把当前画布 JSON + 当前示例的静态数据
  交给 `PrintHtmlPreview` 同构渲染、分页并支持打印（无需后端 PDF 服务）
- 服务端 PDF 打印：顶栏「服务端 PDF」按钮把当前画布 JSON + 当前示例的静态数据
  提交给同仓库的 render 微服务（`services/print-render`），服务端两遍渲染出 PDF 后在新标签页打开；
  顶栏实时显示渲染服务在线状态（经 `/render-api/health` 探测）
- 保存演示：`save` 时输出控制台并将模板 JSON 下载为本地文件
- 自定义字体联调：`public/fonts/` 放三款公开字体（见该目录 README），经 `fonts` prop 声明为
  模板级字体；字体基址与图片基址分离（`FONT_BASE_URL`，默认站点 origin，可用 `VITE_FONT_BASE_URL` 覆盖），
  dev server 已返回 `Access-Control-Allow-Origin: *` 供 render 服务与桌面客户端跨源取字体

## 运行

```bash
# 终端 1：启动 render 微服务（在仓库根；首次需 npx playwright install chromium，macOS 可直接使用系统 Chrome）
npm run dev:render   # http://localhost:3001

# 终端 2：启动 demo（同样在仓库根）
npm install
npm run dev:demo     # http://localhost:9303
```

demo 通过 Vite dev 代理调用服务：前端只请求同源 `/render-api/*`，由 `vite.config.ts`
转发到 `http://localhost:3001`（规避浏览器跨域），并在代理层注入 `X-Render-Key`，
密钥不进入前端 bundle。可用环境变量覆盖目标地址与密钥（仅 dev 生效）：

```bash
VITE_RENDER_TARGET=http://127.0.0.1:3001 VITE_RENDER_API_KEY=your-key npm run dev:demo
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

## 线上部署

demo 为纯静态站点，可直接托管到 [EdgeOne Pages](https://edgeone.cloud.tencent.com/pages)：
导入 Git 仓库后保持根目录为仓库根，平台读取仓库根的 `edgeone.json` 自动完成安装、
构建（输出 `demo/dist`）与发布，推送代码即自动重新部署。

## 致谢

特别感谢 EdgeOne 为本站点提供 CDN 加速与安全防护。
