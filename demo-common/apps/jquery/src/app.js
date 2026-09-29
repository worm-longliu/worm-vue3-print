// jQuery 宿主直挂集成 @worm-vue3-print/common 的完整链路示例（无打包器、无框架封装）。
// 版式与 ./demo（Vue 3 打印设计器示例）完全一致：样式来自 sync-demo-styles.mjs 抽取的 demo-ui.css，
// 本文件不写任何私有样式；宿主事件只进控制台，不做侧栏日志面板。
// 插件能力全部来自 window.WormPrintCommon（<script src="/vendor/worm-print-common.js"> 挂上的全局）。
import { SAMPLES } from './templates.js'
import { initGallery, openGallery } from './gallery.js'
import { initPrintDialog, openPrintDialog } from './print-dialog.js'
import { renderInBrowser, writeHtmlToFrame } from './browser-render.js'
import { setVisible, setNotice, downloadJson, nextFrame } from './ui.js'

const W = window.WormPrintCommon

/** 宿主基址：模板里的相对路径图片按它拼接 */
const BASE_URL = window.location.origin

const state = {
  fields: [],
  templateData: W.createDefaultTemplate(),
  activeData: {},
  currentSample: null,
  batchEnabled: false,
  customDataActive: false,
}

const designer = () => document.getElementById('designer')

// ────────────────── 打印数据：批量开关在对象/数组间切换，三条链路共用 ──────────────────
/**
 * 当前示例的批量数据：示例自带 batchData 时优先使用（一枚一条的标签场景），
 * 否则由当前单份数据派生，避免自定义数据与批量内容脱节。
 */
function deriveBatchData(base) {
  return Array.from({ length: 3 }, (_, i) => {
    const data = structuredClone(base)
    if (data.order && typeof data.order.no === 'string') {
      data.order = { ...data.order, no: `${data.order.no}-B${String(i + 1).padStart(2, '0')}` }
    }
    return data
  })
}

function batchDataList() {
  return !state.customDataActive && state.currentSample?.batchData
    ? state.currentSample.batchData
    : deriveBatchData(state.activeData)
}

/** 当前生效的打印数据：对象=单份，数组=批量 */
function printData() {
  return state.batchEnabled ? batchDataList() : state.activeData
}

function updateBatchUi() {
  const count = batchDataList().length
  $('#batch-text').text(`批量打印（${count} 份）`)
  $('#batch-switch').attr(
    'title',
    `开启后浏览器预览/打印、客户端静默打印、服务端 PDF 均传入 ${count} 份数据数组，由打印插件合并为一个作业`,
  )
}

// ────────────────── 设计器：属性注入与宿主回调 ──────────────────
// <print-designer> 是原生自定义元素：setAttribute 会把对象字符串化成 "[object Object]"，
// 所以对象/函数入参必须赋 property；只有字符串开关（is-edit、show-help）可以写在 attribute 上。
// fields 只有 setter（读回看 el.store.fields），故宿主自己保留一份字段数据。
function syncDesigner() {
  const el = designer()
  if (!el) return
  el.fields = state.fields
  el.template = state.templateData
  console.log(`[demo] 注入 fields(${state.fields.length} 个字段) 与 template(${state.templateData.paperSize})`)
}

/** 图片上传回调：设计器「插入图片」时调用，宿主返回可访问地址即可（demo 用 Data URL 模拟上传接口） */
function uploadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

/** 载入示例：模板深拷贝后回写（重复选同一示例也能触发重载），字段树与打印数据同步切换 */
function applySample(sample) {
  state.templateData = JSON.parse(JSON.stringify(sample.template))
  state.fields = [...sample.fields]
  state.activeData = sample.data
  state.currentSample = sample
  state.customDataActive = false
  setVisible('#gallery-mask', false)
  syncDesigner()
  $('#badge-biz').text(sample.name)
  updateBatchUi()
}

// ────────────────── 设计器事件（CustomEvent，jQuery 包装后载荷在 originalEvent.detail） ──────────────────
/** 宿主侧拼版校验：getTemplateJson() 是绕过保存按钮的旁路，消费它的链路需自己拦截非法拼版 */
function assertTilingValid() {
  const issues = designer()?.validateTemplate?.() ?? []
  if (issues.length) {
    alert(issues[0].message)
    return false
  }
  return true
}

