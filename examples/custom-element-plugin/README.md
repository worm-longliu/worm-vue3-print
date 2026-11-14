# 最小自定义元素插件脚手架（signature）

一个**可复制即用的最小插件**：给设计器增加 `signature` 元素，带专属属性、`$data` 绑定、
进程内 SVG 出图、`自定义属性` tab，以及服务端 `/node` 注册入口。
本目录是示例，不参与仓库 workspace 构建；复制到自己的包里后按注释改 id / 包名即可。

## 文件与职责

| 文件 | 作用 |
| --- | --- |
| `plugin.ts` | 唯一知识来源：`defineElementPlugin` 描述符（kind / optionMeta / binding / render） |
| `type-augmentation.ts` | `declare module` 声明合并 + 编译期自校验，让宿主 TS 认识新类型与专属属性 |
| `index.ts` | 浏览器 / 设计器入口：import 即注册，附带画布组件与属性 tab |
| `node.ts` | 服务端 / Electron 主进程入口：只注册纯 TS 描述符，不引入 Vue |

## 宿主接入（三步）

```ts
// ① 设计器宿主入口：一行副作用 import
import '@acme/print-signature'

// ② 服务端 PDF / Electron 主进程：显式部署白名单（安全等价，模板字符串无法触发 import）
import '@acme/print-signature/node'

// ③ 服务端 runtime：按注册表自动收集扩展元素执行器，新增插件无需改装配代码
import { collectExecutorBundles, createDomHostRuntime } from '@worm-vue3-print/core'
createDomHostRuntime(factory, loadExecutorBundle(), undefined, collectExecutorBundles())
```

浏览器预览 / 打印**不需要**任何 renderer 传参：打印管线按注册态自动收集 `renderers`。
历史模板不需要加 `plugins` 顶层清单（legacy 宽松模式），只有想启用严格校验时才声明。

## 契约要点

- 描述符注册在 `globalThis[Symbol.for('worm-vue3-print.element-plugin-registry.v1')]`，
  因此「core 被打包成两份」也不会出现「注册在这份、查表在那份」。
- `binding.bind(options, data)` 返回的是**运行时补丁**，只改内存里的选项，不落模板 JSON。
- `render.createRenderer()` 走进程内 SSR（推荐）；只有页面执行器的插件才提供
  `render.executorBundle()`，并在 `legacyAliases` 登记「执行器旧方法名 → `renderAssets`」。
- `designer.propertyTab.hasProperties(element)` 是实例级判据：内置元素和没有专属属性的
  实例不会显示「自定义属性」tab；判据抛错按「无属性」处理，绝不打断设计器。
- 顶层 `plugins` 清单一旦声明就进入 strict 校验：缺插件报 `MISSING_PLUGIN`、
  版本不符报 `PLUGIN_VERSION_MISMATCH`。

完整分步教程、契约签名表与常见坑见 `docs/中文/指南/自定义元素插件开发.md`。
