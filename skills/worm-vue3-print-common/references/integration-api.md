# Custom Element 接入 API

## 最小接入

```js
import { registerAll } from '@worm-vue3-print/common'

registerAll()
const el = document.querySelector('print-designer')
el.fields = fields
el.template = templateJson
el.uploadImage = async file => uploadToServer(file)
el.addEventListener('save', event => persist(JSON.parse(event.detail)))
```

```css
.designer-host, .designer-host print-designer {
  display: block;
  width: 100%;
  height: 100%;
}
```

修改字段、切换示例、导入或清空模板后，显式再次给 property 赋值；不要监听 element 自身猜测注入时机。`fields` 只有 setter，读回使用宿主持有的数据或 `el.store.fields`。

## 常用 property / attribute

- `template`：对象赋 property；getter 返回当前画布 JSON 字符串。
- `fields`：业务字段数组。
- `fonts`：模板字体声明数组。
- `uploadImage`、`uploadDesignBackground`：宿主上传函数。
- `is-edit="true"`、`show-help="true"`：字符串开关。

## 事件

- `save` / `preview`：`event.detail` 是模板 JSON 字符串。
- `dblclick-element`：`event.detail` 是元素 id 字符串，不要 `JSON.parse`。
- `dblclick-cell`：`event.detail` 是 `{ elementId, r, c, cellId }` 对象。

事件处理器销毁前必须解绑。React StrictMode 开发环境会重复执行 effect 清理与挂载，漏解绑会造成重复保存。

## 方法

- `getTemplateJson(): string`：读取完整模板，包含宿主注入的字体声明。
- `validateTemplate()`：返回拼版问题数组，合法为 `[]`。

`getTemplateJson()` 是保存按钮之外的旁路。导出、另存、打印或 MCP 写回涉及拼版时，宿主必须先调用 `validateTemplate()`；它不代表完整 MCP 契约校验。
