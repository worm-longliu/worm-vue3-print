# 打印模板设计器 Demo

`@worm-vue3-print/canvas` 的独立使用示例（Vite + Vue 3，无 Element Plus）。

## 内容

- 加载真实模板数据：模板 `106977040967000141`（采购收货单，A5 横向），其 `elements`
  已导出到 `src/template-purchase-receipt.json`
- 集成 `PrintDesigner`：初始模板 / 业务字段注入，`loadDefaultTemplate` 默认布局回调，
  以及 `back / preview / save` 三个事件的宿主实现
- 浏览器端免保存预览：`preview` 时把当前画布 JSON + `DEFAULT_DEMO_DATA`
  交给 `PrintHtmlPreview` 同构渲染、分页并支持打印（无需后端 PDF 服务）
- 保存演示：`save` 时输出控制台并将模板 JSON 下载为本地文件

## 运行

```bash
npm install
npm run dev      # http://localhost:9303
```

## 验证

```bash
npm run typecheck   # vue-tsc 类型检查
npm run build       # 生产构建
```

## 接入关系

与 `web` 宿主一致：设计器/核心包走 monorepo 源码消费（`vite.config.ts` 中 alias
指向 `packages/print-canvas/src`、`packages/print-core/src`，由 Vite 直接编译包内
`.vue/.ts`）；包内 `jsbarcode / qrcode / dompurify / sortablejs` 等依赖由宿主声明。