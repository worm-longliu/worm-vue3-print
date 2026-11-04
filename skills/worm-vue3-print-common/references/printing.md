# 打印链路

## 浏览器打印

NPM 宿主使用 `@worm-vue3-print/core` 的同构渲染能力；浏览器直挂使用 `WormPrintCommon.renderHtmlPages` 与 `browserCodeRenderer`。预览和实际打印必须使用同一份 `templateJson + printData + baseUrl`，打印用隐藏 iframe 或宿主现有预览窗口调 `window.print()`。

## 服务端 PDF

部署独立 `print-render` 服务，宿主后端持有 `RENDER_API_KEY` 并代理 `/render/pdf`。前端不保存渲染密钥，不虚构 core 内的 PDF 服务。

## 桌面客户端静默打印

NPM 宿主从 `@worm-vue3-print/core/client` 导入 `PrintClient`；直挂宿主使用 `WormPrintCommon.PrintClient`。浏览器与桌面客户端必须同机，客户端只绑定 `127.0.0.1`。连接、配对、枚举打印机后提交打印；`BUSY` 由宿主排队重试，客户端不提供离线补打队列。
