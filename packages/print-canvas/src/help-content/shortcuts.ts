export default {
  id: 'shortcuts',
  title: '快捷键',
  content: `
<h2>常用操作</h2>
<table>
  <thead>
    <tr><th>快捷键</th><th>功能</th></tr>
  </thead>
  <tbody>
    <tr><td><code>Ctrl + C</code></td><td>复制选中元素</td></tr>
    <tr><td><code>Ctrl + V</code></td><td>粘贴元素（偏移 10mm）</td></tr>
    <tr><td><code>Ctrl + D</code></td><td>原地复制（偏移 5mm, 5mm）</td></tr>
    <tr><td><code>Ctrl + A</code></td><td>全选元素</td></tr>
    <tr><td><code>Delete / Backspace</code></td><td>删除选中元素</td></tr>
    <tr><td><code>Ctrl + Z</code></td><td>撤销</td></tr>
    <tr><td><code>Ctrl + Shift + Z</code> / <code>Ctrl + Y</code></td><td>重做</td></tr>
  </tbody>
</table>

<h2>元素移动</h2>
<table>
  <thead>
    <tr><th>快捷键</th><th>功能</th></tr>
  </thead>
  <tbody>
    <tr><td><code>方向键</code></td><td>移动 1mm</td></tr>
    <tr><td><code>Shift + 方向键</code></td><td>移动 10mm</td></tr>
    <tr><td><code>Ctrl + 方向键</code></td><td>移动 0.5mm</td></tr>
  </tbody>
</table>

<h2>缩放控制</h2>
<table>
  <thead>
    <tr><th>快捷键</th><th>功能</th></tr>
  </thead>
  <tbody>
    <tr><td><code>Ctrl + 1</code></td><td>重置缩放至 100%</td></tr>
    <tr><td><code>Ctrl + 0</code></td><td>适应窗口</td></tr>
  </tbody>
</table>

<h2>对齐操作（多选时）</h2>
<table>
  <thead>
    <tr><th>快捷键</th><th>功能</th></tr>
  </thead>
  <tbody>
    <tr><td><code>Ctrl + L</code></td><td>左对齐</td></tr>
    <tr><td><code>Ctrl + R</code></td><td>右对齐</td></tr>
    <tr><td><code>Ctrl + E</code></td><td>水平居中</td></tr>
    <tr><td><code>Ctrl + T</code></td><td>顶对齐</td></tr>
    <tr><td><code>Ctrl + B</code></td><td>底对齐</td></tr>
  </tbody>
</table>

<h2>组合操作</h2>
<table>
  <thead>
    <tr><th>快捷键</th><th>功能</th></tr>
  </thead>
  <tbody>
    <tr><td><code>Ctrl + G</code></td><td>组合选中元素</td></tr>
    <tr><td><code>Ctrl + Shift + G</code></td><td>取消组合</td></tr>
  </tbody>
</table>

<blockquote>
  <p><strong>注意</strong>：当焦点在输入框、文本框、下拉框内时，快捷键不生效。</p>
</blockquote>
  `
}
