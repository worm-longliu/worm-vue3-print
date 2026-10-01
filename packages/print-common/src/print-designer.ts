// <print-designer> —— 无框架设计器自定义元素：只做「外壳装配 + 交互编排」，
// 状态在 core/store.ts，格式栏语义在 core/format.ts，DOM 结构在 shell/*。
// 类名与 print-canvas 对齐的原因见 shell/controls.ts 顶部说明。
import {
  calcResizeRect, computeFitScale, computeAdsorb, findMainCell, FIT_SCALE_MIN_PERCENT,
  generateId, getPaperDimensions, MIN_SCALE_PERCENT, mmToPx, nextWheelScale, pxToMm,
} from '@worm-vue3-print/core/designer'
import { buildFontFaceCss, normalizeTemplate, validateTiling } from '@worm-vue3-print/core'
import { fitTextNode } from '@worm-vue3-print/core/browser'
import type { AlignLine, ElementType, MultiPageTemplateData, ResizePoint, RuntimeElement, TemplateData, UploadDesignBackgroundFn, UploadImageFn } from '@worm-vue3-print/core/designer'
import type { PrintFontDeclaration } from '@worm-vue3-print/core'
import { clear, h, render } from './core/h'
import { DesignerStore } from './core/store'
import type { DesignerOptions } from './core/store'
import { FormatToolbar } from './core/format'
import { renderCanvasArea, zoneRectsMM } from './shell/canvas'
import { positionLabel } from './shell/elements'
import type { CanvasUI } from './shell/canvas'
import { renderFormatBar } from './shell/format-bar'
import { hydrateCodes } from './shell/code'
import { renderLeftPanel, renderPageTabs, renderStatusBar } from './shell/panels'
import { renderPropertyPanel } from './shell/property-panel'
import { abortTableColResize, renderTableContextMenu } from './shell/table'
import type { TableMenuState } from './shell/table'
import { renderExpressionEditor } from './shell/expression-editor'
import type { ExpressionEditorTarget } from './shell/expression-editor'
import { mountHelpModal } from './shell/help-modal'
import { applyPropertySearch } from './shell/property-search'
import { isExpressionText } from './shell/watermark'
import { writeBindingValue } from './shell/binding'
import { renderToolbar } from './shell/toolbar'
import type { ShellCtx, ShellState } from './shell/controls'
import { drawRuler } from './shell/ruler'
import type { RulerGeom } from './shell/ruler'
import designerCss from './styles/designer.css?inline'

const RULER_THICK = 20

/** Ctrl/⌘ 组合键白名单：不在表内的组合键不拦截浏览器默认行为（与 canvas useKeyboard 一致） */
const HANDLED_CTRL_KEYS = new Set(['z', 'y', 'a', 'c', 'x', 'v', 'd', 'g', '1', 'l', 'r', 'e', 't', 'b', '0'])

/** 画布双击可直接编辑表达式的元素类型（与 canvas 的 DBL_EDITABLE_FIELD 逐项一致） */
const DBL_EDITABLE_FIELD: Record<string, string> = {
  text: 'formatter',
  longText: 'formatter',
  barcode: 'formatter',
  qrcode: 'formatter',
  image: 'src',
}

const LEFT_CHROME_KEY = 'print-studio:left'
const RIGHT_CHROME_KEY = 'print-studio:right'

/** localStorage 在隐私模式/跨域 iframe 下会抛，读写都兜住 */
function readChromeKey(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === '1'
  } catch { return false }
}

function writeChromeKey(key: string, value: boolean) {
  try { localStorage.setItem(key, value ? '1' : '0') } catch { /* 忽略 */ }
}

interface DragState {
  /** 本次拖拽实际跟手的元素：被点中元素 + 同组元素（canvas 的口径，不含其它选中项） */
  ids: string[]
  /** 被点中的主元素：Alt 克隆只复制它一个 */
  primary: string
  /** mousedown 时的 Alt 态（canvas useDrag 在按下时锁定 altKey） */
  altKey: boolean
  startX: number
  startY: number
  origin: Map<string, { left: number; top: number }>
  /** 最近一次跟手坐标（live 层已写入，Alt 克隆取落点用） */
  movedPositions: Map<string, { left: number; top: number }>
  zone: 'header' | 'content' | 'footer'
  moved: boolean
}

interface ResizeState {
  id: string
  point: string
  startX: number
  startY: number
  origin: { left: number; top: number; width: number; height: number }
}

export class PrintDesignerElement extends HTMLElement {
  private root!: ShadowRoot
  private store!: DesignerStore
  private format!: FormatToolbar
  private unsub: (() => void) | null = null
  private state: ShellState = {
    leftTab: 'elements', leftCollapsed: false, propTab: 'page', propCollapsed: false,
    openDd: null, collapsedGroups: new Set(), renamingPage: null,
  }
  private geom: RulerGeom = { originX: 0, originY: 0, viewW: 0, viewH: 0, paperScale: 1 }
  /** 接管全局快捷键的实例（同页多设计器时最后一个交互者），见 bindKeys */
  private static active: PrintDesignerElement | null = null
  private docKeydown: ((ev: Event) => void) | null = null
  private ro: ResizeObserver | null = null
  private roArea: HTMLElement | null = null
  private scrollPos = { x: 0, y: 0 }
  private marquee = { visible: false, x: 0, y: 0, w: 0, h: 0 }
  private menu = { visible: false, x: 0, y: 0, flipX: 0, flipY: 0, targetId: null as string | null }
  private guidePreview: { type: 'vertical' | 'horizontal'; position: number } | null = null
  private zoneResizing: 'header' | 'footer' | null = null
  /** 表格右键菜单状态：由 shell/table.ts 读写，每帧随 renderTableContextMenu 一起出图 */
  private tableMenu: TableMenuState = { visible: false, x: 0, y: 0 }
  private exprTarget: ExpressionEditorTarget | null = null
  private exprMountedFor: ExpressionEditorTarget | null = null
  /** 帮助弹窗：canvas 的 helpVisible（showHelp 为 false 时强制收起，见 set showHelp） */
  private helpVisible = false
  private unmountHelp: (() => void) | null = null
  private drag: DragState | null = null
  private snapTimer: ReturnType<typeof setTimeout> | null = null
  /** 页签 tooltip：挂在 shadow root 上的浮层（canvas 的 .page-tabs-tip 等价物） */
  private pageTipEl: HTMLElement | null = null
  private pageTipTimer: ReturnType<typeof setTimeout> | null = null
  private resize: ResizeState | null = null
  private raf = 0
  private lastSelKey = ''
  private chromeKey = ''