/** @save：设计器保存按钮触发，宿主在此持久化。demo 仅下载 JSON 并打印到控制台 */
function onSave(event) {
  if (!assertTilingValid()) return
  downloadJson(event.detail, `template-${Date.now()}.json`)
  console.log('[demo] @save 保存模板：', JSON.parse(event.detail))
}

/** @preview：设计器预览按钮触发，detail 已带模板 JSON，直接渲染免保存预览 */
function onPreview(event) {
  console.log('[demo] @preview 触发')
  openPreview(JSON.parse(event.detail))
}

function currentTemplateJson() {
  return JSON.parse(designer().getTemplateJson())
}

// ────────────────── 顶栏：模板导出 / 导入 / 清空 ──────────────────
function onExportTemplate() {
  if (!assertTilingValid()) return
  const json = designer()?.getTemplateJson?.()
  if (!json) return
  downloadJson(json, `template-${Date.now()}.json`)
}

/** 轻量结构校验：接受单页模板，或多页面 wrapper（{ pages: [...] }，每页为完整单页模板） */
function isSingleTemplateLike(t) {
  return typeof t.paperSize === 'string'
    && !!t.margins && typeof t.margins === 'object'
    && Array.isArray(t.elements)
}
function isTemplateLike(data) {
  if (!data || typeof data !== 'object') return false
  if (isSingleTemplateLike(data)) return true
  return Array.isArray(data.pages) && data.pages.length > 0
    && data.pages.every(p => p && typeof p === 'object' && isSingleTemplateLike(p))
}

function onImportTemplate() {
  const input = document.getElementById('template-file-input')
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if (!isTemplateLike(data)) {
        alert('模板文件结构不合法：缺少 paperSize / margins / elements 等关键字段')
        return
      }
      state.templateData = data
      state.currentSample = null
      $('#badge-biz').text('空白模板')
      syncDesigner()
    } catch {
      alert('模板文件读取失败，请确认是有效的 JSON 文件')
    }
  }
  reader.onerror = () => alert('模板文件读取失败')
  reader.readAsText(file)
}

/** 清空：恢复空白模板（字段树与打印数据保留，便于继续拖字段） */
function onClearTemplate() {
  if (!confirm('将清空当前画布模板，是否继续？')) return
  state.templateData = W.createDefaultTemplate()
  state.currentSample = null
  $('#badge-biz').text('空白模板')
  syncDesigner()
  updateBatchUi()
}

// ────────────────── 链路一：浏览器渲染预览 + 浏览器打印 ──────────────────
function closePreview() {
  setVisible('#preview-mask', false)
  window.removeEventListener('keydown', onPreviewKeydown)
}

function onPreviewKeydown(event) {
  if (event.key === 'Escape') closePreview()
}

async function openPreview(templateJson) {
  setVisible('#preview-mask', true)
  window.addEventListener('keydown', onPreviewKeydown)
  setNotice('#preview-subtitle', '')
  setNotice('#preview-error', '')
  setVisible('#preview-loading', true)
  try {
    const rendered = await renderInBrowser(templateJson, printData(), BASE_URL)
    // iframe 一直在 DOM 里，等这一帧写完再灌产物，避免用户看到上一份内容
    await nextFrame()
    writeHtmlToFrame(document.getElementById('preview-frame'), rendered.html)
    setNotice('#preview-subtitle', `${rendered.pageCount} 页`)
  } catch (error) {
    setNotice('#preview-error', `渲染失败：${error.message}`)
  } finally {
    setVisible('#preview-loading', false)
  }
}

function printPreview() {
  document.getElementById('preview-frame')?.contentWindow?.print()
}

// ────────────────── 自定义字段与数据弹窗 ──────────────────
function openCustomDialog() {
  $('#custom-fields').val(JSON.stringify(state.fields, null, 2))
  $('#custom-data').val(JSON.stringify(state.activeData, null, 2))
  setNotice('#custom-fields-error', '')
  setNotice('#custom-data-error', '')
  setVisible('#custom-mask', true)
}

function closeCustomDialog() {
  setVisible('#custom-mask', false)
}

