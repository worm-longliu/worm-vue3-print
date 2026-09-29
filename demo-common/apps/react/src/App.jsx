// React 18 宿主集成 @worm-vue3-print/common 的完整链路示例。
// 版式与 ./demo（Vue 3 打印设计器示例）完全一致：样式由 sync-demo-styles.mjs 从 demo 逐字抽取生成，
// 本文件不写任何私有样式；事件不走侧栏面板，而是与 demo 同口径写控制台 + 下载 + alert。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createDefaultTemplate } from '@worm-vue3-print/common'
import { SAMPLES } from './templates'
import TemplateGalleryDialog from './components/TemplateGalleryDialog'
import CustomDataDialog from './components/CustomDataDialog'
import PrintOutputDialog from './components/PrintOutputDialog'
import { renderInBrowser, writeHtmlToFrame } from './browser-render'

/** 宿主基址：模板里的相对路径图片按它拼接 */
const BASE_URL = window.location.origin

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

const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))

function downloadTemplateFile(json, name) {
  const blob = new Blob([JSON.stringify(JSON.parse(json), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const designerRef = useRef(null)   // <print-designer> 自定义元素本体
  const fileInputRef = useRef(null)
  const previewFrameRef = useRef(null)

  const [fields, setFields] = useState([])
  const [templateData, setTemplateData] = useState(() => createDefaultTemplate())
  const [activeData, setActiveData] = useState({})
  const [currentSample, setCurrentSample] = useState(null)

  const [batchEnabled, setBatchEnabled] = useState(false)
  const [customDataActive, setCustomDataActive] = useState(false)

  const batchDataList = useMemo(() =>
    (!customDataActive && currentSample?.batchData)
      ? currentSample.batchData
      : deriveBatchData(activeData),
  [customDataActive, currentSample, activeData])
  /** 当前生效的打印数据：对象=单份，数组=批量，三条链路共用同一数据源 */
  const printData = useMemo(() => (batchEnabled ? batchDataList : activeData), [batchEnabled, batchDataList, activeData])

  // 事件只注册一次（StrictMode 下靠 cleanup 保证不重复），但需读到最后 printData，用 ref 桥接
  const printDataRef = useRef(printData)
  printDataRef.current = printData

  // ────────────────── 设计器：属性注入与宿主回调 ──────────────────
  // <print-designer> 是原生自定义元素：template={obj} 这类绑定会走 setAttribute，
  // 对象被字符串化成 "[object Object]"，所以对象/函数入参必须赋 property；
  // 只有字符串开关（is-edit、show-help）可以写在 JSX 属性上。
  // fields 只有 setter（读回看 el.store.fields），故日志按宿主自身持有的数据计数。
  const syncDesigner = useCallback((nextFields, nextTemplate) => {
    const el = designerRef.current
    if (!el) return
    el.fields = nextFields
    el.template = nextTemplate
    console.log(`[demo] 注入 fields(${nextFields.length} 个字段) 与 template(${nextTemplate.paperSize})`)
  }, [])

  /** 图片上传回调：设计器「插入图片」时调用，宿主返回可访问地址即可（demo 用 Data URL 模拟上传接口） */
  function uploadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('图片读取失败'))
      reader.readAsDataURL(file)
    })
  }

  // ────────────────── 链路一：浏览器渲染预览 + 浏览器打印 ──────────────────
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewPages, setPreviewPages] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')

  const openPreview = useCallback(async (templateJson) => {
    setPreviewPages(0)
    setPreviewError('')
    setPreviewLoading(true)
    setPreviewVisible(true)
    try {
      const rendered = await renderInBrowser(templateJson, printDataRef.current, BASE_URL)
      // iframe 由条件渲染控制，需等这一帧渲染完成后再取节点
      await nextFrame()
      writeHtmlToFrame(previewFrameRef.current, rendered.html)
      setPreviewPages(rendered.pageCount)
    } catch (error) {
      setPreviewError(`渲染失败：${error.message}`)
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  /** 载入示例：模板深拷贝后回写（重复选同一示例也能触发重载），字段树与打印数据同步切换 */
  const applySample = useCallback((sample) => {
    const nextTemplate = JSON.parse(JSON.stringify(sample.template))
    const nextFields = [...sample.fields]
    setTemplateData(nextTemplate)
    setFields(nextFields)
    setActiveData(sample.data)
    setCurrentSample(sample)
    setCustomDataActive(false)
    setGalleryVisible(false)
    syncDesigner(nextFields, nextTemplate)
  }, [syncDesigner])

  // ────────────────── 设计器事件（CustomEvent，载荷在 event.detail） ──────────────────
  /** 宿主侧拼版校验：getTemplateJson() 是绕过保存按钮的旁路，消费它的链路需自己拦截非法拼版 */
  const assertTilingValid = useCallback(() => {
    const issues = designerRef.current?.validateTemplate?.() ?? []
    if (issues.length) {
      alert(issues[0].message)
      return false
    }
    return true
  }, [])

  // 事件必须 addEventListener 且在 cleanup 里 removeEventListener：
  // StrictMode dev 下 effect 双跑，不解绑会重复注册（同一次 @save 下载两份文件）。
  useEffect(() => {
    const el = designerRef.current
    if (!el) return
    // 上传能力同样是 property（函数无法走 attribute）
    el.uploadImage = uploadImage
    el.uploadDesignBackground = uploadImage

    const onSave = (event) => {
      if (!assertTilingValid()) return
      downloadTemplateFile(event.detail, `template-${Date.now()}.json`)
      console.log('[demo] @save 保存模板：', JSON.parse(event.detail))
    }
    const onPreview = (event) => {
      console.log('[demo] @preview 触发')
      openPreview(JSON.parse(event.detail))
    }
    const onHelp = () => console.log('[demo] @help 触发：设计器自带帮助弹窗，宿主可据此埋点')
    const onDblclickElement = (event) => console.log('[demo] @dblclick-element 触发：', JSON.parse(event.detail))

    el.addEventListener('save', onSave)
    el.addEventListener('preview', onPreview)
    el.addEventListener('help', onHelp)
    el.addEventListener('dblclick-element', onDblclickElement)
    return () => {
      el.removeEventListener('save', onSave)
      el.removeEventListener('preview', onPreview)
      el.removeEventListener('help', onHelp)
      el.removeEventListener('dblclick-element', onDblclickElement)
    }
  }, [assertTilingValid, openPreview])

  // ────────────────── 顶栏：模板导入 / 导出 / 清空 ──────────────────
  function onExportTemplate() {
    if (!assertTilingValid()) return
    const json = designerRef.current?.getTemplateJson?.()
    if (!json) return
    downloadTemplateFile(json, `template-${Date.now()}.json`)
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

  function onImportTemplate(event) {
    const input = event.target
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
        setTemplateData(data)
        setCurrentSample(null)
        syncDesigner(fields, data)
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
    const blank = createDefaultTemplate()
    setTemplateData(blank)
    setCurrentSample(null)
    syncDesigner(fields, blank)
  }

  function printPreview() {
    previewFrameRef.current?.contentWindow?.print()
  }

  // 全屏预览没有可点击的遮罩空白区，改用 Esc 关闭：打开时绑定、关闭时解绑
  useEffect(() => {
    if (!previewVisible) return
    const onPreviewKeydown = (event) => {
      if (event.key === 'Escape') setPreviewVisible(false)
    }
    window.addEventListener('keydown', onPreviewKeydown)
    return () => window.removeEventListener('keydown', onPreviewKeydown)
  }, [previewVisible])

  // ────────────────── 各弹窗可见性 ──────────────────
  const [galleryVisible, setGalleryVisible] = useState(false)
  const [customDialogVisible, setCustomDialogVisible] = useState(false)
  const [printDialogVisible, setPrintDialogVisible] = useState(false)

  // 应用自定义字段与数据：即时生效并覆盖当前字段树
  function onApplyCustom(nextFields, nextData) {
    setFields(nextFields)
    setActiveData(nextData)
    setCustomDataActive(true)
    setCustomDialogVisible(false)
    syncDesigner(nextFields, templateData)
  }

  // 进入页面自动载入第一个示例，并挂上设计器事件
  useEffect(() => {
    applySample(SAMPLES[0])
    console.log('[demo] 设计器已挂载：registerAll() 在 main.jsx 调用一次，React 原生放行自定义元素')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="demo-app">
      <header className="demo-topbar">
        <span className="demo-project">worm-vue3-print</span>
        <span className="demo-logo">打印模板设计器 Demo</span>
        <span className="demo-badge">业务类型：{currentSample ? currentSample.name : '空白模板'}</span>
        <span className="demo-badge">宿主：React + Web Component</span>
        <button type="button" className="demo-print-btn" onClick={() => setCustomDialogVisible(true)}>自定义字段与数据</button>
        <button type="button" className="demo-print-btn" onClick={() => setGalleryVisible(true)}>加载示例</button>
        <button type="button" className="demo-print-btn" onClick={onExportTemplate}>导出模板</button>
        <button type="button" className="demo-print-btn" onClick={() => fileInputRef.current?.click()}>导入模板</button>
        <button type="button" className="demo-print-btn" onClick={onClearTemplate}>清空</button>
        <label
          className={`demo-batch-switch${batchEnabled ? ' on' : ''}`}
          title={`开启后浏览器预览/打印、客户端静默打印、服务端 PDF 均传入 ${batchDataList.length} 份数据数组，由打印插件合并为一个作业`}
        >
          <input type="checkbox" checked={batchEnabled} onChange={e => setBatchEnabled(e.target.checked)} />
          <span>批量打印（{batchDataList.length} 份）</span>
        </label>
        <button type="button" className="demo-print-btn" onClick={() => setPrintDialogVisible(true)}>打印输出</button>
        <input ref={fileInputRef} type="file" accept="application/json,.json" className="demo-file-input" onChange={onImportTemplate} />
      </header>

      <main className="demo-container">
        {/* 自定义元素：字符串开关走 attribute，对象/函数入参走 property（见上方注释） */}
        <print-designer ref={designerRef} is-edit="true" show-help="true" />
      </main>

      {/* 设计器预览：由设计器自带「预览」触发（preview 事件），DOM 结构与 demo 的 PrintHtmlPreview 一致 */}
      {previewVisible ? (
        <div className="preview-mask">
          <div className="preview-panel">
            <div className="preview-head">
              <span className="preview-title">打印预览</span>
              {previewPages > 0 ? <span className="preview-subtitle">{previewPages} 页</span> : null}
              <div className="preview-actions">
                <button type="button" className="preview-btn" onClick={printPreview}>打印</button>
                <button type="button" className="preview-btn ghost" onClick={() => setPreviewVisible(false)}>关闭</button>
              </div>
            </div>
            <div className="preview-body print-html-preview">
              {previewLoading ? <div className="print-html-preview-loading">预览渲染中…</div> : null}
              {previewError ? <div className="print-html-preview-error">{previewError}</div> : null}
              <iframe ref={previewFrameRef} className="print-html-preview-iframe" title="打印预览" />
            </div>
          </div>
        </div>
      ) : null}

      <PrintOutputDialog
        visible={printDialogVisible}
        onClose={() => setPrintDialogVisible(false)}
        designerRef={designerRef}
        printData={printData}
        currentSampleName={currentSample?.name}
        baseUrl={BASE_URL}
      />

      <TemplateGalleryDialog
        visible={galleryVisible}
        currentSample={currentSample}
        onClose={() => setGalleryVisible(false)}
        onApply={applySample}
      />

      <CustomDataDialog
        visible={customDialogVisible}
        fields={fields}
        data={activeData}
        onClose={() => setCustomDialogVisible(false)}
        onApply={onApplyCustom}
      />
    </div>
  )
}
