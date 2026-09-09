export default {
  id: 'faq',
  title: '常见问题',
  content: `
<h2>如何调整纸张大小？</h2>
<ol>
  <li>在右侧面板选择"页面设置"</li>
  <li>选择预设纸张（A4、A3、A5、Letter、Legal）</li>
  <li>或选择"自定义"输入宽度和高度（mm）</li>
  <li>设置方向：纵向（portrait）或横向（landscape）</li>
</ol>

<h2>如何处理分页？</h2>
<p>数据表格支持自动分页：</p>
<ol>
  <li>在表格属性中设置"每页显示行数"</li>
  <li>启用"表头重复"确保跨页时显示标题行</li>
  <li>添加小计行显示当前页汇总</li>
  <li>添加汇总行显示整表汇总</li>
</ol>

<h2>如何导入外部数据？</h2>
<p>通过组件 props 传入数据：</p>
<ul>
  <li><code>fields</code>：字段定义数组，用于字段树显示</li>
  <li><code>initialTemplate</code>：初始模板数据</li>
  <li><code>loadDefaultTemplate</code>：加载默认模板的回调函数</li>
</ul>

<h2>如何使用表达式绑定字段？</h2>
<ol>
  <li>双击元素打开表达式编辑器</li>
  <li>使用 <code>{field.path}</code> 语法绑定字段</li>
  <li>使用内置函数格式化数据（如 <code>{MONEY(price)}</code>）</li>
  <li>点击确认保存</li>
</ol>

<h2>如何调整元素层级？</h2>
<ol>
  <li>选中一个或多个元素</li>
  <li>点击工具栏的层级按钮：
    <ul>
      <li>⤒ 置顶</li>
      <li>↑ 上移一层</li>
      <li>↓ 下移一层</li>
      <li>⤓ 置底</li>
    </ul>
  </li>
</ol>
<p>或使用快捷键在图层面板中调整。</p>

<h2>如何组合多个元素？</h2>
<ol>
  <li>按住 Ctrl 逐个点击选中多个元素</li>
  <li>点击工具栏"组合"按钮，或按 <code>Ctrl + G</code></li>
  <li>组合后点击任一元素可选中整个组</li>
  <li>取消组合：选中组合后点击"取消组合"，或按 <code>Ctrl + Shift + G</code></li>
</ol>

<h2>如何使用参考线？</h2>
<ol>
  <li>在标尺区域拖拽添加参考线</li>
  <li>参考线自动参与吸附检测</li>
  <li>拖拽参考线可调整位置</li>
  <li>双击参考线可删除</li>
</ol>

<h2>如何预览打印效果？</h2>
<ol>
  <li>点击工具栏"预览"按钮</li>
  <li>预览使用同构渲染管线，确保与实际打印一致</li>
  <li>可通过"叠层对比"功能对比设计稿与截图</li>
</ol>

<h2>模板数据格式是什么？</h2>
<p>模板以 JSON 格式存储，包含：</p>
<ul>
  <li><code>paperSize</code>：纸张大小</li>
  <li><code>orientation</code>：方向</li>
  <li><code>margins</code>：页边距</li>
  <li><code>header</code>：页眉配置</li>
  <li><code>footer</code>：页脚配置</li>
  <li><code>elements</code>：元素数组</li>
  <li><code>watermark</code>：水印配置</li>
</ul>

<h2>如何调整表格列宽？</h2>
<ol>
  <li>在左侧面板的图层列表中，点击选中对应的表格元素</li>
  <li>此时画布上的表格会显示列宽分隔线</li>
  <li>拖动列宽分隔线即可调整列宽</li>
</ol>
<blockquote>
  <p><strong>注意</strong>：必须先选中表格元素，才能激活列宽拖动功能。</p>
</blockquote>

<h2>如何调整表格属性？</h2>
<ol>
  <li>确保当前没有任何单元格被选中（如有选中，点击画布空白区域取消选中）</li>
  <li>在左侧面板的图层列表中，点击选中对应的表格元素</li>
  <li>右侧面板会显示表格属性设置</li>
</ol>
<blockquote>
  <p><strong>注意</strong>：如果存在选中的单元格，右侧面板将显示单元格属性而非表格属性。</p>
</blockquote>
  `
}