function parseFields() {
  let parsed
  try {
    parsed = JSON.parse(String($('#custom-fields').val()))
  } catch (err) {
    setNotice('#custom-fields-error', `字段 JSON 解析失败：${err.message}`)
    return null
  }
  if (!Array.isArray(parsed)) {
    setNotice('#custom-fields-error', '字段必须是数组，结构为 [ { "fieldKey": "...", "fieldLabel": "..." } ]')
    return null
  }
  const invalidIndex = parsed.findIndex(
    f => !f || typeof f !== 'object' || typeof f.fieldKey !== 'string' || typeof f.fieldLabel !== 'string',
  )
  if (invalidIndex >= 0) {
    setNotice('#custom-fields-error', `fields[${invalidIndex}] 缺少 fieldKey / fieldLabel 字段`)
    return null
  }
  setNotice('#custom-fields-error', '')
  return parsed
}

function parseData() {
  let parsed
  try {
    parsed = JSON.parse(String($('#custom-data').val()))
  } catch (err) {
    setNotice('#custom-data-error', `数据 JSON 解析失败：${err.message}`)
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    setNotice('#custom-data-error', '数据必须是对象，结构为 { "fieldKey": 值 }')
    return null
  }
  setNotice('#custom-data-error', '')
  return parsed
}

/** 格式化：两段各自校验，合法的那段重排为缩进 2 空格 */
function onFormatJson() {
  const parsedFields = parseFields()
  if (parsedFields) $('#custom-fields').val(JSON.stringify(parsedFields, null, 2))
  const parsedData = parseData()
  if (parsedData) $('#custom-data').val(JSON.stringify(parsedData, null, 2))
}

function onApplyCustom() {
  const nextFields = parseFields()
  const nextData = parseData()
  if (!nextFields || !nextData) return
  state.fields = nextFields
  state.activeData = nextData
  state.customDataActive = true
  closeCustomDialog()
  syncDesigner()
  updateBatchUi()
}

// ────────────────── 设计器挂载与顶栏事件绑定 ──────────────────
function mountDesigner() {
  // 字符串开关写在 attribute 上；元素默认 display:inline，由 demo-ui.css 给它块级 100% 宽高
  $('#host').html('<print-designer id="designer" is-edit="true" show-help="true"></print-designer>')
  const el = designer()
  // 上传能力同样是 property（函数无法走 attribute）
  el.uploadImage = uploadImage
  el.uploadDesignBackground = uploadImage
  // 事件是原生 CustomEvent：jQuery 会包一层事件对象，载荷要从 originalEvent.detail 取
  $(el).on('save', e => onSave(e.originalEvent))
  $(el).on('preview', e => onPreview(e.originalEvent))
  $(el).on('help', () => console.log('[demo] @help 触发：设计器自带帮助弹窗，宿主可据此埋点'))
  $(el).on('dblclick-element', e => console.log('[demo] @dblclick-element 触发：', JSON.parse(e.originalEvent.detail)))
}

function bindTopbar() {
  $('#btn-custom').on('click', openCustomDialog)
  $('#btn-gallery').on('click', openGallery)
  $('#btn-export').on('click', onExportTemplate)
  $('#btn-import').on('click', () => document.getElementById('template-file-input').click())
  $('#template-file-input').on('change', onImportTemplate)
  $('#btn-clear').on('click', onClearTemplate)
  $('#btn-print-output').on('click', openPrintDialog)
  $('#batch-checkbox').on('change', function () {
    state.batchEnabled = this.checked
    $('#batch-switch').toggleClass('on', state.batchEnabled)
    updateBatchUi()
  })
  $('#preview-print').on('click', printPreview)
  $('#preview-close').on('click', closePreview)
}

// ────────────────── 入口 ──────────────────
$(function () {
  // 全局由 <script src="/vendor/worm-print-common.js"> 提供；注册一次即可
  W.registerAll()
  mountDesigner()
  initGallery({
    currentSampleId: () => state.currentSample?.id,
    applySample,
  })
  initPrintDialog({
    printData,
    currentTemplateJson,
    currentSampleName: () => state.currentSample?.name,
  })
  bindTopbar()
  // 自定义弹窗：点遮罩空白处等同于取消
  $('#custom-close, #custom-cancel').on('click', closeCustomDialog)
  $('#custom-mask').on('click', e => {
    if (e.target === e.currentTarget) closeCustomDialog()
  })
  $('#custom-format').on('click', onFormatJson)
  $('#custom-apply').on('click', onApplyCustom)
  // 进入页面自动载入第一个示例（与 demo 自动载入综合示例同口径）
  applySample(SAMPLES[0])
  console.log('[demo] 设计器已挂载：registerAll() 在入口调用一次，直挂形态只依赖全局 WormPrintCommon')
})
