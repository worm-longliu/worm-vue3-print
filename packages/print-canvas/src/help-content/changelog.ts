export default {
  id: 'changelog',
  title: '更新记录',
  content: `
<h2>v1.2.2 <small>2026-09-11</small></h2>

<h3>变更</h3>
<ul>
  <li><code>@worm-vue3-print/core</code> 新增子路径 <code>/designer</code>：框架无关的设计器内核，包含完整模板模型类型、通用工具（元素工厂、表格矩阵、单位换算、模板迁移、标尺等）与纯交互逻辑（对齐、分组、键盘、缩放、吸附计算），不依赖 Vue/React。</li>
  <li><code>@worm-vue3-print/core</code> 新增子路径 <code>/browser</code>：浏览器侧渲染适配器（<code>renderHtmlPages</code> 两遍分页渲染、条形码/二维码渲染器）。</li>
  <li>设计器模型、工具与纯逻辑下沉至 core 子路径，canvas 仅保留 Vue 适配层；公共 API 保持不变，core 主入口仍为零运行时依赖，为后续多框架适配打下基础。</li>
</ul>

<h3>修复</h3>
<ul>
  <li>修复工具栏放大/缩小按钮直接线性改缩放比例、未做滚动锚点校正导致画面漂移的问题；按钮缩放改为与 Ctrl+滚轮一致的乘性步进，并以视口中心为锚点（与「适应窗口」同一缩放管线）。</li>
</ul>

<h2>v1.2.1 <small>2026-09-11</small></h2>

<h3>变更</h3>
<ul>
  <li>工具栏编辑区/层级区/视图区图标按钮统一使用 data-tip 自定义悬浮提示，补齐「网格」「吸附」缺失提示；提升提示层级，不再被画布顶部标尺遮挡。</li>
  <li>优化「适应窗口」：以视口中心为锚点一步缩放到位（与 Ctrl+滚轮同一缩放换算管线），缩放平滑过渡；允许低于交互缩放下限（最小可至 5%），超大纸张也能整版容纳，纸张在画布视口内水平垂直居中。</li>
  <li>新增 <code>showHelp</code> 配置：控制帮助入口（帮助按钮与帮助弹框）显示，默认开启，传入 <code>false</code> 即可隐藏。</li>
</ul>

<h3>修复</h3>
<ul>
  <li>工具栏悬浮提示气泡被画布顶部固定标尺遮挡无法显示。</li>
  <li>「适应窗口」后超大纸张仍残留滚动条、纸张未在画布视口居中（垂直偏上）。</li>
</ul>

<h3>文档</h3>
<ul>
  <li>新增打印设计工作台布局线框图文档（<code>docs/中文/打印设计工作台-布局线框图.md</code>），标注各区域名称、功能与对应组件文件。</li>
</ul>

<h2>v1.2.0 <small>2026-09-10</small></h2>

<h3>新增</h3>
<ul>
  <li>帮助文档模态框（HelpModal）：内置功能介绍、快捷键一览、常见问题与更新记录，按 Esc 或点击遮罩关闭。</li>
  <li>标尺参考线增强：支持从标尺拖拽添加参考线、双击编辑、删除，参考线对齐吸附实时显示。</li>
  <li>表格列宽拖拽新增末列右边界手柄：可直接拖拽末列右边界调整末列宽，受打印范围宽度与最小列宽 5mm 钳制。</li>
</ul>

<h3>变更</h3>
<ul>
  <li>优化缩放逻辑：取消放大上限，支持滚轮乘性步进缩放，修复缩放锚点漂移问题。</li>
  <li>移除设计态元素左上角的 fx 绑定标签提示，简化元素视觉呈现。</li>
</ul>

<h3>文档</h3>
<ul>
  <li>仓库根目录新增 <code>AGENTS.md</code>：AI 代理行为规范，明确代理在本仓库工作时的语言、专家态度、协作约定等强制要求。</li>
  <li>新增 <code>worm-vue3-print</code> 集成支持 skill：包含安装指南、集成 API、故障排查等参考文档。</li>
</ul>

<h3>修复</h3>
<ul>
  <li>表格列宽拖拽存在的多个缺陷：
    <ul>
      <li>内部列边界向左拖时左列宽度不变，导致边界线不跟随光标。</li>
      <li>px → mm 单位换算缺失，拖拽距离存在约 3.78 倍偏差。</li>
      <li><code>table-layout: fixed</code> 下拖拽过程中表格 CSS <code>width(100%)</code> 与列宽和失配，导致浏览器按比例拉伸列，使边界线与右侧内容偏离光标。</li>
      <li>删除 <code>onColResizeStart</code> 中残留的 <code>document.title</code> 调试代码。</li>
    </ul>
  </li>
</ul>

<h2>v1.1.0 <small>2026-09-06</small></h2>

<h3>新增</h3>
<ul>
  <li>表格元素支持列宽拖拽：设计态选中表格后，在列边界悬停并拖动即可调整该列宽（左侧列），实时更新画布与元素尺寸；受打印范围宽度与最小列宽 5mm 钳制，拖拽结束后计入一次撤销历史。属性面板的列宽数值输入保留作为精确输入兜底。</li>
  <li>表格单元格支持图片类型：单元格可切换为图片类型，设计态支持选择图片与设置 fit/maxWidth/maxHeight，预览与打印输出完整渲染。</li>
  <li>条形码与二维码单元格支持 fit/maxWidth/maxHeight 属性。</li>
  <li>属性面板位置尺寸改用 StepperInput 控件：支持按钮微调数值；StepperInput 支持可选值列表和小数步进。</li>
  <li>新增统一颜色选择器并重构属性面板字段分组。</li>
  <li>支持页面（纸张）背景色 <code>pageBackground</code>，预览与打印/PDF 输出一致。</li>
  <li>支持 canvas 库模式构建与 npm 发布。</li>
</ul>

<h3>修复</h3>
<ul>
  <li>打印/导出 PDF 保留元素背景色（<code>print-color-adjust: exact</code>）。</li>
  <li>打印预览保留元素重叠，表格下方跟随元素按设计坐标绝对定位并透传层级 z-index。</li>
  <li>打印页眉页脚区域贴页面底部，修复页边距失效。</li>
  <li>条形码渲染缺少 <code>object-fit: contain</code>。</li>
  <li>修复 canvas 测试在 vitest v4 + happy-dom 环境下 <code>localStorage</code> 未定义的问题，补充 mock 以兼容测试环境。</li>
</ul>

<h2>v1.0.0 <small>2026-09-02</small></h2>

<h3>新增</h3>
<ul>
  <li>首次开源发布。</li>
  <li><code>@worm-vue3-print/core</code>：模板表达式引擎与同构渲染管线（HTML 生成 / 分页 / 数据绑定）。</li>
  <li><code>@worm-vue3-print/canvas</code>：Vue 3 可视化打印模板设计器画布。</li>
  <li>渲染微服务拆分为独立仓库 <code>worm-vue3-print-render</code>（仅 Docker 部署，不上 npm）。</li>
</ul>

<blockquote>
  <p>完整更新记录请查阅仓库 <code>docs/中文/CHANGELOG.md</code> 与 <code>docs/en/CHANGELOG.en.md</code>。</p>
</blockquote>
  `
}
