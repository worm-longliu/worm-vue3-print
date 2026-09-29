// 示例模板库弹窗：卡片 DOM 全部由 JS 生成（无模板引擎），类名与 demo 的 TemplateGalleryDialog 一致。
import { SAMPLES } from './templates.js'
import { createThumb } from './thumb.js'
import { setVisible } from './ui.js'

const GROUPS = ['全部', '单据', '标签', '小票']

/** 宿主注入的回调：读当前示例 id、应用选中示例 */
let host = null
let activeGroup = '全部'
let selectedId = ''

const countOf = group => (group === '全部' ? SAMPLES.length : SAMPLES.filter(s => s.group === group).length)
const visibleSamples = () => (activeGroup === '全部' ? SAMPLES : SAMPLES.filter(s => s.group === activeGroup))

function renderTabs() {
  const $tabs = $('#gallery-tabs').empty()
  GROUPS.forEach(g => {
    const $btn = $(`<button type="button" data-group="${g}" class="gallery-tab${g === activeGroup ? ' on' : ''}"></button>`)
      .text(g)
    $('<span class="gallery-tab-count"></span>').text(countOf(g)).appendTo($btn)
    $tabs.append($btn)
  })
}

/** 单张卡片：缩略图 + 元信息（当前示例加 .current，选中加 .selected） */
function renderCard(sample) {
  const currentId = host.currentSampleId()
  const $card = $(`<div class="sample-card" data-sample-id="${sample.id}"></div>`)
    .toggleClass('selected', selectedId === sample.id)
    .toggleClass('current', currentId === sample.id)
    .append(createThumb(sample.template, sample.data))

  const $name = $('<div class="sample-name"></div>').text(sample.name)
  if (currentId === sample.id) $name.append($('<span class="sample-flag"></span>').text('当前'))
  if (sample.template.tiling && sample.template.tiling.enabled) {
    $name.append($('<span class="sample-flag tiling"></span>').text('拼版'))
  }
  $card.append(
    $('<div class="sample-meta"></div>')
      .append($name)
      .append($('<div class="sample-paper"></div>').text(sample.paper))
      .append($('<div class="sample-desc"></div>').text(sample.desc)),
  )
  return $card
}

function renderCards() {
  const $body = $('#gallery-body').empty()
  visibleSamples().forEach(s => $body.append(renderCard(s)))
  $('#gallery-confirm').prop('disabled', !selectedId)
}

function confirmGallery() {
  const sample = SAMPLES.find(s => s.id === selectedId)
  if (sample) host.applySample(sample)
}

export function openGallery() {
  activeGroup = '全部'
  selectedId = host.currentSampleId() || SAMPLES[0].id
  $('#gallery-subtitle').text(`${SAMPLES.length} 个示例 · 全部使用静态数据`)
  renderTabs()
  renderCards()
  setVisible('#gallery-mask', true)
}

export function initGallery(handlers) {
  host = handlers
  // 页签：点击后只重画卡片列表，选中项保持不变（与 demo 口径一致）
  $('#gallery-tabs').on('click', '.gallery-tab', function () {
    activeGroup = this.dataset.group
    renderTabs()
    renderCards()
  })
  $('#gallery-body')
    .on('click', '.sample-card', function () {
      selectedId = this.dataset.sampleId
      renderCards()
    })
    .on('dblclick', '.sample-card', confirmGallery)
  $('#gallery-close, #gallery-cancel').on('click', () => setVisible('#gallery-mask', false))
  $('#gallery-mask').on('click', e => {
    if (e.target === e.currentTarget) setVisible('#gallery-mask', false)
  })
  $('#gallery-confirm').on('click', confirmGallery)
}
