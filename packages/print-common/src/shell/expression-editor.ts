// 表达式编辑器弹窗：移植 print-canvas/src/components/ExpressionEditor.vue（无框架版）。
// 类名与 canvas 逐字一致（样式由 scripts/gen-styles.mjs 从 canvas 派生，只认类名）。
//
// ─── 外部依赖清单（全部已在 core 中真实导出，无臆造）─────────────────────
//   @worm-vue3-print/core/designer
//     · evaluateTemplate(text, ctx): string   模板求值（ designer/utils/expression-eval.ts ）
//     · DEFAULT_DEMO_DATA                     预览用示例数据（ designer/utils/demo-data.ts ）
//     · groupFields(fields): FieldGroup[]     业务字段按 fieldKey 首段分组（ designer/utils/field-groups.ts ）
//     · filterGroups(groups, keyword)         分组关键字过滤（ designer/utils/field-groups.ts ）
//     · type PrintBusinessField               宿主业务字段类型（ designer/types.ts ）
//   @worm-vue3-print/core
//     · resolveSystemVariables(now?, page?)   系统变量取值，与渲染端同一实现（ render/data-binder.ts ）
//   ../core/h：h() 构造 DOM 描述、render() 落地、clear() 清空容器
//   未使用 iconSvg：canvas 版此处只有 emoji 字形与「×」文本按钮，无 lucide 图标。
//
// ─── 接线示例（属性台内容分组 + 表格单元格两处）────────────────────────
//   // print-designer.ts 内：ShellCtx 增补 expressionTarget 状态即可
//   import { renderExpressionEditor } from './shell/expression-editor'
//   import type { ExpressionEditorTarget } from './shell/expression-editor'
//
//   // 1) 打开：内容分组输入框 dblclick 时 targetPath='options.formatter'
//   private exprTarget: ExpressionEditorTarget | null = null
//   openExpressionEditor(target: ExpressionEditorTarget) { this.exprTarget = target; this.repaint() }
//
//   // 2) 渲染：必须 render 进 shadow root 本身（作为 .designer-container 的兄弟节点），
//   //    不要塞进 .designer-container —— repaint() 会 clear(shell) 把弹窗抹掉。卸载同理用 .remove()。
//   private repaint() {
//     const shell = this.root.querySelector<HTMLElement>('.designer-container')!
//     clear(shell)
//     /* ...既有外壳渲染... */
//     this.root.querySelectorAll('.pd-dialog-overlay').forEach(n => n.remove())
//     if (this.exprTarget) {
//       render(renderExpressionEditor({
//         fields: this.store.fields,
//         // demoData 可省：内部已并入 DEFAULT_DEMO_DATA 与系统变量；需按宿主数据预览时传
//         // { rows: [...明细行], supplier: {...} } 之类
//         onClose: () => { this.exprTarget = null; this.repaint() },
//         onApply: next => {
//           const t = this.exprTarget!
//           if (t.targetPath === 'options.formatter') {
//             this.store.updateElement(t.elementId, {
//               formatter: next.formatter ?? '',
//               ...(next.title !== undefined ? { title: next.title } : {}),
//             })
//           } else if (t.targetPath.startsWith('cell:')) {
//             // 表格单元格：自行按 'cell:<rowId>:<colIndex>' 定位后写 cell.formatter
//           }
//           // 只负责写回；关弹窗由紧随其后的 onClose 统一处理（点确定时内部会依次调用两者）
//         },
//       }, this.exprTarget), this.root)
//     }
//   }
//
// ─── 事件绑定与解绑说明（无常驻 window 监听）────────────────────────
//   所有监听都由 h() 的 on* 通过 addEventListener 挂在弹窗自身子树上：取消/确定/关闭按钮的
//   onClick、遮罩 div 的 onKeydown（Esc 关闭，对齐 canvas 的 @keydown.esc，只在焦点位于弹窗内时触发）、
//   页签/列表项/搜索框/文本域的事件同理。关闭即由调用方把遮罩节点从 shadow root 移除（见上），
//   节点连同监听一起被 GC，无需手动 removeEventListener。与 canvas 一致：点遮罩空白处不关闭，
//   只有 Esc / × / 取消 / 确定四条退出路径。
//
// ─── Teleport 改 shadow 内的差异 ───────────────────────────────────
//   canvas 用 position: fixed 的 .pd-dialog-overlay 覆盖整个视口（Teleport 到 body）。
//   本包只能渲染进 shadow root：.pd-dialog-overlay 的 fixed 定位依旧相对视口，视觉与 canvas 一致，
//   但 z-index: 2000 只在 <print-designer> 自身的层叠上下文内生效——宿主页面若有更高层叠元素会盖住弹窗；
//   若某个祖先带 transform/filter/contain，fixed 会退化为受该祖先定位。两种情况下把遮罩改为
//   position: absolute 并挂到已 position: relative 的宿主容器内即可（类名保持不变，样式不受影响）。
//   另外 canvas 的弹窗在组件树里由 v-model 控制显隐，本包改为「调用方决定 DOM 存在与否」。
//   内部状态是闭包对象 state（activeTab/searchText/expression/binding），配一个 repaint(root) 做显式重绘
//   （页签高亮、搜索占位、列表、文本域、预览）；换 target 就重新调用本函数拿新 DOM，无需 update 接口。
import { DEFAULT_DEMO_DATA, evaluateTemplate, filterGroups, groupFields } from '@worm-vue3-print/core/designer'
import type { PrintBusinessField } from '@worm-vue3-print/core/designer'
import { resolveSystemVariables } from '@worm-vue3-print/core'
import { clear, h, render } from '../core/h'
import type { El } from '../core/h'

