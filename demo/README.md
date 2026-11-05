# 打印模板设计器 Demo

`@worm-vue3-print/canvas` 的独立使用示例（Vite + Vue 3，无 Element Plus）。

## 内容

- 示例模板库：顶栏「加载示例」唤出选择弹窗（`src/samples/`），15 份内置示例
  全部自带静态数据，选中后同时回写模板、字段树与打印数据（宿主自渲染入口，设计器不内置）；
  页面进入后默认载入综合示例模板
- 集成 `PrintDesigner`：初始模板 / 业务字段注入，以及 `preview / save` 事件的宿主实现
- 浏览器端免保存预览：`preview` 时把当前画布 JSON + 当前示例的静态数据
  交给 `PrintHtmlPreview` 同构渲染、分页并支持打印（无需后端 PDF 服务）
- 服务端 PDF 打印：顶栏「服务端 PDF」按钮把当前画布 JSON + 当前示例的静态数据
  提交给同仓库的 render 微服务（`services/print-render`），服务端两遍渲染出 PDF 后在新标签页打开；
  顶栏实时显示渲染服务在线状态（经 `/render-api/health` 探测）
- AI 模板会话：`src/template-session.ts` 用浏览器 SDK 连接桌面打印客户端并 `attachTemplate` 签到，
  响应 `template.get/apply`——顶栏「AI 助手」徽标区分「未启动客户端 / 连接异常 / 已接入 / 写入冲突」，
  AI 写回自动清空示例标识并弹提示「已修改模板，可撤销」（写回只产生一步设计器历史）。
  需启动桌面客户端并在其设置里开启 MCP（见 [AI 接入](../docs/中文/指南/AI接入.md) §三）
- 保存演示：`save` 时输出控制台并将模板 JSON 下载为本地文件
- 自定义字体联调：**字体声明跟着模板走**——只有综合示例模板在 JSON 里内嵌 `fonts`（`public/fonts/` 放
  三款公开字体，见该目录 README），`App.vue` 的 `activeFonts` 从当前模板 JSON 读取后传给设计器；
  其余 14 份示例不写 `fonts`，字体下拉为空、保存也不带字体声明，导入的模板自带 `fonts` 时自动生效。
  模板里存相对路径 `/fonts/...`（传给设计器时补成 `FONT_BASE_URL` 绝对地址），字体基址与图片基址分离
  （默认站点 origin，可用 `VITE_FONT_BASE_URL` 覆盖），dev server 已返回 `Access-Control-Allow-Origin: *`
  供 render 服务与桌面客户端跨源取字体

## 运行

```bash
# 终端 1：启动 render 微服务（在仓库根；首次需 npx playwright install chromium，macOS 可直接使用系统 Chrome）
npm run dev:render   # http://localhost:3001

# 终端 2：启动 demo（同样在仓库根）
npm install
npm run dev:demo     # http://localhost:9303
```

顶栏的「宿主示例」下拉可以把页面切到其余四个宿主 demo（`:9331` Vue3 / `:9332` Vue2 / `:9335` React /
`:9334` jQuery，见仓库根的 `demo-common/`），五份示例模板与数据同源；总览导航页在 `:9300`
（`npm run nav:demo-common`，`npm run dev:demo-common:all` 会顺带起它）。

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
`.vue/.ts`）；包内 `jsbarcode / qrcode / dompurify` 等依赖由宿主声明。

## 线上部署

demo 为纯静态站点，可直接托管到 [EdgeOne Pages](https://edgeone.cloud.tencent.com/pages)：
导入 Git 仓库后保持根目录为仓库根，平台读取仓库根的 `edgeone.json` 自动完成安装、
构建（输出 `demo/dist`）与发布，推送代码即自动重新部署。

## 致谢

特别感谢 EdgeOne 为本站点提供 CDN 加速与安全防护。
