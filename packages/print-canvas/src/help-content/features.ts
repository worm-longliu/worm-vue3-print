export default {
  id: 'features',
  title: '功能说明',
  content: `
<h2>元素类型</h2>
<table>
  <thead>
    <tr><th>类型</th><th>说明</th></tr>
  </thead>
  <tbody>
    <tr><td>文本</td><td>静态或动态文本，支持表达式绑定</td></tr>
    <tr><td>长文本</td><td>多行文本，支持自动换行</td></tr>
    <tr><td>数据表格</td><td>动态行列，支持分页、表头重复、序号/小计/汇总</td></tr>
    <tr><td>条形码</td><td>支持 code128 等多种码制</td></tr>
    <tr><td>二维码</td><td>支持 L/M/Q/H 纠错级别</td></tr>
    <tr><td>图片</td><td>静态或动态图片</td></tr>
    <tr><td>线条</td><td>水平线或垂直线</td></tr>
    <tr><td>形状</td><td>矩形、椭圆，支持边框和背景色</td></tr>
    <tr><td>HTML</td><td>自定义 HTML 内容</td></tr>
    <tr><td>页码</td><td>自动页码显示</td></tr>
  </tbody>
</table>

<h2>表达式编辑器</h2>
<h3>基础语法</h3>
<p>使用花括号 <code>{}</code> 包裹表达式，花括号外为字面文本。</p>

<h3>内置函数</h3>
<table>
  <thead>
    <tr><th>函数</th><th>说明</th><th>示例</th></tr>
  </thead>
  <tbody>
    <tr><td><code>MONEY(value)</code></td><td>金额格式化（千分位+两位小数）</td><td><code>{MONEY(order.total)}</code> -> "69,543.75"</td></tr>
    <tr><td><code>DATE(value, format)</code></td><td>日期格式化</td><td><code>{DATE(order.date, 'YYYY-MM-DD')}</code></td></tr>
    <tr><td><code>UPPER(value)</code></td><td>数字转大写金额</td><td><code>{UPPER(order.total)}</code> -> "陆万玖仟伍佰肆拾叁元柒角伍分"</td></tr>
    <tr><td><code>IF(cond, true, false)</code></td><td>条件判断</td><td><code>{IF(qty > 100, '大量', '少量')}</code></td></tr>
    <tr><td><code>CONCAT(str1, str2, ...)</code></td><td>字符串拼接</td><td><code>{CONCAT(name, '-', spec)}</code></td></tr>
    <tr><td><code>IFEMPTY(value, default)</code></td><td>空值默认</td><td><code>{IFEMPTY(remark, '无')}</code></td></tr>
    <tr><td><code>ROUND(num, decimals)</code></td><td>四舍五入</td><td><code>{ROUND(price, 2)}</code></td></tr>
    <tr><td><code>NOW()</code></td><td>当前日期</td><td><code>{NOW()}</code></td></tr>
    <tr><td><code>SUBSTR(str, start, len)</code></td><td>子字符串</td><td><code>{SUBSTR(name, 0, 3)}</code></td></tr>
    <tr><td><code>LEN(str)</code></td><td>字符串长度</td><td><code>{LEN(name)}</code></td></tr>
    <tr><td><code>PAD(value, len, char)</code></td><td>左侧补位</td><td><code>{PAD(qty, 5, '0')}</code></td></tr>
  </tbody>
</table>

<h3>聚合函数（表格小计/汇总行使用）</h3>
<table>
  <thead>
    <tr><th>函数</th><th>说明</th></tr>
  </thead>
  <tbody>
    <tr><td><code>SUM(field)</code></td><td>求和</td></tr>
    <tr><td><code>AVG(field)</code></td><td>平均值</td></tr>
    <tr><td><code>COUNT(field)</code></td><td>计数</td></tr>
    <tr><td><code>MIN(field)</code></td><td>最小值</td></tr>
    <tr><td><code>MAX(field)</code></td><td>最大值</td></tr>
  </tbody>
</table>

<h3>系统变量</h3>
<table>
  <thead>
    <tr><th>变量</th><th>说明</th></tr>
  </thead>
  <tbody>
    <tr><td><code>pageIndex</code></td><td>当前页码</td></tr>
    <tr><td><code>totalPages</code></td><td>总页数</td></tr>
    <tr><td><code>printDate</code></td><td>打印日期 (YYYY-MM-DD)</td></tr>
    <tr><td><code>printTime</code></td><td>打印时间戳</td></tr>
  </tbody>
</table>

<h2>数据表格配置</h2>
<h3>行类型</h3>
<ul>
  <li><strong>标题行 (header)</strong>：可设置每页重复显示</li>
  <li><strong>数据行 (data)</strong>：绑定列表数据源迭代显示</li>
  <li><strong>小计行 (subtotal)</strong>：当前页末尾显示汇总</li>
  <li><strong>汇总行 (summary)</strong>：仅最后一页显示</li>
</ul>

<h3>表格操作</h3>
<ul>
  <li>右键菜单支持插入/删除行和列</li>
  <li>支持单元格合并/拆分</li>
  <li>支持边框预设：全部/外边框/内边框/无</li>
  <li>无边框表格设计态显示虚拟虚线</li>
  <li><strong>调整列宽</strong>：需要先在左侧面板的图层中选中对应的表格元素，然后才能在画布上拖动列宽分隔线</li>
  <li><strong>调整表格属性</strong>：必须确保当前没有任何单元格被选中。如有选中的单元格，先点击画布空白区域取消选中，再在图层中选择表格元素</li>
  <li><strong>单元格图片处理</strong>：若单元格中图片无法缩小，请将图片处理方式设置为"缩小保持比例"</li>
</ul>

<h2>对齐与吸附</h2>
<h3>自动对齐</h3>
<p>拖拽元素时自动显示对齐引导线：</p>
<ul>
  <li>蓝色：左/顶对齐</li>
  <li>绿色：居中对齐</li>
  <li>橙色：右/底对齐</li>
</ul>

<h3>网格吸附</h3>
<p>开启吸附功能后，元素自动吸附到网格点。</p>

<h3>手动参考线</h3>
<p>通过标尺区域拖拽添加参考线，参考线参与吸附检测。</p>

<h2>图层管理</h2>
<ul>
  <li>调整元素显示顺序（置顶/置底/上移/下移）</li>
  <li>显示/隐藏元素</li>
  <li>锁定/解锁元素（锁定后不可编辑）</li>
</ul>

<h2>三区布局</h2>
<p>页面分为三个区域：</p>
<ul>
  <li><strong>页眉 (header)</strong>：顶部区域</li>
  <li><strong>内容区 (content)</strong>：主体区域</li>
  <li><strong>页脚 (footer)</strong>：底部区域</li>
</ul>
<p>页眉/页脚支持的元素类型：文本、图片、线条、形状、条形码、二维码</p>

<h2>水印配置</h2>
<ul>
  <li>支持固定文本或绑定字段</li>
  <li>可设置旋转角度和透明度</li>
  <li>支持显示打印时间戳</li>
</ul>
  `
}
