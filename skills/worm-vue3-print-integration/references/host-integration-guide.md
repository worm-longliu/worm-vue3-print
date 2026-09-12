# 全栈宿主集成指南

面向「Vue 3 前端 + 任意后端」的完整接入方案。设计器库只提供画布与渲染组件，**所有业务后端（模板存储、字段元数据、业务数据组装、PDF 代理）都由宿主实现**。本指南给出最小集合与可直接套用的骨架，模式提炼自一个真实生产宿主（Spring Boot + Vue 3 + Element Plus + 独立 Node 渲染服务）。

## 1. 整体架构与两条链路

```
                         ┌─────────────── 宿主后端（自建）───────────────┐
模板管理/设计器页面 ──► 模板 CRUD、设计器初始化(模板+字段树+示例数据)
业务页面「打印」按钮 ──► 渲染数据端点：取模板 elements + 按单据组装 printData
                         └───────────┬───────────────────────────┬─────┘
                                     │ 链路 A                     │ 链路 B
                  {templateJson,     ▼                            ▼
                   printData,baseUrl}              代理 POST /render/pdf（注入 X-Render-Key）
                          │                                                │
            PrintHtmlPreview（浏览器）                       print-render 微服务
            同构渲染/分页 → print()                            Playwright 两遍渲染 → PDF
```

- 链路 A（浏览器打印）：后端只返回数据包，前端 `PrintHtmlPreview` 渲染并调浏览器打印。零额外基础设施。
- 链路 B（服务端 PDF）：后端把同一数据包转发给 `print-render` 微服务，拿回 PDF 字节流。用于电子存档、下载、批量。需要部署微服务，见 [服务端渲染](server-render.md)。
- 两者可并存：预览弹窗里「打印」走 A，「下载 PDF」按需走 B。

## 2. 数据库：模板表（必须自建）

模板 JSON（elements）与宿主元信息分开存储。最小字段设计（类型以 PostgreSQL 表述，MySQL 等价改写）：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | BIGINT | 是 | 主键，宿主主键策略自定（应用层生成或自增） |
| `name` | VARCHAR(200) | 是 | 模板名称（宿主元信息） |
| `business_type` | VARCHAR(100) | 是 | 业务类型标识，如 `order_info`；模板与业务单据、字段树之间的关联键，需有枚举/字典约束 |
| `elements` | TEXT | 是 | 设计器 `getTemplateJson()` 序列化结果；存 JSON 字符串，**不要拆表、不要二次结构化** |
| `paper_config` | TEXT | 否 | 纸张配置 JSON；elements 中已含 paperSize 时可省 |
| `remark` | VARCHAR(500) | 否 | 备注 |
| `is_default` | BOOLEAN | 是 | 是否该业务类型的默认模板，默认 false |
| `tenant_id` | BIGINT | 否 | 多租户才需要 |
| `deleted` | BOOLEAN | 是 | 逻辑删除标记，默认 false |
| `create_time` / `update_time` | TIMESTAMP | 是 | 审计时间 |

约束：同一业务类型（多租户再加租户维度）仅允许一个默认模板，用部分唯一索引或应用层事务保证。

要点：

- 新建模板时 `elements` 不要留空：用前端 `createDefaultTemplate()` 序列化后写入，保证未进设计器也能渲染。

字段元数据是否建表可选（见第 4 节）。

## 3. 后端需要提供的功能（路由/风格不限）

不规定具体 API 设计，宿主按自己的框架与命名风格实现即可。后端需要覆盖以下功能：

**模板管理**

- 模板分页列表：支持按名称、业务类型筛选；列表可只返回元信息，不带 elements（避免大 JSON）。
- 新建模板：保存元信息 + 初始 elements（由前端 `createDefaultTemplate()` 序列化提交）；业务类型的首个模板可自动设为默认。
- 更新模板：设计器保存时通常只提交 `{id, elements}`；元信息（名称、备注、默认标记）的修改走同一功能即可。
- 模板详情：按 id 返回含 elements 的完整模板，供编辑回填。
- 删除模板：逻辑删除；删除默认模板时把同业务类型的其他模板提升为默认。
- 业务类型字典：提供类型下拉数据。
- 默认模板查询与设置：按业务类型取默认模板、手动指定默认模板。
- 设计器初始化聚合：设计器页一次请求拿齐三份数据——模板详情、字段树、可选的示例打印数据，避免前端串行发三个请求。

聚合功能返回的三份数据形态（字段名示意，契约需要保持）：

