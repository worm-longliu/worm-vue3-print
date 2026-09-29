// 自定义字段与数据弹窗：直接粘贴 JSON，调整后即时生效，便于验证打印效果。
// 受控 textarea 用 value + onChange；验收脚本以原生 value setter + input 事件写入，React 能正常接住。
import { useEffect, useState } from 'react'

export default function CustomDataDialog({ visible, fields, data, onClose, onApply }) {
  const [fieldsText, setFieldsText] = useState('')
  const [dataText, setDataText] = useState('')
  const [fieldsError, setFieldsError] = useState('')
  const [dataError, setDataError] = useState('')

  // 每次打开：用当前字段树与打印数据预填
  useEffect(() => {
    if (!visible) return
    setFieldsText(JSON.stringify(fields, null, 2))
    setDataText(JSON.stringify(data, null, 2))
    setFieldsError('')
    setDataError('')
  }, [visible, fields, data])

  if (!visible) return null

  const parseFields = () => {
    let parsed
    try {
      parsed = JSON.parse(fieldsText)
    } catch (err) {
      setFieldsError(`字段 JSON 解析失败：${err.message}`)
      return null
    }
    if (!Array.isArray(parsed)) {
      setFieldsError('字段必须是数组，结构为 [ { "fieldKey": "...", "fieldLabel": "..." } ]')
      return null
    }
    const invalidIndex = parsed.findIndex(
      f => !f || typeof f !== 'object' || typeof f.fieldKey !== 'string' || typeof f.fieldLabel !== 'string',
    )
    if (invalidIndex >= 0) {
      setFieldsError(`fields[${invalidIndex}] 缺少 fieldKey / fieldLabel 字段`)
      return null
    }
    return parsed
  }

  const parseData = () => {
    let parsed
    try {
      parsed = JSON.parse(dataText)
    } catch (err) {
      setDataError(`数据 JSON 解析失败：${err.message}`)
      return null
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setDataError('数据必须是对象，结构为 { "fieldKey": 值 }')
      return null
    }
    return parsed
  }

  const onFormatJson = () => {
    const parsedFields = parseFields()
    if (parsedFields) {
      setFieldsText(JSON.stringify(parsedFields, null, 2))
      setFieldsError('')
    }
    const parsedData = parseData()
    if (parsedData) {
      setDataText(JSON.stringify(parsedData, null, 2))
      setDataError('')
    }
  }

  const onApplyCustom = () => {
    const nextFields = parseFields()
    const nextData = parseData()
    if (!nextFields || !nextData) return
    onApply(nextFields, nextData)
  }

  return (
    <div className="custom-mask" onClick={onClose}>
      <div className="custom-panel" onClick={e => e.stopPropagation()}>
        <div className="custom-head">
          <span className="custom-title">自定义字段与数据</span>
          <span className="custom-close" onClick={onClose}>×</span>
        </div>

        <div className="custom-body">
          <section className="custom-section">
            <div className="section-head">
              <span className="section-label">字段 fields</span>
              <span className="section-hint">业务字段数组，每项含 fieldKey / fieldLabel / fieldType / sortOrder</span>
            </div>
            <textarea
              className="custom-editor"
              spellCheck={false}
              value={fieldsText}
              onChange={e => setFieldsText(e.target.value)}
            ></textarea>
            {fieldsError ? <p className="custom-error">{fieldsError}</p> : null}
          </section>

          <section className="custom-section">
            <div className="section-head">
              <span className="section-label">数据 data</span>
              <span className="section-hint">打印数据对象，结构与字段 fieldKey 对应</span>
            </div>
            <textarea
              className="custom-editor"
              spellCheck={false}
              value={dataText}
              onChange={e => setDataText(e.target.value)}
            ></textarea>
            {dataError ? <p className="custom-error">{dataError}</p> : null}
          </section>
        </div>

        <div className="custom-foot">
          <button type="button" className="custom-btn ghost" onClick={onFormatJson}>格式化</button>
          <div className="custom-foot-right">
            <button type="button" className="custom-btn ghost" onClick={onClose}>取消</button>
            <button type="button" className="custom-btn" onClick={onApplyCustom}>应用</button>
          </div>
        </div>
      </div>
    </div>
  )
}
