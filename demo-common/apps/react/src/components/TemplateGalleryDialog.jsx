// 示例模板库弹窗：版式与 demo 的 TemplateGalleryDialog 一致，点击「加载示例」唤出，选中后覆盖当前画布。
import { useEffect, useMemo, useState } from 'react'
import { SAMPLES } from '../templates'
import SampleThumb from '../SampleThumb'

const GROUPS = ['全部', '单据', '标签', '小票']
const countOf = group => (group === '全部' ? SAMPLES.length : SAMPLES.filter(s => s.group === group).length)

export default function TemplateGalleryDialog({ visible, currentSample, onClose, onApply }) {
  const [activeGroup, setActiveGroup] = useState('全部')
  const [selectedId, setSelectedId] = useState('')

  // 每次打开：默认选中当前示例（或第一个），避免「确定」按钮空态
  useEffect(() => {
    if (!visible) return
    setActiveGroup('全部')
    setSelectedId(currentSample?.id || SAMPLES[0].id)
  }, [visible, currentSample])

  const visibleSamples = useMemo(
    () => (activeGroup === '全部' ? SAMPLES : SAMPLES.filter(s => s.group === activeGroup)),
    [activeGroup],
  )

  if (!visible) return null

  const confirmGallery = () => {
    const sample = SAMPLES.find(s => s.id === selectedId)
    if (sample) onApply(sample)
  }

  return (
    <div className="gallery-mask" onClick={onClose}>
      <div className="gallery-panel" onClick={e => e.stopPropagation()}>
        <div className="gallery-head">
          <span className="gallery-title">选择示例模板</span>
          <span className="gallery-subtitle">{SAMPLES.length} 个示例 · 全部使用静态数据</span>
          <button type="button" className="gallery-close" onClick={onClose}>×</button>
        </div>

        <div className="gallery-tabs">
          {GROUPS.map(g => (
            <button
              key={g}
              type="button"
              className={`gallery-tab${activeGroup === g ? ' on' : ''}`}
              onClick={() => setActiveGroup(g)}
            >
              {g}<span className="gallery-tab-count">{countOf(g)}</span>
            </button>
          ))}
        </div>

        <div className="gallery-body">
          {visibleSamples.map(s => (
            <div
              key={s.id}
              className={`sample-card${selectedId === s.id ? ' selected' : ''}${s.id === currentSample?.id ? ' current' : ''}`}
              onClick={() => setSelectedId(s.id)}
              onDoubleClick={confirmGallery}
            >
              <SampleThumb template={s.template} data={s.data} />
              <div className="sample-meta">
                <div className="sample-name">
                  {s.name}
                  {s.id === currentSample?.id ? <span className="sample-flag">当前</span> : null}
                  {s.template.tiling?.enabled ? <span className="sample-flag tiling">拼版</span> : null}
                </div>
                <div className="sample-paper">{s.paper}</div>
                <div className="sample-desc">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="gallery-foot">
          <span className="gallery-tip">选中后将覆盖当前画布内容（可撤销）</span>
          <div className="gallery-actions">
            <button type="button" className="gallery-btn ghost" onClick={onClose}>取消</button>
            <button type="button" className="gallery-btn" disabled={!selectedId} onClick={confirmGallery}>使用该模板</button>
          </div>
        </div>
      </div>
    </div>
  )
}