```json
{
  "template": { "id": "...", "name": "...", "businessType": "order_info", "elements": "{...JSON字符串...}", "remark": "" },
  "fields": [ { "fieldKey": "order.no", "fieldLabel": "单号", "fieldType": "string", "sortOrder": 1 } ],
  "printData": [ { "order": { "no": "SO-001" }, "goods": [ ] } ]
}
```

`printData` 可为空数组（前端预览时回退 `DEFAULT_DEMO_DATA`），建议返回一份与字段树匹配的示例数据。

**渲染数据组装（链路 A 核心功能）**

- 按「模板 id + 业务单据 id」产出渲染数据包：取 elements 并 `JSON.parse` 成对象作为 `templateJson`，按业务单据组装 `printData`，需要时给 `baseUrl`（把模板中的相对路径图片拼成渲染环境可访问的绝对地址）。
- `printData` 兼容单对象与对象数组（数组用于一次打印多份/批量，每份独立分页）。
- 返回数据包形态：`{templateJson: Object, printData: Object|Object[], baseUrl?: string}`。

**链路 B 额外功能（需要服务端 PDF 时）**

- PDF/截图代理：入参与渲染数据功能一致，组装好数据包后转发 `print-render` 微服务并注入 `X-Render-Key`，原样返回 `application/pdf` / `image/png` 字节流；需支持设计器免保存场景（前端直接给 `templateJson`，后端配 demo 数据透传）。对接细节见 [服务端渲染](server-render.md)。

## 4. 业务字段元数据（fields）的三种来源

设计器左侧字段树需要 `PrintBusinessField[]`，这是宿主责任，三种实现方式任选：

1. **前端常量**：业务类型少、字段稳定时最简单，直接在前端维护数组。
2. **配置表**：建 `sys_print_business_field(business_type, field_key, field_label, field_type, sort_order)`，提供管理界面。
3. **注解反射（推荐，多业务类型）**：在打印数据 VO 上标注解，后端反射生成字段树，保证「字段定义」与「实际打印数据结构」永远一致。

注解反射模式（以 Java 为例，其他语言用反射/装饰器等价实现）：

```java
// 打印数据视图类：字段结构即 printData 结构
public class OrderPrintVO {
    @PrintField(label = "单号", order = 1)
    private String orderNo;                    // → fieldKey "orderNo"

    @PrintField(label = "开单时间", type = "date", order = 2, pattern = "yyyy-MM-dd HH:mm")
    private LocalDateTime createTime;

    @PrintField(label = "商品明细", type = "list", order = 10)
    private List<Goods> goods;                 // type="list" 标记表格数据源，反射递归展开 Goods

    public static class Goods {
        @PrintField(label = "商品名称", order = 1)
        private String name;                   // → fieldKey "goods.name"
        @PrintField(label = "数量", type = "number", order = 2)
        private BigDecimal qty;
    }
}
```

反射规则：递归收集带注解字段，嵌套对象用 `前缀.字段名` 拼路径，`type="list"` 取集合泛型元素类继续递归，结果按 `order` 升序。新增一个业务类型 = 新增枚举值 + 一个 VO + 一个「枚举↔VO」绑定，无需手写字段数组。

## 5. 前端五个必备片段

### 5.1 新建/编辑模板弹窗（元信息 + 初始 elements）

```vue
<script setup lang="ts">
import { createDefaultTemplate } from '@worm-vue3-print/canvas'
// 提交新建时：elements 必须给默认可渲染 JSON，不要留空
const payload = {
  name: form.name,
  businessType: form.businessType,
  remark: form.remark,
  elements: JSON.stringify(createDefaultTemplate()),
}
await saveTemplate(payload)
</script>
```

### 5.2 设计器页（正确接线示例）