  /** 宿主注入：图片上传，返回可访问 URL 或 data URL（对应 canvas 的 UPLOAD_IMAGE_KEY） */
  uploadImage?: UploadImageFn
  /** 宿主注入：设计背景图上传，返回可直接 <img src> 的完整路径（对应 canvas 的 UPLOAD_DESIGN_BACKGROUND_KEY） */
  uploadDesignBackground?: UploadDesignBackgroundFn
  /** 模板级字体声明（对应 canvas 的 fonts prop）：注入 @font-face、列出字体候选、随保存/导出写回模板 */
  private _fonts?: readonly PrintFontDeclaration[]
  set fonts(v: readonly PrintFontDeclaration[] | undefined) {
    this._fonts = v
    this.applyFontFace()
    this.repaint()
  }
  get fonts() { return this._fonts }
  /** 字体声明的 @font-face 样式节点（挂在 shadow root 内，设计期所见即出图所得） */
  private fontFaceStyle: HTMLStyleElement | null = null
  private docFontFaceStyle: HTMLStyleElement | null = null

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = designerCss
    this.root.appendChild(style)
    render(h('div', { class: 'designer-container', dataset: { test: 'designer-container' } }), this.root)
  }

  set template(v: unknown) { this.applyTemplate(v) }
  get template() { return this.store?.getTemplateJson() }
  set fields(v: unknown) {
    this.store.fields = (typeof v === 'string' ? JSON.parse(v) : v) ?? []
    this.repaint()
  }
  set isEdit(v: boolean) { this.setAttribute('is-edit', String(v)); this.repaint() }
  /** canvas 口径：showHelp 控制「帮助入口 + 弹窗」，关闭时强制收起已打开的弹窗 */
  set showHelp(v: boolean) {
    this.setAttribute('show-help', String(v))
    if (!v) this.closeHelp()
    this.repaint()
  }

  static get observedAttributes() { return ['template', 'fields', 'name', 'fonts'] }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (!value) return
    if (name === 'name') { this.repaint(); return }
    let parsed: unknown
    try { parsed = JSON.parse(value) } catch { return }
    if (name === 'template') this.applyTemplate(parsed)
    else if (name === 'fields') { this.store.fields = parsed as never; this.repaint() }
    else if (name === 'fonts' && Array.isArray(parsed)) this.fonts = parsed as PrintFontDeclaration[]
  }

  connectedCallback() {
    if (this.store) {
      // 重连（宿主挪动节点等）：字体与全局键监听随卸载摘除过，这里补挂
      this.applyFontFace()
      this.attachDocKeys()
      return
    }
    const opts: DesignerOptions = {}
    const t = this.getAttribute('template')
    if (t) { try { opts.initialTemplate = JSON.parse(t) } catch { /* 非法模板 JSON：保持默认模板 */ } }
    const f = this.getAttribute('fields')
    if (f) { try { opts.initialFields = JSON.parse(f) } catch { /* 忽略 */ } }
    this.store = new DesignerStore(opts)
    this.format = new FormatToolbar(this.store)
    // 格式刷的触发点是「选中集变化」（canvas useFormatPainter 的 watch(selectedIds)）：
    // 单击目标元素即刷，不依赖拖拽收尾
    this.store.onSelectionChanged = () => this.format.painterSyncSelection()
    this.readChrome()
    this.unsub = this.store.subscribe(() => this.repaint())
    this.bindPointer()
    this.bindKeys()
    this.attachDocKeys()
    this.applyFontFace()
    this.repaint()
    requestAnimationFrame(() => this.measureRuler())
  }

  /** 面板折叠态：与 canvas 的 useStudioChrome 共用 localStorage 键，同一浏览器里两边偏好互通 */
  private readChrome() {
    this.state.leftCollapsed = readChromeKey(LEFT_CHROME_KEY)
    this.state.propCollapsed = readChromeKey(RIGHT_CHROME_KEY)
    this.chromeKey = `${this.state.leftCollapsed ? 1 : 0}|${this.state.propCollapsed ? 1 : 0}`
  }

  private persistChrome() {
    const key = `${this.state.leftCollapsed ? 1 : 0}|${this.state.propCollapsed ? 1 : 0}`
    if (key === this.chromeKey) return
    this.chromeKey = key
    writeChromeKey(LEFT_CHROME_KEY, this.state.leftCollapsed)
    writeChromeKey(RIGHT_CHROME_KEY, this.state.propCollapsed)
  }

  disconnectedCallback() {
    this.unsub?.()
    this.unsub = null
    this.detachDocKeys()
    this.ro?.disconnect()
    this.ro = null
    this.roArea = null
    if (PrintDesignerElement.active === this) PrintDesignerElement.active = null
    abortTableColResize()
    // 帮助弹窗的 document 级 Esc 监听随卸载一起摘除
    this.unmountHelp?.()
    this.unmountHelp = null
    // 页签 tooltip 与吸附闪烁点的定时器随卸载摘除
    this.hidePageTip()
    if (this.snapTimer) { clearTimeout(this.snapTimer); this.snapTimer = null }
  }

  /**
   * 注入 @font-face：既进 shadow root（画布文档内），也进宿主文档 head。
   * 原因：`@font-face` 只在文档作用域参与字体加载，shadow 内单独声明不会触发下载，
   * 只挂 shadow 会出现「computed font-family 正确但字形回落」。canvas 本身就注到 document。
   */
  private applyFontFace() {
    const css = buildFontFaceCss(this._fonts)
    if (!css) {
      this.fontFaceStyle?.remove()
      this.fontFaceStyle = null
      this.docFontFaceStyle?.remove()
      this.docFontFaceStyle = null
      return
    }
    if (!this.fontFaceStyle) {
      this.fontFaceStyle = document.createElement('style')
      this.root.appendChild(this.fontFaceStyle)
    }
    this.fontFaceStyle.textContent = css
    if (!this.docFontFaceStyle) {
      this.docFontFaceStyle = document.createElement('style')
      this.ownerDocument.head.appendChild(this.docFontFaceStyle)
    }
    this.docFontFaceStyle.textContent = css
  }

  // ─── 宿主 API ───
  /** 与 canvas 的 templateJsonWithFonts 同口径：宿主字体声明随保存/导出一起出图 */
  private templateJsonWithFonts(): TemplateData | MultiPageTemplateData {
    const json = JSON.parse(this.store.getTemplateJson()) as TemplateData | MultiPageTemplateData
    const fonts = this.fonts
    if (!fonts?.length) return json
    if (Array.isArray((json as MultiPageTemplateData).pages)) {
      const mp = json as MultiPageTemplateData
      return { ...mp, pages: mp.pages.map(p => ({ ...p, fonts: [...fonts] })) }
    }
    return { ...(json as TemplateData), fonts: [...fonts] }
  }

  getTemplateJson(): string { return JSON.stringify(this.templateJsonWithFonts()) }
  loadTemplate(input: unknown) { this.applyTemplate(input) }
  save() {
    // 与 canvas 的 handleSave 同口径：非法拼版先提示并带到「页面属性」，不落盘
    const issues = this.validateTemplate()
    if (issues.length) {
      window.alert(issues[0].message)
      this.state.propTab = 'page'
      this.repaint()
      return
    }
    const json = this.templateJsonWithFonts()
    if (Array.isArray((json as MultiPageTemplateData).pages)) {
      try { normalizeTemplate(json as never) }
      catch (e) { window.alert(e instanceof Error ? e.message : String(e)); return }
    }
    const text = JSON.stringify(json)
    this.store.dirty = false
    this.repaint()
    this.dispatchEvent(new CustomEvent('save', { detail: text, bubbles: true, composed: true }))
  }
  /** 拼版配置校验：getTemplateJson 是旁路，宿主导出/另存时需自行调用拦截 */
  validateTemplate() {
    const t = this.store.templateData
    return t.tiling?.enabled === true ? validateTiling(t as never) : []
  }

  private applyTemplate(v: unknown) {
    if (!v) return
    const parsed = typeof v === 'string' ? JSON.parse(v) : v
    if (this.store) this.store.loadTemplate(parsed)
    else this.setAttribute('template', JSON.stringify(parsed))
  }

  // ─── 表达式编辑器 ───
  // canvas 用 v-model 控制弹窗显隐；这里按 target 对象身份挂载/卸载：
  // 外壳重绘不清空 root 上的遮罩节点，避免打字过程中被 repaint 打断而丢光标。
  private openExpression(target: ExpressionEditorTarget) {
    this.exprTarget = target
    this.syncExpression()
  }

  private closeExpression() {
    this.exprTarget = null
    this.syncExpression()
  }

  private syncExpression() {
    const stale = Array.from(this.root.querySelectorAll('.pd-dialog-overlay'))
    if (!this.exprTarget) {
      stale.forEach(n => n.remove())
      this.exprMountedFor = null
      return
    }
    if (this.exprMountedFor === this.exprTarget) return
    stale.forEach(n => n.remove())
    const target = this.exprTarget
    render(renderExpressionEditor({
      fields: this.store.fields,
      onClose: () => this.closeExpression(),
      onApply: next => this.applyExpression(target, next),
    }, target), this.root)
    this.exprMountedFor = target
  }

  // ─── 帮助弹窗 ───
  // 接线口径与 canvas 一致：点工具栏「帮助」即打开，Esc / × / 点遮罩空白处关闭；
  // 与表达式编辑器同一「挂到 shadow root、作为 .designer-container 兄弟节点」的范式，
  // 差别在于本弹窗无输入态，用 mount/unmount 而不是按对象身份复用。
  private openHelp() {
    this.helpVisible = true
    this.syncHelp()
  }

  private closeHelp() {
    if (!this.helpVisible) return
    this.helpVisible = false
    this.syncHelp()
  }

  private syncHelp() {
    // showHelp=false 时 canvas 由 watch 强制收起（并隐藏入口按钮）；这里同一口径兜住直接改属性的路径
    const want = this.helpVisible && this.getAttribute('show-help') !== 'false'
    if (want && !this.unmountHelp) {
      this.unmountHelp = mountHelpModal(this.root, { onClose: () => this.closeHelp() })
    } else if (!want && this.unmountHelp) {
      const off = this.unmountHelp
      this.unmountHelp = null
      off()
    }
  }

  /** 回写：targetPath 为 options.<字段>（含 tableRows[r].cells[c] 下标形）/ watermark.content */
  private applyExpression(target: ExpressionEditorTarget, next: { formatter?: string; binding?: string; title?: string }) {
    const value = next.formatter ?? ''
    const path = target.targetPath
    if (path.startsWith('options.')) {
      // 下标形（表格单元格）与 canvas 的 setBindingValue 同路：直接改节点后记历史
      if (path.includes('[')) {
        const el = this.store.elements.find(e => e.id === target.elementId)
        if (el) writeBindingValue(this.store, el, path, value)
        return
      }
      const patch: Record<string, unknown> = { [path.slice('options.'.length)]: value || undefined }
      if (next.title !== undefined) patch.title = next.title
      this.store.updateElement(target.elementId, patch as never)
      return
    }
    if (path === 'watermark.content') {
      // 与 canvas 的 WatermarkConfig.onChange 同口径：表达式写 binding，静态文本写 content
      const wm = { ...this.store.templateData.watermark }
      if (isExpressionText(value)) Object.assign(wm, { mode: 'binding', binding: value, content: '' })
      else Object.assign(wm, { mode: 'fixed', content: value, binding: '' })
      this.store.updateTemplateData({ watermark: wm } as never)
    }
  }

  /** 画布双击元素：与 canvas 的 DBL_EDITABLE_FIELD 白名单一致，锁定元素只选中不弹框 */
  private dblEditElement(id: string) {
    const el = this.store.elements.find(e => e.id === id)
    if (!el) return
    this.store.selectOne(id)
    this.state.propTab = 'element'
    if (el.options.locked) return
    const field = DBL_EDITABLE_FIELD[el.printElementType.type]
    if (!field) return
    this.openExpression({
      elementId: el.id,
      targetPath: `options.${field}`,
      value: String((el.options as unknown as Record<string, unknown>)[field] ?? ''),
    })
  }

  /** 表格单元格双击：定位合并主格后编辑其 formatter（对照 canvas 的 onDblClickCell） */
  private dblEditCell(arg: { elementId: string; r: number; c: number }) {
    const el = this.store.elements.find(e => e.id === arg.elementId)
    if (!el) return
    this.store.selectOne(el.id)
    this.state.propTab = 'element'
    if (el.options.locked) return
    const rows = el.options.tableRows ?? []
    const main = findMainCell(rows, arg.r, arg.c)
    const row = rows[main.r]
    const cell = row?.cells[main.c]
    if (!cell) return
    this.openExpression({
      elementId: el.id,
      targetPath: `options.tableRows[${main.r}].cells[${main.c}].formatter`,
      value: cell.formatter ?? '',
    })
  }

  private get ctx(): ShellCtx {
    return {
      store: this.store,
      format: this.format,
      state: this.state,
      repaint: () => this.repaint(),
      fire: (action, arg) => this.fire(action, arg),
      showHelp: this.getAttribute('show-help') !== 'false',
      isEdit: this.getAttribute('is-edit') === 'true',
      host: {
        uploadImage: this.uploadImage,
        uploadDesignBackground: this.uploadDesignBackground,
        fonts: this.fonts,
      },
    }
  }

  private canvasUi(): CanvasUI {
    return {
      geom: this.geom,
      marquee: this.marquee,
      contextMenu: this.menu,
      guidePreview: this.guidePreview,
      zoneResizing: this.zoneResizing,
      scrollX: this.scrollPos.x,
      scrollY: this.scrollPos.y,
    }
  }

  private repaint() {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.paint()
    })
  }

  private paint() {
    if (!this.store) return
    // 与 canvas 的 selectedElement watch 同口径：选中集变化即切换属性台页签
    const selKey = [...this.store.selectedIds].join(',')
    if (selKey !== this.lastSelKey) {
      this.lastSelKey = selKey
      this.state.propTab = selKey ? 'element' : 'page'
    }
    const shell = this.root.querySelector<HTMLElement>('.designer-container')!
    // canvas 的 PrintDesigner 根节点：格式刷激活时挂 `.format-painting`，画布区光标变十字（派生 CSS 自带该规则）
    shell.classList.toggle('format-painting', this.format.painterActive)
    clear(shell)
    const ctx = this.ctx
    render(renderToolbar(ctx, renderFormatBar(ctx as ShellCtx & { format: FormatToolbar })), shell)
    render(renderPageTabs(ctx), shell)
    render(h('div', { class: 'designer-body' }, [
      renderLeftPanel(ctx),
      renderCanvasArea(ctx, this.canvasUi()),
      renderPropertyPanel(ctx),
    ]), shell)
    render(renderStatusBar(ctx), shell)
    // 表格右键菜单每帧出图（不可见时返回 ''，但会登记状态引用供 table.ts 改写）
    const tableMenuNode = renderTableContextMenu(this.store, (a, b) => this.fire(a, b), this.tableMenu)
    if (tableMenuNode) render(tableMenuNode, shell)
    hydrateCodes(this.root, this.store.elements)
    // 属性台搜索：门控在分组构建时已生效，这里再重放一次，覆盖重绘与输入两条路径
    applyPropertySearch(this.root, this.state.propSearch)
    this.applyShrinkFit()
    this.syncRulers()
    this.persistChrome()
  }

  /**
   * 自动缩小实测遍：与 canvas 的 useShrinkFit 同一算法（core/browser fitTextNode），
   * 让「设计态看到的字号」等于「出纸字号」。覆盖元素级与表格单元格级两类探针节点。
   */
  private applyShrinkFit() {
    for (const node of Array.from(this.root.querySelectorAll<HTMLElement>('[data-fit="shrink"]'))) fitTextNode(node)
    // 从「自动缩小」切回其他形式时，需把上次缩小的字号复原
    for (const node of Array.from(this.root.querySelectorAll<HTMLElement>('[data-fit-size]'))) {
      if (node.getAttribute('data-fit') === 'shrink') continue
      node.removeAttribute('data-fit-size')
      const base = node.getAttribute('data-fit-base')
      if (base) node.style.fontSize = `${base}pt`
      else node.style.removeProperty('font-size')
    }
  }

  // ─── 标尺 ───
  private measureRuler() {
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    const paper = this.root.querySelector<HTMLElement>('.hiprint-printPaper')
    if (!area || !paper) return
    const ar = area.getBoundingClientRect()
    const pr = paper.getBoundingClientRect()
    const target = (this.store.scale || 100) / 100
    const measured = pr.width / mmToPx(this.store.paperSize.width)
    this.geom = {
      paperScale: Math.abs(measured - target) < 0.002 ? target : measured,
      originX: pr.left - ar.left - RULER_THICK + this.scrollPos.x,
      originY: pr.top - ar.top - RULER_THICK + this.scrollPos.y,
      viewW: area.clientWidth - RULER_THICK,
      viewH: area.clientHeight - RULER_THICK,
    }
    this.observeCanvasArea()
  }

  /**
   * 画布区尺寸变化（宿主改宽、面板折叠、窗口缩放、字体到位后重排）后重画标尺。
   * 对应 canvas 的 ResizeObserver(measureRuler)：整体重绘会换掉节点，故按当前节点重新挂载。
   */
  private observeCanvasArea() {
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    if (!area || typeof ResizeObserver === 'undefined' || this.roArea === area) return
    this.roArea = area
    this.ro?.disconnect()
    this.ro = new ResizeObserver(() => this.syncRulers())
    this.ro.observe(area)
  }

  private syncRulers() {
    this.measureRuler()
    const t = this.store.templateData
    const paper = getPaperDimensions(t)
    const scale = this.geom.paperScale
    for (const canvas of Array.from(this.root.querySelectorAll<HTMLCanvasElement>('.pd-ruler'))) {
      const orientation = canvas.dataset.ruler === 'vertical' ? 'vertical' : 'horizontal'
      drawRuler(canvas, {
        orientation,
        geom: this.geom,
        scale,
        paperLengthMM: orientation === 'horizontal' ? paper.width : paper.height,
      })
    }
  }

  /** 拖拽过程中只重写受影响元素的几何，避免全量重渲染打断输入态 */
  private patchElementDom() {
    for (const el of this.store.elements) {
      const node = this.root.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(el.id)}"]`)
      if (!node) continue
      node.style.left = `${el.options.left}mm`
      node.style.top = `${el.options.top}mm`
      node.style.width = `${el.options.width}mm`
      node.style.height = `${el.options.height}mm`
    }
    const label = this.root.querySelector<HTMLElement>('.position-label')
    const sel = this.store.selectedElement
    // canvas 拖拽期间只用 transform 做视觉跟随、不写响应式坐标，角标因此保持起始值；
    // 本包直接改 style.left/top，故拖拽中显式不更新角标，保持与 canvas 同一显示口径。
    if (label && sel && !this.drag) {
      label.textContent = positionLabel(sel.options)
    }
  }

  // ─── 动作分发 ───
  private fire(action: string, arg?: unknown) {
    const s = this.store
    switch (action) {
      case 'undo': s.undo(); break
      case 'redo': s.redo(); break
      case 'align': s.alignSelected(arg as never); break
      case 'move-layer': s.moveLayer(arg as 'top' | 'bottom' | 'up' | 'down'); break
      case 'group': s.groupSelected(); break
      case 'ungroup': s.ungroupSelected(); break
      case 'copy': s.copy(); break
      case 'cut': s.cutSelected(); break
      case 'paste': s.paste(); break
      case 'paste-at': s.paste(); break
      case 'delete': s.deleteSelected(); break
      case 'delete-page': s.deletePage(s.activePageIndex); break
      case 'add-page': s.addPage(); break
      case 'duplicate-page': s.duplicatePage(s.activePageIndex); break
      case 'move-page': s.movePage(s.activePageIndex, s.activePageIndex + (arg as number)); break
      case 'select-all': s.selectAll(); break
      case 'clear-selection': s.clearSelection(); break
      case 'toggle-ruler': s.showRuler = !s.showRuler; this.repaint(); break
      case 'toggle-grid': s.showGrid = !s.showGrid; this.repaint(); break
      case 'toggle-snap': s.snapToGrid = !s.snapToGrid; this.repaint(); break
      case 'toggle-table-ghost-border': s.showTableGhostBorder = !s.showTableGhostBorder; this.repaint(); break
      case 'fit-window': this.fitToWindow(); break
      case 'zoom': this.zoomByStep((arg as number) > 0 ? 1 : -1); break
      case 'preview':
        // canvas 的 @preview 无载荷（宿主自行取 getTemplateJson）；本包额外带一份 JSON 字符串供宿主直接用
        this.dispatchEvent(new CustomEvent('preview', {
          detail: this.getTemplateJson(), bubbles: true, composed: true,
        })); break
      case 'save': this.save(); break
      case 'help':
        // canvas：@help="helpVisible = true"。本包额外保留向外派发（宿主可监听），顺序是先派再开
        this.dispatchEvent(new CustomEvent('help', { bubbles: true, composed: true }))
        this.openHelp()
        break
      case 'guide-remove': s.removeGuide(arg as string); break
      case 'resize-start': this.beginResize(arg as { event: MouseEvent; id: string; point: string }); break
      case 'element-mousedown': {
        const a = arg as { event: MouseEvent; id: string }
        if (a.event.button === 0 && this.isDoubleTap(`el:${a.id}`, a.event)) {
          this.fire('element-dblclick', { event: a.event, id: a.id })
        }
        this.beginDrag(a); break
      }
      case 'table-cell-mousedown': {
        const a = arg as { elementId: string; r: number; c: number; cellId?: string; event: MouseEvent }
        if (this.isDoubleTap(`cell:${a.elementId}:${a.r}:${a.c}`, a.event)) {
          // 未选中表格时第一击走的是元素 mousedown：消费掉元素键，避免同一次双击重复派发 dblclick-element
          this.taps.delete(`el:${a.elementId}`)
          this.fire('table-cell-dblclick', { elementId: a.elementId, r: a.r, c: a.c, cellId: a.cellId })
        }
        break
      }
      case 'zone-resize': this.beginZoneResize(arg as { event: MouseEvent; zone: 'header' | 'footer' }); break
      case 'guide-mousedown': this.beginGuideDrag(arg as { event: MouseEvent; id: string }); break
      case 'ruler-mousedown': this.beginRulerGuide(arg as { event: MouseEvent; orientation: string }); break
      case 'canvas-mousedown': this.onCanvasMouseDown(arg as MouseEvent); break
      case 'canvas-mousemove': this.onCanvasMouseMove(arg as MouseEvent); break
      case 'canvas-mouseleave': this.clearCoord(); break
      case 'canvas-contextmenu': this.onContextMenu(arg as MouseEvent); break
      case 'contextmenu': this.onElementContextMenu(arg as { event: MouseEvent; id: string }); break
      case 'element-dblclick': {
        // 由 isDoubleTap 在 mousedown 阶段派发（见上方注释），原生 dblclick 在重绘后不会触发，这里不再监听
        const { id } = arg as { id: string }
        this.dblEditElement(id)
        this.dispatchEvent(new CustomEvent('dblclick-element', {
          detail: id, bubbles: true, composed: true,
        })); break
      }
      case 'table-cell-dblclick': {
        const a = arg as { elementId: string; r: number; c: number; cellId?: string }
        this.dblEditCell(a)
        // 与 dblclick-element 对称的宿主事件：detail 为对象，画布单元格与属性台单元格两条入口同形
        this.dispatchEvent(new CustomEvent('dblclick-cell', {
          detail: { elementId: a.elementId, r: a.r, c: a.c, cellId: a.cellId },
          bubbles: true, composed: true,
        })); break
      }
      case 'open-expression': this.openExpression(arg as ExpressionEditorTarget); break
      case 'drop': this.onDrop(arg as DragEvent); break
      case 'wheel': this.onWheel(arg as WheelEvent); break
      case 'scroll': this.onScroll(); break
      default: break
    }
  }

  // ─── 画布交互 ───
  private onDrop(ev: DragEvent) {
    ev.preventDefault()
    const dt = ev.dataTransfer
    const type = dt?.getData('elementType') as ElementType | ''
    const fieldKey = dt?.getData('fieldKey')
    const pos = this.pointToPaperMm(ev)
    if (!pos) return
    // 尺寸一律走 core 的分类型默认值（canvas 的 addElement 也只传落点），落点归区由 store 负责
    const point = { x: pos.left, y: pos.top }
    if (type) {
      this.store.addElement(type, {}, point)
    } else if (fieldKey) {
      const field = this.store.fields.find(f => f.fieldKey === fieldKey)
      if (field) this.store.addFieldElement(field, {}, point)
    }
  }

  /** 纸面 mm 落点（对应 canvas 的 toPaperPoint）：不取整，越出纸张左上角即视为无效 */
  private pointToPaperMm(ev: MouseEvent): { left: number; top: number } | null {
    const area = this.root.querySelector<HTMLElement>('.hiprint-printPaper')
    if (!area) return null
    const rect = area.getBoundingClientRect()
    const scale = (this.store.scale || 100) / 100
    const left = pxToMm((ev.clientX - rect.left) / scale)
    const top = pxToMm((ev.clientY - rect.top) / scale)
    if (left < 0 || top < 0) return null
    return { left, top }
  }

  private onCanvasMouseDown(ev: MouseEvent) {
    const target = ev.target as HTMLElement
    // 与 canvas 的 isCanvasBackground 同口径的**白名单**（早期用「不在元素/下拉/菜单上」的黑名单，
    // 于是点标尺、参考线、设计背景也会清空选中并起框选，canvas 不会）
    const isBg = target === this.root.querySelector<HTMLElement>('.canvas-area')
      || ['canvas-scroll', 'hiprint-printPaper', 'hiprint-printPaper-content', 'zone-layer', 'grid-bg', 'watermark-layer']
        .some(c => target.classList.contains(c))
    if (!isBg) return
    this.menu.visible = false
    if (this.state.openDd) { this.state.openDd = null; this.repaint() }
    if (ev.button === 0) {
      this.store.clearSelection()
      this.startMarquee(ev)
    }
  }

  private onCanvasMouseMove(ev: MouseEvent) {
    const pos = this.pointToPaperMm(ev)
    const coord = this.root.querySelector<HTMLElement>('[data-coord]')
    if (!coord) return
    if (!pos) { coord.style.display = 'none'; return }
    coord.style.display = ''
    // canvas 用 &nbsp; 分隔 x/y，普通空格会被 HTML 折叠
    coord.textContent = `x:${(pos.left - this.store.templateData.margins.left).toFixed(1)}\u00A0y:${(pos.top - this.store.templateData.margins.top).toFixed(1)}mm`
  }

  private clearCoord() {
    const coord = this.root.querySelector<HTMLElement>('[data-coord]')
    if (coord) coord.textContent = ''
  }

  private onContextMenu(ev: MouseEvent) {
    this.openMenu(ev, null)
  }

  private onElementContextMenu(arg: { event: MouseEvent; id: string }) {
    // 仅当右键目标不在选区里才改选它：已在多选中的元素（如 macOS 上 Ctrl+点击会连带触发 contextmenu）
    // 不能被塌缩成单选，否则增选结果会被右键菜单流程吃掉
    if (!this.store.selectedIds.has(arg.id)) this.store.selectOne(arg.id)
    this.openMenu(arg.event, arg.id)
  }

  private openMenu(ev: MouseEvent, targetId: string | null) {
    this.menu.x = ev.clientX
    this.menu.y = ev.clientY
    this.menu.targetId = targetId
    this.menu.visible = true
    this.menu.flipX = 0
    this.menu.flipY = 0
    this.repaint()
    requestAnimationFrame(() => {
      const node = this.root.querySelector<HTMLElement>('.context-menu')
      if (!node) return
      const r = node.getBoundingClientRect()
      this.menu.flipX = r.right > window.innerWidth ? window.innerWidth - r.right - 8 : 0
      this.menu.flipY = r.bottom > window.innerHeight ? window.innerHeight - r.bottom - 8 : 0
      this.paint()
    })
  }

  private startMarquee(ev: MouseEvent) {
    const start = { x: ev.clientX, y: ev.clientY }
    const onMove = (m: MouseEvent) => {
      this.marquee = {
        visible: true,
        x: Math.min(start.x, m.clientX),
        y: Math.min(start.y, m.clientY),
        w: Math.abs(m.clientX - start.x),
        h: Math.abs(m.clientY - start.y),
      }
      this.paint()
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const box = { ...this.marquee }
      this.marquee = { visible: false, x: 0, y: 0, w: 0, h: 0 }
      if (box.w > 2 && box.h > 2) {
        const hit = this.store.elements.filter(el => {
          const node = this.root.querySelector<HTMLElement>(`[data-el-id="${CSS.escape(el.id)}"]`)
          if (!node) return false
          const r = node.getBoundingClientRect()
          return r.left < box.x + box.w && r.right > box.x && r.top < box.y + box.h && r.bottom > box.y
        })
        this.store.select(new Set(hit.map(e => e.id)))
      } else this.repaint()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * 双击判定：同一目标两次左键 mousedown，间隔 <500ms 且位移 ≤6px 即视为一次双击。
   * 不能用原生 dblclick：paint 是 clear(shell) 全量重建，第一击选中元素后旧节点即被替换，
   * 第二击落在新节点上时 Chrome 不再派发 dblclick（实测 30ms 间隔亦为空）；
   * canvas 侧 Vue 原地 patch 节点不换，才没有这个问题。
   */
  private taps = new Map<string, { t: number; x: number; y: number }>()

  private isDoubleTap(key: string, ev: MouseEvent): boolean {
    const prev = this.taps.get(key)
    this.taps.set(key, { t: ev.timeStamp, x: ev.clientX, y: ev.clientY })
    if (!prev || ev.timeStamp - prev.t >= 500) return false
    if (Math.abs(ev.clientX - prev.x) > 6 || Math.abs(ev.clientY - prev.y) > 6) return false
    this.taps.delete(key)
    return true
  }

  private beginDrag(arg: { event: MouseEvent; id: string }) {
    const ev = arg.event
    if (ev.button !== 0) return
    const s = this.store
    ev.stopPropagation()
    const el = s.elements.find(e => e.id === arg.id)
    if (!el) return
    // canvas BaseElement.onMouseDown：`emit('select', id, e.ctrlKey || e.metaKey)`，
    // 增选键是 Ctrl/⌘ 而非 Shift；普通点击走整组选中，且已选中的成员也要重算（Ctrl 点击可取消选中）
    s.selectElement(el.id, ev.ctrlKey || ev.metaKey)
    if (el.options.locked) return
    // Alt+拖拽只复制被点中的那一个元素（canvas BaseElement 的 alt 分支不带动同组）
    const ids = ev.altKey ? [el.id] : s.dragIds(el.id)
    const origin = new Map<string, { left: number; top: number }>()
    for (const id of ids) {
      const e = s.elements.find(x => x.id === id)
      if (e) origin.set(id, { left: e.options.left, top: e.options.top })
    }
    this.drag = {
      ids, primary: el.id, altKey: ev.altKey, movedPositions: new Map(),
      startX: ev.clientX, startY: ev.clientY, origin,
      zone: (el.zone || 'content') as DragState['zone'], moved: false,
    }
    // canvas 的 useDrag 在 mousedown 即置 isDragging，元素立刻变淡并叠虚线框
    s.draggingIds = new Set(ids)
    // 拖拽前几何快照：mouseup 时用它做归区收尾（跨区换算 / 页眉页脚 clamp / 类型不允许则退回）
    s.dragStart()
    this.syncDragGhost()
  }

  /** 把 `.drag-ghost` 与 `.drag-preview` 同步到当前拖拽态（拖拽中不做整体重绘，定点改 DOM） */
  private syncDragGhost() {
    const ids = this.store.draggingIds
    for (const node of Array.from(this.root.querySelectorAll<HTMLElement>('.print-element'))) {
      const on = ids.has(node.dataset.elId ?? '')
      node.classList.toggle('drag-ghost', on)
      const preview = node.querySelector(':scope > .drag-preview')
      if (on && !preview) render(h('div', { class: 'drag-preview' }), node)
      else if (!on && preview) preview.remove()
    }
  }

  /**
   * Alt+拖拽落点生成副本（对应 canvas BaseElement.onDragEnd 的 alt 分支 + onCloneElement）：
   * 原元素留在原位、副本继承其全部样式但剥离组身份，选中落在副本、记一条历史。
   */
  private finishAltClone(d: DragState) {
    const s = this.store
    s.adsorbGuides = []
    const src = s.elements.find(e => e.id === d.primary)
    const pos = d.movedPositions.get(d.primary)
    s.discardLive()
    if (!src || !pos) return
    const el = JSON.parse(JSON.stringify(src)) as RuntimeElement
    el.id = generateId()
    el.options.left = pos.left
    el.options.top = pos.top
    el.options.groupId = undefined
    s.cloneElement(el)
  }

  /** 吸附闪烁点（对应 canvas CanvasPaper.showSnapIndicator：300ms 后自动消失，重复吸附则重启动画） */
  private flashSnapIndicator(leftMm: number, topMm: number) {
    const content = this.root.querySelector<HTMLElement>('.hiprint-printPaper-content')
    if (!content) return
    content.querySelector('.snap-indicator')?.remove()
    render(h('div', { class: 'snap-indicator', style: { left: `${leftMm}mm`, top: `${topMm}mm` } }), content)
    if (this.snapTimer) clearTimeout(this.snapTimer)
    this.snapTimer = setTimeout(() => {
      content.querySelector('.snap-indicator')?.remove()
      this.snapTimer = null
    }, 300)
  }

  private beginResize(arg: { event: MouseEvent; id: string; point: string }) {
    const ev = arg.event
    ev.stopPropagation()
    const el = this.store.elements.find(e => e.id === arg.id)
    if (!el || el.options.locked) return
    this.resize = {
      id: arg.id, point: arg.point, startX: ev.clientX, startY: ev.clientY,
      origin: { left: el.options.left, top: el.options.top, width: el.options.width, height: el.options.height },
    }
    // canvas 的缩放复用同一条 drag-start/drag-stop 链：结束时也要归区
    this.store.dragStart()
  }

  private beginZoneResize(arg: { event: MouseEvent; zone: 'header' | 'footer' }) {
    arg.event.stopPropagation()
    arg.event.preventDefault()
    this.zoneResizing = arg.zone
    const startY = arg.event.clientY
    const t = this.store.templateData
    const origin = arg.zone === 'header' ? t.header.height : t.footer.height
    const scale = (this.store.scale || 100) / 100
    const onMove = (m: MouseEvent) => {
      const delta = pxToMm((m.clientY - startY) / scale)
      const next = Math.max(0, Math.round((origin + (arg.zone === 'header' ? delta : -delta)) * 10) / 10)
      if (arg.zone === 'header') this.store.updateTemplateData({ header: { ...t.header, height: next } })
      else this.store.updateTemplateData({ footer: { ...t.footer, height: next } })
      this.paint()
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      this.zoneResizing = null
      this.store.recordHistory()
      this.repaint()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  private beginGuideDrag(arg: { event: MouseEvent; id: string }) {
    const g = (this.store.templateData.guides ?? []).find(x => x.id === arg.id)
    if (!g) return
    const paper = getPaperDimensions(this.store.templateData)
    const limit = g.type === 'vertical' ? paper.width : paper.height
    const startX = arg.event.clientX
    const startY = arg.event.clientY
    const scale = (this.store.scale || 100) / 100
    const onMove = (m: MouseEvent) => {
      const delta = pxToMm((g.type === 'vertical' ? m.clientX - startX : m.clientY - startY) / scale)
      this.store.moveGuide(g.id!, Math.min(limit, Math.max(0, g.position + delta)))
      this.paint()
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      this.store.recordHistory()
      this.repaint()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  private beginRulerGuide(arg: { event: MouseEvent; orientation: string }) {
    const type = arg.orientation === 'horizontal' ? 'vertical' : 'horizontal'
    const onMove = (m: MouseEvent) => {
      this.guidePreview = { type, position: type === 'vertical' ? m.clientX : m.clientY }
      this.paint()
    }
    const onUp = (m: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const mmPos = this.rulerPointToMM(m, type)
      this.guidePreview = null
      if (mmPos !== null) this.store.addGuide(type, mmPos)
      else this.repaint()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /**
   * 标尺拖出参考线时的 mm 换算。canvas 是 `(clientX - rulerRect.left - originPx) / pxPerMM`，
   * 而 originPx = paperRect.left - areaRect.left - 尺宽、rulerRect.left = areaRect.left + 尺宽，
   * 两项相消后等价于「相对纸张本体的像素距离 / pxPerMM」——这里直接用后一形式，
   * 早期实现漏掉尺宽与滚动量，同一屏幕点会算出与 canvas 不同的 mm（成对拖拽对拍揭穿）。
   */
  private rulerPointToMM(m: MouseEvent, type: 'vertical' | 'horizontal'): number | null {
    const paper = this.root.querySelector<HTMLElement>('.hiprint-printPaper')
    if (!paper) return null
    const pr = paper.getBoundingClientRect()
    const pxPerMM = mmToPx(1) * (this.geom.paperScale || 1)
    const mmValue = type === 'vertical'
      ? (m.clientX - pr.left) / pxPerMM
      : (m.clientY - pr.top) / pxPerMM
    const dim = getPaperDimensions(this.store.templateData)
    const limit = type === 'vertical' ? dim.width : dim.height
    return mmValue < 0 || mmValue > limit ? null : mmValue
  }

  /**
   * 统一缩放入口（对应 canvas CanvasArea.applyZoom）：以容器内锚点为不动点，
   * 缩放后校正滚动位置，保证锚点下的内容不漂移。
   * 容器存在非对称 padding（44/28/32/44），锚点换算必须扣除，否则每次漂移 pad*(ratio-1)。
   */
  private applyZoom(targetPercent: number, anchorX: number, anchorY: number, minPercent: number) {
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    if (!area) return
    const cur = Math.round(this.store.scale)
    const target = Math.max(minPercent, Math.round(targetPercent))
    if (target === cur) return
    const cs = getComputedStyle(area)
    const padX = parseFloat(cs.paddingLeft) || 0
    const padY = parseFloat(cs.paddingTop) || 0
    const ax = area.scrollLeft + anchorX - padX
    const ay = area.scrollTop + anchorY - padY
    const ratio = target / cur
    this.store.setScale(target, minPercent)
    area.scrollLeft = ax * ratio - anchorX + padX
    area.scrollTop = ay * ratio - anchorY + padY
  }

  /** 工具栏放大/缩小：与滚轮同一乘性步进，以视口几何中心为锚点 */
  private zoomByStep(direction: 1 | -1) {
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    if (!area) return
    this.applyZoom(nextWheelScale(this.store.scale, direction),
      area.clientWidth / 2, area.clientHeight / 2, MIN_SCALE_PERCENT)
  }

  /** 适应窗口（对应 canvas PrintDesigner.onFitWindow + CanvasArea.fitToWindow） */
  private fitToWindow() {
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    if (!area) return
    const cs = getComputedStyle(area)
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
    const paper = getPaperDimensions(this.store.templateData)
    const target = computeFitScale(
      area.clientWidth - padX, area.clientHeight - padY,
      mmToPx(paper.width), mmToPx(paper.height),
    )
    this.applyZoom(target, area.clientWidth / 2, area.clientHeight / 2, FIT_SCALE_MIN_PERCENT)
  }

  private onWheel(ev: WheelEvent) {
    if (!ev.ctrlKey && !ev.metaKey) return
    ev.preventDefault()
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    if (!area) return
    const oldPercent = Math.round(this.store.scale)
    const newPercent = nextWheelScale(oldPercent, ev.deltaY > 0 ? -1 : 1)
    if (newPercent === oldPercent) return
    const rect = area.getBoundingClientRect()
    this.applyZoom(newPercent, ev.clientX - rect.left, ev.clientY - rect.top, MIN_SCALE_PERCENT)
  }

  private onScroll() {
    const area = this.root.querySelector<HTMLElement>('.canvas-area')
    if (area) {
      this.scrollPos = { x: area.scrollLeft, y: area.scrollTop }
      this.syncRulers()
    }
  }

  // ─── 全局指针移动：拖拽 / 缩放 / 吸附 ───
  private bindPointer() {
    window.addEventListener('mousemove', (ev) => {
      const s = this.store
      if (!s) return
      const scale = (s.scale || 100) / 100
      // 位移换算与 canvas 同式：canvas 先算 scale = 视图倍率 × mmToPx(1) 再除，
      // 用 pxToMm(dx/scale) 数学等价但浮点求值顺序不同，会在导出 JSON 里留下 1e-14 级尾差
      const pxPerMm = (scale || 1) * mmToPx(1)
      const dmm = (dx: number, dy: number) => ({ dx: dx / pxPerMm, dy: dy / pxPerMm })
      if (this.drag) {
        const { dx, dy } = dmm(ev.clientX - this.drag.startX, ev.clientY - this.drag.startY)
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) this.drag.moved = true
        const first = s.elements.find(e => e.id === this.drag!.primary)
        const rect = first && {
          id: first.id,
          left: (this.drag.origin.get(first.id)?.left ?? 0) + dx,
          top: (this.drag.origin.get(first.id)?.top ?? 0) + dy,
          width: first.options.width,
          height: first.options.height,
        }
        let snapped: { left: number; top: number } | null = null
        if (rect && s.snapToGrid !== false) {
          const others = s.elements
            .filter(e => !this.drag!.ids.includes(e.id) && (e.zone || 'content') === this.drag!.zone)
            .map(e => ({ id: e.id, left: e.options.left, top: e.options.top, width: e.options.width, height: e.options.height }))
          const zone = zoneRectsMM(s.templateData, s.paperSize)[this.drag.zone]
          const result = computeAdsorb(rect, others, this.manualGuides()) as AdsorbLike
          snapped = { left: result.left, top: result.top }
          s.adsorbGuides = (result.lines ?? []).filter((l: AlignLine) =>
            l.position >= 0 && l.position <= (l.type === 'vertical' ? zone.width : zone.height))
          // canvas 的 requestAdsorb：位置被修正即发生吸附，在元素中心闪一次高亮点
          if (snapped.left !== rect.left || snapped.top !== rect.top) {
            this.flashSnapIndicator(snapped.left + rect.width / 2, snapped.top + rect.height / 2)
          }
        } else {
          s.adsorbGuides = []
        }
        // canvas 的 useDrag 直接取吸附后的绝对坐标（newLeft = result.left），位移是「修正后坐标 - 起始坐标」；
        // 若写成 snapped - rect 就只剩吸附修正量、丢掉 dx，元素会被钉死在原位拖不动
        const base = first ? this.drag.origin.get(first.id) : undefined
        const offsetX = snapped && base ? snapped.left - base.left : dx
        const offsetY = snapped && base ? snapped.top - base.top : dy
        for (const id of this.drag.ids) {
          const o = this.drag.origin.get(id)
          if (!o) continue
          // 不取整也不钳 0：canvas 的 useDrag 走原始 mm，越界只在结束时由 finalizeElementZone 收敛
          const next = { left: o.left + offsetX, top: o.top + offsetY }
          this.drag.movedPositions.set(id, next)
          s.livePatch(id, next)
        }
        this.patchElementDom()
        if (s.adsorbGuides.length) this.paintGuidesOnly()
      } else if (this.resize) {
        const { dx, dy } = dmm(ev.clientX - this.resize.startX, ev.clientY - this.resize.startY)
        // 与 canvas 的 useResize 同一纯函数（含 3.5mm 下限、不做取整），避免两侧落点坐标有微差
        const rect = calcResizeRect(this.resize.point as ResizePoint, this.resize.origin, dx, dy, 3.5, 3.5)
        s.livePatch(this.resize.id, rect as never)
        this.patchElementDom()
      }
    })
    window.addEventListener('mouseup', () => {
      const wasDragging = !!this.drag
      const d = this.drag
      if (d?.moved && d.altKey) {
        this.finishAltClone(d)
        this.store.dragStop()
        this.drag = null
        this.store.draggingIds = new Set()
        this.repaint()
        return
      }
      if (this.drag?.moved || this.resize) {
        this.store.adsorbGuides = []
        this.store.commitLive()
        // 归区收尾（对应 canvas 的 dragStop）：中心点跨区则改写 zone 并换算坐标，页眉页脚内 clamp
        this.store.dragStop()
        this.drag = null
        this.resize = null
        this.store.draggingIds = new Set()
        this.repaint()
      } else {
        this.drag = null
        this.store.dragStop()
        // 未移动也要撤掉 mousedown 时挂上的拖拽态（canvas 的 isDragging 在 mouseup 归 false）
        if (wasDragging) { this.store.draggingIds = new Set(); this.syncDragGhost() }
      }
    })
    // 外点关闭下拉与右键菜单（shadow 内节点用 composedPath 判定）
    this.addEventListener('pointerdown', (ev) => {
      const path = ev.composedPath() as EventTarget[]
      const inDd = path.some(n => (n as HTMLElement).classList?.contains('tb-dd'))
      if (this.state.openDd && !inDd) { this.state.openDd = null; this.repaint() }
      const inMenu = path.some(n => (n as HTMLElement).classList?.contains('context-menu'))
      if (this.menu.visible && !inMenu) { this.menu.visible = false; this.repaint() }
    })
    // 页签自定义 tooltip：canvas 的 PageTabs 用事件委托 + 300ms 延迟显示 `.page-tabs-tip`
    // （fixed 定位，不受页签列表 overflow 裁剪）。工具栏/格式栏的 tip 是 CSS ::after，无需 JS。
    // 监听挂在 shadow root 上：宿主元素只能拿到被重定向后的 target，取不到 shadow 内的节点。
    this.root.addEventListener('mouseover', (ev) => {
      const el = (ev as MouseEvent).target as HTMLElement | null
      const tip = el?.closest?.('[data-tip]') as HTMLElement | null
      if (!tip || !tip.closest('.page-tabs')) return
      if (this.pageTipTimer) clearTimeout(this.pageTipTimer)
      this.pageTipTimer = setTimeout(() => this.showPageTip(tip), 300)
    })
    this.root.addEventListener('mouseout', (ev) => {
      const e = ev as MouseEvent
      const tip = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
      if (!tip) return
      // 同一目标内部（图标与文字之间）移动不隐藏
      if ((e.relatedTarget as HTMLElement | null)?.closest?.('[data-tip]') === tip) return
      this.hidePageTip()
    })
  }

  private showPageTip(el: HTMLElement) {
    const text = el.dataset.tip
    if (!text) return
    this.hidePageTip()
    const rect = el.getBoundingClientRect()
    // 与 canvas 同口径：水平以目标中心对齐并粗夹到视口内
    const x = Math.min(Math.max(rect.left + rect.width / 2, 80), window.innerWidth - 80)
    this.pageTipEl = render(h('div', {
      class: 'page-tabs-tip',
      style: { left: `${x}px`, top: `${rect.bottom + 6}px` },
      text,
    }), this.root) as HTMLElement
  }

  private hidePageTip() {
    if (this.pageTipTimer) { clearTimeout(this.pageTipTimer); this.pageTipTimer = null }
    this.pageTipEl?.remove()
    this.pageTipEl = null
  }

  private manualGuides() {
    const v: number[] = []
    const hd: number[] = []
    for (const g of this.store.templateData.guides ?? []) {
      if (g.type === 'vertical') v.push(g.position)
      else hd.push(g.position)
    }
    return { vertical: v, horizontal: hd }
  }

  /** 仅重绘吸附引导线，避免拖拽中全量重建 DOM */
  private paintGuidesOnly() {
    const content = this.root.querySelector<HTMLElement>('.hiprint-printPaper-content')
    if (!content) return
    for (const old of Array.from(content.querySelectorAll('.adsorb-guide'))) old.remove()
    const paper = this.store.paperSize
    const zones = zoneRectsMM(this.store.templateData, paper)
    for (const line of this.store.adsorbGuides) {
      const node = document.createElement('div')
      node.className = `adsorb-guide guide-${line.type}`
      if (line.type === 'vertical') {
        node.style.cssText = `left:${line.position}mm;top:0;height:${paper.height}mm;border-left-color:${line.color || 'var(--pd-accent-secondary, #f56c6c)'}`
      } else {
        node.style.cssText = `top:${line.position}mm;left:0;width:${paper.width}mm;border-top-color:${line.color || 'var(--pd-accent-secondary, #f56c6c)'}`
      }
      void zones
      content.appendChild(node)
    }
  }

  private bindKeys() {
    this.setAttribute('tabindex', '0')
    // 谁是「当前设计器」：canvas 的 useKeyboard 绑 document，页面只有一个实例；本包允许同页多实例，
    // 用「最后交互的实例」接管全局快捷键，行为与 canvas 一致（焦点丢回 body 也仍然可用）
    const claim = () => { PrintDesignerElement.active = this }
    this.addEventListener('pointerdown', claim)
    this.addEventListener('focusin', claim)
    if (!PrintDesignerElement.active) PrintDesignerElement.active = this
  }

  /** document 级快捷键监听：随挂载/卸载成对增删（重连场景 store 已存在，bindKeys 不再执行） */
  private attachDocKeys() {
    if (this.docKeydown) return
    this.docKeydown = (ev) => this.onGlobalKeydown(ev as KeyboardEvent)
    document.addEventListener('keydown', this.docKeydown)
  }

  private detachDocKeys() {
    if (!this.docKeydown) return
    document.removeEventListener('keydown', this.docKeydown)
    this.docKeydown = null
  }

  private onGlobalKeydown(e: KeyboardEvent) {
    const s = this.store
    if (!s || PrintDesignerElement.active !== this) return
    // document 上拿到的 target 会被重定向成宿主元素，取真实按下节点判断是否在为输入
    const t = e.composedPath()[0] as HTMLElement | null
    const tag = t?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    this.format.handlePainterKeydown(e)
    // 与 canvas useKeyboard 同口径：方向键 Shift=10mm / Ctrl=0.5mm / 默认 1mm
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      const step = e.shiftKey ? 10 : e.ctrlKey ? 0.5 : 1
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
      s.moveSelected(dx, dy)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      s.deleteSelected()
      return
    }
    if (!(e.ctrlKey || e.metaKey)) return
    const key = e.key.toLowerCase()
    if (!HANDLED_CTRL_KEYS.has(key)) return
    // 只对本包确实处理的组合键 preventDefault（Ctrl+F / Ctrl+Shift+T 等留给浏览器，canvas 同口径）
    e.preventDefault()
    if (key === 'z') e.shiftKey ? s.redo() : s.undo()
    else if (key === 'y') s.redo()
    else if (key === 'a') s.selectAll()
    else if (key === 'c') s.copy()
    else if (key === 'x') s.cutSelected()
    else if (key === 'v') s.paste()
    else if (key === 'd') s.duplicateSelected()
    else if (key === 'g') e.shiftKey ? s.ungroupSelected() : s.groupSelected()
    else if (key === '1') s.resetZoom()
    // 多选对齐快捷键：与 canvas 的映射一致（水平居中在 core 里名为 vertical）
    else if (key === 'l') s.alignSelected('left')
    else if (key === 'r') s.alignSelected('right')
    else if (key === 'e') s.alignSelected('vertical')
    else if (key === 't') s.alignSelected('top')
    else if (key === 'b') s.alignSelected('bottom')
    // Ctrl+0 适应窗口：canvas 由 PrintDesigner 单独监听（需容器尺寸），此处等价实现
    else if (key === '0') this.fire('fit-window')
  }
}

/** computeAdsorb 的结果形状（core 未导出该类型，按返回值结构化声明） */
interface AdsorbLike {
  left: number
  top: number
  lines?: AlignLine[]
}

declare global {
  interface HTMLElementTagNameMap { 'print-designer': PrintDesignerElement }
}

export function definePrintDesigner(tag = 'print-designer') {
  if (!customElements.get(tag)) customElements.define(tag, PrintDesignerElement)
  return tag
}