export interface ExpressionEditorTarget {
  /** 元素 id（表格单元格时用于定位） */
  elementId: string
  /** 要写回的目标路径，如 'options.formatter' 或 'cell:<rowId>:<colIndex>' */
  targetPath: string
  /** 当前表达式文本 */
  value: string
  /** 可选：字段绑定模式的初始字段 key */
  binding?: string
}

export interface ExpressionEditorOptions {
  fields: PrintBusinessField[]
  /** 求值预览用的样例行数据 */
  demoData?: Record<string, any>
  /** 关闭弹窗 */
  onClose: () => void
  /** 点确定：把最终表达式回写 */
  onApply: (next: { formatter?: string; binding?: string; title?: string }) => void
}

type TabKey = 'field' | 'variable' | 'function'

/** 与 canvas 的 .ee-nav-tab 顺序严格一致（重绘时按下标取元素，不额外加属性） */
const TABS: { key: TabKey; text: string }[] = [
  { key: 'field', text: '📁 字段' },
  { key: 'variable', text: '🔧 变量' },
  { key: 'function', text: '⚡ 函数' },
]

const PLACEHOLDER: Record<TabKey, string> = {
  field: '搜索字段...',
  variable: '搜索变量...',
  function: '搜索函数...',
}

interface FnItem { name: string; label: string; template: string }

// 以下四组常量逐字照抄 canvas 的 aggregateFunctions / mathFunctions / formatFunctions / systemVars
const AGGREGATE_FUNCTIONS: FnItem[] = [
  { name: 'SUM', label: '求和', template: 'SUM()' },
  { name: 'AVG', label: '平均值', template: 'AVG()' },
  { name: 'COUNT', label: '计数', template: 'COUNT()' },
  { name: 'MIN', label: '最小值', template: 'MIN()' },
  { name: 'MAX', label: '最大值', template: 'MAX()' },
]

const MATH_FUNCTIONS: FnItem[] = [
  { name: 'ADD', label: '相加', template: 'ADD()' },
  { name: 'SUB', label: '相减', template: 'SUB()' },
  { name: 'MUL', label: '相乘', template: 'MUL()' },
  { name: 'DIV', label: '相除', template: 'DIV()' },
  { name: 'ROUND', label: '四舍五入', template: 'ROUND()' },
  { name: 'ROUNDUP', label: '进一法', template: 'ROUNDUP()' },
  { name: 'ROUNDDOWN', label: '去尾法', template: 'ROUNDDOWN()' },
  { name: 'ROUNDBANK', label: '四舍六入五成双', template: 'ROUNDBANK()' },
]

const FORMAT_FUNCTIONS: FnItem[] = [
  { name: 'MONEY', label: '金额格式化', template: 'MONEY()' },
  { name: 'DATE', label: '日期格式化', template: 'DATE()' },
  { name: 'UPPER', label: '大写金额', template: 'UPPER()' },
  { name: 'IF', label: '条件判断', template: 'IF()' },
]

const SYSTEM_VARIABLES: FnItem[] = [
  { name: 'pageIndex', label: '当前页码', template: '{pageIndex}' },
  { name: 'totalPages', label: '总页数', template: '{totalPages}' },
  { name: 'printDate', label: '打印日期', template: '{printDate}' },
  { name: 'printTime', label: '打印时间', template: '{printTime}' },
]

