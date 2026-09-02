# @worm-vue3-print/core

打印模板表达式引擎与**同构渲染管线**（数据绑定 / HTML 生成 / 分页 / 测量元素），纯 TypeScript。

```
print-core/
  src/
    lexer.ts / parser.ts / evaluator.ts / template-parser.ts   # 模板表达式引擎
    functions/                                                # formatMoney / formatDate / sum / concat 等
    render/
      data-binder.ts        # 变量/表达式绑定
      html-generator.ts     # 模板 JSON → HTML/CSS/SVG
      pagination-engine.ts  # 表格分页、重复表头、小计/汇总
      css-builder.ts        # mm 单位布局 → CSS
      expression-eval.ts    # 表达式安全求值（safelist）
      types.ts              # 模板/请求类型（JSON 可序列化）
```

`core` 无 Vue、无宿主依赖，可在 Node 服务端（`@worm-vue3-print/render`）与浏览器端（`@worm-vue3-print/canvas`）共用，
保证「浏览器预览」与「服务端 PDF」结果一致。

## 使用

```ts
import { generateHtml, paginate, bindData } from '@worm-vue3-print/core'

const bound = bindData(templateJson, printData)
const pages = paginate(bound, measured, options)
const html = generateHtml(pages)
```

## 开发

```bash
npm run build   # tsup → dist/index.js + index.cjs + d.ts
npm test        # vitest
```