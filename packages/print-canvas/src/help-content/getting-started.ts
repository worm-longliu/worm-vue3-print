export default {
  id: 'getting-started',
  title: '快速入门',
  content: `
<h2>界面布局</h2>
<p>打印模板设计器采用三栏布局：</p>
<ul>
  <li><strong>左侧面板</strong>：字段树和图层管理，用于查看和管理画布上的元素</li>
  <li><strong>中间画布</strong>：设计区域，支持标尺、参考线、网格显示</li>
  <li><strong>右侧面板</strong>：属性设置和模板配置</li>
  <li><strong>顶部工具栏</strong>：常用操作按钮</li>
  <li><strong>底部状态栏</strong>：显示坐标、缩放比例、元素数量</li>
</ul>

<h2>添加第一个元素</h2>
<ol>
  <li>从左侧面板选择元素类型（文本、图片、条码等）</li>
  <li>拖拽到画布上松开</li>
  <li>选中元素后，通过拖拽调整位置</li>
  <li>拖拽元素边角手柄调整大小</li>
</ol>

<h2>数据绑定基础</h2>
<p>使用花括号 <code>{field.path}</code> 语法绑定数据字段：</p>
<pre><code>供应商：{supplier.name}
日期：{order.date}
金额：{MONEY(order.total)}</code></pre>
<p>双击元素可打开表达式编辑器配置绑定。</p>

<h2>保存与预览</h2>
<ul>
  <li>点击工具栏"保存"按钮，模板以 JSON 格式导出</li>
  <li>点击"预览"按钮查看打印效果</li>
  <li>模板数据包含页面设置、元素定义、样式配置</li>
</ul>

<h2>关于项目</h2>
<p><strong>项目名称：</strong>worm-vue3-print</p>
<p><strong>仓库地址：</strong><a href="https://gitee.com/liulong_oschina/worm-vue3-print" target="_blank" rel="noopener noreferrer">https://gitee.com/liulong_oschina/worm-vue3-print</a></p>
<p>基于 Vue 3 的可视化打印模板设计器，支持拖拽式模板编辑、表达式数据绑定和浏览器端打印预览。</p>
  `
}