const FUNC_GROUPS: { title: string; items: FnItem[] }[] = [
  { title: '聚合函数', items: AGGREGATE_FUNCTIONS },
  { title: '数值运算', items: MATH_FUNCTIONS },
  { title: '格式化函数', items: FORMAT_FUNCTIONS },
]

const EMPTY_PREVIEW = '（输入表达式后预览）'
const NO_VALUE_PREVIEW = '（无法计算）'
const ERROR_PREVIEW = '（表达式错误）'

/** 与 canvas 的 previewResult 同逻辑：默认示例数据 < 宿主 demoData < 系统变量 */
function previewText(expr: string, demoData?: Record<string, any>): string {
  if (!expr.trim()) return EMPTY_PREVIEW
  try {
    const ctx = { ...DEFAULT_DEMO_DATA, ...(demoData ?? {}), ...resolveSystemVariables() }
    const result = evaluateTemplate(expr, ctx)
    if (result === undefined || result === null) return NO_VALUE_PREVIEW
    return String(result)
  } catch {
    return ERROR_PREVIEW
  }
}

/** 关键字过滤（label / name 小写包含），对齐 canvas 的 filtered* computed */
function matchKeyword(items: FnItem[], keyword: string): FnItem[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return items
  return items.filter(it => it.label.toLowerCase().includes(kw) || it.name.toLowerCase().includes(kw))
}

/** 光标上下文：最近的 { 未闭合 → 在表达式块内；最近的 ( 未闭合 → 在函数参数内 */
function cursorRegion(text: string, caret: number): { insideBlock: boolean; insideParens: boolean } {
  const before = text.substring(0, caret)
  const lastBlockOpen = before.lastIndexOf('{')
  const insideBlock = lastBlockOpen !== -1 && !before.slice(lastBlockOpen + 1).includes('}')
  const lastParenOpen = before.lastIndexOf('(')
  const insideParens = lastParenOpen !== -1 && !before.slice(lastParenOpen + 1).includes(')')
  return { insideBlock, insideParens }
}

/** 单一 {字段} 形式才回写 binding/title（对应 canvas 拖字段时 formatter + title 同源） */
function pureFieldBinding(expr: string, fields: PrintBusinessField[]): PrintBusinessField | null {
  const matched = /^\{\s*([^{}]+?)\s*\}$/.exec(expr.trim())
  if (!matched) return null
  const key = matched[1] ?? ''
  return fields.find(f => f.fieldKey === key) ?? null
}

/** 列表项两行信息（标签 + key/模板），三个页签共用同一结构 */
function itemInfo(label: string, key: string): El {
  return h('div', { class: 'ee-field-info' }, [
    h('span', { class: 'ee-item-label', text: label }),
    h('span', { class: 'ee-item-key', text: key }),
  ])
}

/** 事件元素的渲染作用域（shadow root 或 document）：重绘只在该子树内查询，不外溢到宿主页面 */
function scope(ev: Event): Document | ShadowRoot {
  return (ev.currentTarget as Element).getRootNode() as Document | ShadowRoot
}

function helpCard(modifier: string, title: string, lines: string[]): El {
  const content: unknown[] = []
  lines.forEach((line, i) => {
    content.push(line)
    if (i < lines.length - 1) content.push(h('br'))
  })
  return h('div', { class: `ee-help-card ${modifier}` }, [
    h('div', { class: 'ee-help-card-title', text: title }),
    h('div', { class: 'ee-help-card-content' }, content),
  ])
}

/** 帮助信息四卡：文案逐字照抄 canvas */
function helpSection(): El {
  return h('div', { class: 'ee-help-section' }, [
    h('div', { class: 'ee-help-title', text: '帮助信息' }),
    h('div', { class: 'ee-help-grid' }, [
      helpCard('ee-help-field', '输入方式', [
        '双击左侧字段、变量、函数即可插入到表达式输入框中',
        '静态数据直接输入即可，如：供应商名称',
        '动态解析字段、变量、函数必须用 {} 包裹',
        '示例：{SUM(supplier.name)}',
        '注意：只能嵌套一层',
      ]),
      helpCard('ee-help-function', '函数使用', [
        'SUM(字段) - 求和',
        'AVG(字段) - 平均值',
        'COUNT(字段) - 计数',
        'IF(条件, 真值, 假值) - 条件判断',
        '四则运算：{qty * price}、{ADD(qty, 1)}',
        '修约：ROUND 四舍五入 / ROUNDUP 进一 / ROUNDDOWN 去尾 / ROUNDBANK 四舍六入五成双',
      ]),
      helpCard('ee-help-variable', '系统变量', [
        '{pageIndex} - 当前页码',
        '{totalPages} - 总页数',
        '{printDate} - 打印日期',
      ]),
      helpCard('ee-help-conditional', '示例', [
        '静态文本：供应商名称',
        '动态字段：{supplier.name}',
        '函数调用：{SUM(amount)}',
        '条件判断：{IF(amount>1000, "大单", "小单")}',
        '运算并修约：{ROUND(qty * price, 2)}',
      ]),
    ]),
  ])
}

