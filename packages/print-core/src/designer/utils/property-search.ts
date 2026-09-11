/** 属性面板搜索注册表：分组 → 表单项 → 关键词 */
export interface PropertyItem {
  key: string
  keywords: string[]
}

export interface PropertyGroupDef {
  group: string
  groupLabel: string
  items: PropertyItem[]
}

export const PROPERTY_REGISTRY: PropertyGroupDef[] = [
  {
    group: 'position-size',
    groupLabel: '位置与尺寸',
    items: [
      { key: 'ps-left', keywords: ['X', '横坐标', 'left', '位置'] },
      { key: 'ps-top', keywords: ['Y', '纵坐标', 'top', '位置'] },
      { key: 'ps-width', keywords: ['W', '宽度', 'width', '尺寸'] },
      { key: 'ps-height', keywords: ['H', '高度', 'height', '尺寸'] },
    ],
  },
  {
    group: 'appearance',
    groupLabel: '外观',
    items: [
      { key: 'ap-font-size', keywords: ['字体大小', 'fontsize', '字号'] },
      { key: 'ap-font-weight', keywords: ['字体粗细', '粗体', 'bold'] },
      { key: 'ap-align', keywords: ['对齐', 'align'] },
      { key: 'ap-vertical-align', keywords: ['垂直对齐', 'verticalalign', '顶对齐', '底对齐'] },
      { key: 'ap-color', keywords: ['颜色', 'color'] },
      { key: 'ap-bg-color', keywords: ['背景色', 'background'] },
      { key: 'ap-line-height', keywords: ['行高', 'lineheight'] },
      { key: 'ap-letter-spacing', keywords: ['字间距', 'letterspacing'] },
    ],
  },
  {
    group: 'content',
    groupLabel: '内容',
    items: [
      { key: 'ct-title', keywords: ['内容', '文本', 'title'] },
      { key: 'ct-formatter', keywords: ['格式化', '表达式', 'formatter'] },
      { key: 'ct-table-mode', keywords: ['数据模式', '静态布局', '动态数据'] },
      { key: 'ct-table-source', keywords: ['数据源', '列表字段'] },
      { key: 'ct-table-font', keywords: ['默认字号', '默认颜色', '默认内边距'] },
      { key: 'ct-table-cols', keywords: ['列宽', '表格列'] },
    ],
  },
  {
    group: 'border-bg',
    groupLabel: '边框与背景',
    items: [
      { key: 'bb-border-width', keywords: ['边框宽度', 'border'] },
      { key: 'bb-border-color', keywords: ['边框颜色'] },
      { key: 'bb-bg-color', keywords: ['背景色', 'background'] },
    ],
  },
  {
    group: 'binding',
    groupLabel: '字段绑定',
    items: [
      { key: 'bd-formatter', keywords: ['格式化', '表达式', 'formatter', 'fx', '字段', '绑定', 'field'] },
      { key: 'bd-content', keywords: ['内容', '表达式', '文本', '变量'] },
    ],
  },
  {
    group: 'pagination',
    groupLabel: '分页',
    items: [
      { key: 'pg-enabled', keywords: ['分页', 'pagination', '启用分页'] },
      { key: 'pg-pageable', keywords: ['参与分页', 'pageable'] },
      { key: 'pg-keep-with-next', keywords: ['同页', 'keepWithNext'] },
    ],
  },
  {
    group: 'advanced',
    groupLabel: '高级',
    items: [
      { key: 'ad-locked', keywords: ['锁定', 'lock'] },
      { key: 'ad-fixed', keywords: ['每页重复', 'repeat'] },
      { key: 'ad-z-index', keywords: ['层级', 'zindex'] },
      { key: 'ad-delete', keywords: ['删除'] },
    ],
  },
]

/** 正向包含匹配：任一关键词包含搜索词即命中；空搜索恒命中 */
export function matchKeywords(search: string, keywords: string[]): boolean {
  const s = search.trim().toLowerCase()
  if (!s) {
    return true
  }
  return keywords.some(k => k.toLowerCase().includes(s))
}

/** 计算命中的分组与表单项 key 集合 */
export function searchProperties(search: string): { groups: string[]; itemKeys: Set<string> } {
  const groups: string[] = []
  const itemKeys = new Set<string>()
  for (const g of PROPERTY_REGISTRY) {
    const matched = g.items.filter(item => matchKeywords(search, [...item.keywords, g.groupLabel]))
    if (matched.length > 0) {
      groups.push(g.group)
      for (const item of matched) {
        itemKeys.add(item.key)
      }
    }
  }
  return { groups, itemKeys }
}