```vue
<template>
  <PrintDesigner
    ref="designerRef"
    :initial-template="templateData"
    :fields="fields"
    :is-edit="!!templateId"
    @save="handleSave"
    @preview="handlePreview"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { PrintDesigner, createDefaultTemplate, DEFAULT_DEMO_DATA } from '@worm-vue3-print/canvas'
import type { PrintBusinessField, TemplateData } from '@worm-vue3-print/canvas'
import '@worm-vue3-print/canvas/style.css'
import { updateTemplate, getDesignerData } from '@/api/print'

const route = useRoute()
const templateId = String(route.params.id || '')
const designerRef = ref<InstanceType<typeof PrintDesigner>>()
const templateData = ref<TemplateData>(createDefaultTemplate())
const fields = ref<PrintBusinessField[]>([])
const printData = ref<Record<string, any>[]>([])

async function handleSave(json: string) {
  if (!templateId) return // 元信息（名称/类型）应先在弹窗创建落库，设计器只更新 elements
  await updateTemplate({ id: templateId, elements: json })
}

function handlePreview() {
  // 取当前画布 JSON，配合 printData 或 DEFAULT_DEMO_DATA 打开预览弹窗
  const json = designerRef.value?.getTemplateJson()
  // → 打开你的预览弹窗（见 5.4）
}

onMounted(async () => {
  if (!templateId) return
  const res = await getDesignerData(templateId)
  const json = JSON.parse(res.data.template.elements || '{}')
  if (json.paperSize) templateData.value = json   // 仅在是有效模板时覆盖默认值
  fields.value = res.data.fields
  printData.value = res.data.printData ?? []
  // 模板名称/类型等元信息显示在宿主自己的 header，不写进设计器实例
})
</script>
```

注意：
- 设计器页父容器必须有确定高度（`PrintDesigner` 内部 `height:100%`），否则画布塌陷。
- **不要**调用 `setTemplateMeta`——该方法不存在。元信息用宿主页面自己的标签/弹窗展示与编辑。
- 图片上传、服务端截图、默认布局按钮是可选能力，需要时才注入 `upload-image` / `request-screenshot` / `load-default-template`；不注入时对应功能隐藏，基础设计/保存/预览不受影响。

### 5.3 业务打印按钮（选模板 → 取数 → 预览）

```vue
<script setup lang="ts">
// 入参：业务类型 + 业务单据 id
const props = defineProps<{ businessType: string; orderId?: string }>()

async function handlePrint() {
  // 1. 查该业务类型的模板；唯一且默认则直接打印，否则弹窗让用户选
  const tplRes = await pageTemplate({ businessType: props.businessType, current: 1, size: 100 })
  const templates = tplRes.data.records
  const templateId = await pickTemplate(templates)   // 宿主选择交互
  // 2. 取渲染数据包（链路 A）
  const res = await renderData({ templateId, businessType: props.businessType, orderId: props.orderId })
  previewState.value = res.data                      // {templateJson, printData, baseUrl}
  // 3. 打开预览弹窗；pdfDownloader 传了才显示「下载 PDF」（链路 B）
}
</script>
```

### 5.4 预览弹窗

组件契约见 [接入 API](integration-api.md) 的 `PrintHtmlPreview`。宿主外壳负责全屏 Teleport 容器、「打印」按钮（调 `previewRef.print()`）、可选「下载 PDF」按钮（调链路 B 端点拿 Blob 后 `a.download`）。容器 z-index 需高于 UI 库弹层（Element Plus 是 2000+，取 3000）。

### 5.5 图片上传适配器（可选）

设计器图片元素要上传图片时，实现 `upload-image: (file: File) => Promise<string>`，返回可直接访问的 URL；复用宿主现有上传接口即可。服务端渲染时该 URL（或模板里的相对路径 + `baseUrl`）必须能被渲染微服务访问到。

## 6. printData 组装规则（后端最易错处）

- printData 的结构必须与字段树 `fieldKey` 严格对应：`fieldKey` 是 printData 中的完整取值路径。
  - `orderNo` → `printData.orderNo`；`goods.name` → `printData.goods[i].name`。
- 明细表格：`fieldType:'list'` 的字段（如 `goods`）在 printData 中必须是**数组**；模板表格行的 `dataSource` 指向该字段名；明细列表达式写完整路径 `{goods.name}`。
- 无点且作为其他字段前缀的字段记录（如 `goods` 与 `goods.name`）用于字段树分组，需一并返回。
- 图片字段给可访问 URL；相对路径配合 `baseUrl`。
- 一次打印多份：传对象数组，每份独立分页。

## 7. 落地顺序建议

1. 建模板表 + 模板 CRUD + 业务类型字典；前端做列表页与新建弹窗（先用 `createDefaultTemplate`）。
2. 做设计器页，跑通「新建 → 进设计器 → 保存 elements → 重新进入回填」。
3. fields 先用前端常量跑通字段树，再接后端（推荐注解反射）。
4. 做渲染数据组装功能 + 业务打印按钮 + 预览弹窗，用一份真实单据数据跑通链路 A。
5. 需要电子存档 PDF 时，部署 `print-render` 并在后端加链路 B 的 PDF/截图代理功能与「下载 PDF」按钮。