/** 渲染表达式编辑器弹窗的 DOM 描述（内部已含遮罩层，render 进 shadow 根下即可） */
export function renderExpressionEditor(opts: ExpressionEditorOptions, target: ExpressionEditorTarget): El {
  const state = {
    activeTab: 'field' as TabKey,
    searchText: '',
    expression: target.value || '',
    /** 字段绑定模式标记：仅当调用方给了初始 key，才在确定时回写 binding/title */
    binding: target.binding,
  }

  const query = <T extends Element>(root: ParentNode, selector: string) => root.querySelector<T>(selector)

  /** 重绘预览区：canvas 里是 computed，这里显式同步 */
  const updatePreview = (root: ParentNode) => {
    const el = query<HTMLElement>(root, '.ee-preview')
    if (!el) return
    const text = previewText(state.expression, opts.demoData)
    el.textContent = text
    el.classList.toggle('ee-preview-error', text === ERROR_PREVIEW)
  }

  const listItems = (): unknown[] => {
    if (state.activeTab === 'variable') {
      return matchKeyword(SYSTEM_VARIABLES, state.searchText).map(sv => h('div', {
        class: 'ee-list-item',
        onDblclick: (ev: Event) => {
          const { insideParens } = region(ev)
          insert(scope(ev), insideParens ? sv.template.replace(/^\{|\}$/g, '') : sv.template)
        },
      }, [itemInfo(sv.label, sv.template)]))
    }
    if (state.activeTab === 'function') {
      return FUNC_GROUPS.map(group => h('div', { class: 'ee-func-group' }, [
        h('div', { class: 'ee-func-group-title', text: group.title }),
        ...matchKeyword(group.items, state.searchText).map(fn => h('div', {
          class: 'ee-list-item',
          onDblclick: (ev: Event) => {
            const { insideBlock } = region(ev)
            const text = insideBlock ? fn.template : `{${fn.template}}`
            insert(scope(ev), text, text.indexOf('(') + 1)
          },
        }, [itemInfo(fn.label, `${fn.name}()`)])),
      ]))
    }
    const groups = filterGroups(groupFields(opts.fields ?? []), state.searchText)
    if (!groups.length) return [h('p', { class: 'pd-empty', text: '暂无字段' })]
    const nodes: unknown[] = []
    for (const group of groups) {
      if (group.key) {
        nodes.push(h('div', { class: `ee-field-group${group.isList ? ' is-list' : ''}` }, [
          h('span', { class: 'ee-field-group-icon', text: group.isList ? '📋' : '📁' }),
          h('span', { text: group.label }),
        ]))
      }
      for (const field of group.fields) {
        nodes.push(h('div', {
          class: 'ee-list-item ee-field-item',
          style: { paddingLeft: group.key ? '22px' : '10px' },
          onDblclick: (ev: Event) => {
            const { insideParens } = region(ev)
            insert(scope(ev), insideParens ? field.fieldKey : `{${field.fieldKey}}`)
          },
        }, [itemInfo(field.fieldLabel, field.fieldKey)]))
      }
    }
    return nodes
  }

  /** 显式重绘：页签高亮 / 搜索框 / 列表 / 文本域 / 预览（canvas 的响应式更新在无框架版的等价物） */
  const repaint = (root: ParentNode) => {
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('.ee-nav-tab'))
    tabs.forEach((el, i) => el.classList.toggle('active', TABS[i]?.key === state.activeTab))
    const search = query<HTMLInputElement>(root, '.ee-content-search .pd-input')
    if (search) {
      const placeholder = PLACEHOLDER[state.activeTab]
      if (search.placeholder !== placeholder) search.placeholder = placeholder
      if (search.value !== state.searchText) search.value = state.searchText
    }
    const ta = query<HTMLTextAreaElement>(root, '.ee-textarea')
    if (ta && ta.value !== state.expression) ta.value = state.expression
    const list = query<HTMLElement>(root, '.ee-content-list')
    if (list) {
      clear(list)
      for (const item of listItems()) render(item as El, list)
    }
    updatePreview(root)
  }

  /** 光标所在上下文：决定插入时要不要带大括号 */
  const region = (ev: Event) => {
    const ta = query<HTMLTextAreaElement>(scope(ev), '.ee-textarea')
    const caret = ta?.selectionStart ?? state.expression.length
    return cursorRegion(state.expression, caret)
  }

  /** 在光标处插入文本并把光标放到 caretOffset */
  const insert = (root: ParentNode, text: string, caretOffset = text.length) => {
    const ta = query<HTMLTextAreaElement>(root, '.ee-textarea')
    if (!ta) {
      state.expression += text
      updatePreview(root)
      return
    }
    const start = ta.selectionStart ?? state.expression.length
    const end = ta.selectionEnd ?? start
    state.expression = state.expression.substring(0, start) + text + state.expression.substring(end)
    const caret = start + caretOffset
    // 先写值再定位光标：给 value 赋值会把光标推到末尾，顺序不能颠倒（canvas 用 nextTick 达成同一效果）
    ta.value = state.expression
    ta.focus()
    ta.selectionStart = ta.selectionEnd = caret
    updatePreview(root)
  }

  /** 确定：先回写再关闭（对齐 canvas 的 emit('update:expression') + visible=false） */
  const onConfirm = () => {
    const formatter = state.expression
    if (state.binding === undefined) {
      opts.onApply({ formatter })
      opts.onClose()
      return
    }
    const field = pureFieldBinding(formatter, opts.fields ?? [])
    opts.onApply(field ? { formatter, binding: field.fieldKey, title: field.fieldLabel } : { formatter })
    opts.onClose()
  }

  const nav = h('div', { class: 'ee-nav' }, [
    h('div', { class: 'ee-nav-title', text: '类型' }),
    h('div', { class: 'ee-nav-tabs' }, TABS.map((tab, i) => h('div', {
      class: `ee-nav-tab${state.activeTab === tab.key ? ' active' : ''}`,
      text: tab.text,
      onClick: (ev: MouseEvent) => {
        state.activeTab = TABS[i]!.key
        repaint(scope(ev))
      },
    }))),
  ])

  const content = h('div', { class: 'ee-content' }, [
    h('div', { class: 'ee-content-search' }, [
      h('input', {
        class: 'pd-input',
        placeholder: PLACEHOLDER[state.activeTab],
        onInput: (ev: Event) => {
          state.searchText = (ev.target as HTMLInputElement).value
          repaint(scope(ev))
        },
      }),
    ]),
    h('div', { class: 'ee-content-list' }, listItems()),
  ])

  const initialPreview = previewText(state.expression, opts.demoData)

  const editor = h('div', { class: 'ee-editor' }, [
    h('div', { class: 'ee-editor-section' }, [
      h('div', { class: 'ee-editor-title', text: '表达式编辑' }),
      h('textarea', {
        class: 'ee-textarea',
        rows: 6,
        placeholder: '双击左侧字段/变量/函数插入，或直接输入静态内容',
        text: state.expression,
        onInput: (ev: Event) => {
          state.expression = (ev.target as HTMLTextAreaElement).value
          updatePreview(scope(ev))
        },
      }),
    ]),
    h('div', { class: 'ee-editor-section' }, [
      h('div', { class: 'ee-editor-title', text: '预览结果' }),
      h('div', {
        class: `ee-preview${initialPreview === ERROR_PREVIEW ? ' ee-preview-error' : ''}`,
        text: initialPreview,
      }),
    ]),
    helpSection(),
  ])

  return h('div', {
    class: 'pd-dialog-overlay',
    onKeydown: (ev: KeyboardEvent) => { if (ev.key === 'Escape') opts.onClose() },
  }, [
    h('section', {
      class: 'pd-dialog pd-dialog-large',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'expression-editor-title',
    }, [
      h('header', { class: 'pd-dialog-header' }, [
        h('strong', { id: 'expression-editor-title', text: '编辑表达式' }),
        h('button', { type: 'button', class: 'pd-close', 'aria-label': '关闭', text: '×', onClick: () => opts.onClose() }),
      ]),
      h('div', { class: 'expression-editor' }, [nav, content, editor]),
      h('footer', { class: 'pd-dialog-footer' }, [
        h('button', { type: 'button', class: 'pd-button', text: '取消', onClick: () => opts.onClose() }),
        h('button', { type: 'button', class: 'pd-button primary', text: '确定', onClick: () => onConfirm() }),
      ]),
    ]),
  ])
}
