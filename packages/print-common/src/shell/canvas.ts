// 画布区：DOM 结构逐层对齐 canvas 的 CanvasArea.vue + CanvasPaper.vue
// .canvas-area > .canvas-scroll > .paper-wrapper > .hiprint-printPaper > .hiprint-printPaper-content
//   > .design-background? / .grid-bg? / .watermark-layer? / .zone-layer×3 / .adsorb-guide×n / .manual-guide×n
// 缩放口径：wrapper 用缩放后像素尺寸占位，纸张本体 width/height 用 mm + transform: scale(s)。
import { getPaperDimensions, mmToPx, resolveWatermarkLayout } from '@worm-vue3-print/core'
import type { AlignLine, RuntimeElement, TemplateData } from '@worm-vue3-print/core/designer'
import { h } from '../core/h'
import { renderDesignElement } from './elements'
import type { ShellCtx } from './controls'
import type { RulerGeom } from './ruler'

export interface CanvasUI {
  geom: RulerGeom
  marquee: { visible: boolean; x: number; y: number; w: number; h: number }
  contextMenu: { visible: boolean; x: number; y: number; flipX: number; flipY: number; targetId: string | null }
  guidePreview: { type: 'vertical' | 'horizontal'; position: number } | null
  overlayVisible: boolean
  overlayUrl: string | null
  overlayOpacity: number
  zoneResizing: 'header' | 'footer' | null
  scrollX: number
  scrollY: number
}

/** 三区矩形（mm，纸面坐标系）：上边距→页眉→内容→页脚→下边距（同 CanvasPaper.zoneRectsMM） */
export function zoneRectsMM(t: TemplateData, paper: { width: number; height: number }) {
  const m = t.margins
  const headerH = t.header?.height ?? 10
  const footerH = t.footer?.height ?? 10
  const contentW = paper.width - m.left - m.right
  return {
    header: { left: m.left, top: m.top, width: contentW, height: headerH },
    content: {
      left: m.left,
      top: m.top + headerH,
      width: contentW,
      height: paper.height - m.top - m.bottom - headerH - footerH,
    },
    footer: {
      left: m.left,
      top: paper.height - m.bottom - footerH,
      width: contentW,
      height: footerH,
    },
  }
}

const GRID_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M0 .5H20M.5 0V20" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1" stroke-dasharray="4 4"/></svg>'

function guideStyle(line: AlignLine, paper: { width: number; height: number }): Record<string, string> {
  return line.type === 'vertical'
    ? {
      left: `${line.position}mm`,
      top: '0',
      height: `${paper.height}mm`,
      borderLeftColor: line.color || 'var(--pd-accent-secondary, #f56c6c)',
    }
    : {
      top: `${line.position}mm`,
      left: '0',
      width: `${paper.width}mm`,
      borderTopColor: line.color || 'var(--pd-accent-secondary, #f56c6c)',
    }
}

function watermarkLayer(t: TemplateData, paper: { width: number; height: number }) {
  const layout = resolveWatermarkLayout(t.watermark, [], paper)
  if (!layout) return ''
  return h('div', { class: 'watermark-layer', style: { opacity: String(layout.opacity) } },
    layout.tiles.map(tile => h('svg', {
      class: 'watermark-tile',
      width: `${tile.widthMm}mm`,
      height: `${tile.heightMm}mm`,
      viewBox: `0 0 ${layout.tileWidthPx} ${layout.tileHeightPx}`,
      style: { left: `${tile.leftMm}mm`, top: `${tile.topMm}mm` },
    }, [h('text', {
      x: String(layout.tileWidthPx / 2),
      y: String(layout.tileHeightPx / 2),
      'font-size': String(layout.fontSizePx),
      fill: layout.color,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: `rotate(${layout.rotate},${layout.tileWidthPx / 2},${layout.tileHeightPx / 2})`,
      text: layout.text,
    })])))
}

function zoneLayer(ctx: ShellCtx, ui: CanvasUI, zone: 'header' | 'content' | 'footer',
  rect: { left: number; top: number; width: number; height: number }, els: RuntimeElement[],
  paper: { width: number; height: number }) {
  const s = ctx.store
  const children: unknown[] = []
  if (zone !== 'content') children.push(h('span', { class: 'zone-label', text: zone === 'header' ? '页眉' : '页脚' }))
  if (zone === 'content' && (s.templateData.firstPageOverlay?.height ?? 0) > 0) {
    children.push(h('div', {
      class: 'zone-overlay',
      style: { height: `${s.templateData.firstPageOverlay!.height}mm` },
    }, [h('span', { class: 'zone-label', text: '首页叠加' })]))
  }
  children.push(...els.map(el => renderDesignElement(ctx, el)))
  if (zone !== 'content') {
    const dir = zone === 'header' ? 'bottom' : 'top'
    children.push(h('div', {
      class: `zone-resize-handle handle-${dir}`,
      dataset: { zone },
      onMousedown: (ev: Event) => ctx.fire('zone-resize', { event: ev as MouseEvent, zone }),
    }, [ui.zoneResizing === zone
      ? h('div', {
        class: 'zone-height-tip',
        text: `${(zone === 'header' ? s.templateData.header.height : s.templateData.footer.height).toFixed(1)}mm`,
      })
      : '']))
  }
  return h('div', {
    class: `zone-layer zone-${zone} design-mode`,
    style: {
      position: 'absolute',
      left: `${rect.left}mm`,
      top: `${rect.top}mm`,
      width: `${rect.width}mm`,
      height: `${rect.height}mm`,
    },
    dataset: { zone, paperWidth: String(paper.width), paperHeight: String(paper.height) },
  }, children.filter(Boolean) as never)
}

export function renderCanvasArea(ctx: ShellCtx, ui: CanvasUI) {
  const s = ctx.store
  const t = s.templateData
  const paper = getPaperDimensions(t)
  const scale = (s.scale || 100) / 100
  const zones = zoneRectsMM(t, paper)
  const byZone = (zone: string) => (s.elements as RuntimeElement[]).filter(e => (e.zone || 'content') === zone)

  const content = h('div', {
    class: 'hiprint-printPaper-content',
    dataset: { content: '' },
    style: {
      padding: `${t.margins.top}mm ${t.margins.right}mm ${t.margins.bottom}mm ${t.margins.left}mm`,
      position: 'relative',
      boxSizing: 'border-box',
      minHeight: `${paper.height}mm`,
    },
  }, [
    s.showGrid ? h('div', {
      class: 'grid-bg',
      style: {
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(GRID_SVG)}")`,
        backgroundSize: '5mm 5mm',
        backgroundPosition: '0 0',
      },
    }) : '',
    ...((t.watermark && Object.keys(t.watermark).length) ? [watermarkLayer(t, paper)] : []),
    zoneLayer(ctx, ui, 'header', zones.header, byZone('header'), paper),
    zoneLayer(ctx, ui, 'content', zones.content, byZone('content'), paper),
    zoneLayer(ctx, ui, 'footer', zones.footer, byZone('footer'), paper),
    ...(s.adsorbGuides.map(line => h('div', {
      class: `adsorb-guide guide-${line.type}`,
      style: guideStyle(line, paper),
    }))),
    ...((t.guides ?? []).map(g => h('div', {
      class: `manual-guide guide-${g.type}`,
      style: { ...guideStyle(g, paper), '--guide-hit': `${8 / scale}px` },
      dataset: { guideId: String(g.id ?? '') },
      onMousedown: (ev: Event) => ctx.fire('guide-mousedown', { event: ev as MouseEvent, id: g.id }),
      onDblclick: (ev: Event) => { ev.preventDefault(); ctx.fire('guide-remove', g.id) },
    }))),
  ].filter(Boolean))

  const paperEl = h('div', {
    class: 'hiprint-printPaper',
    dataset: { test: 'paper' },
    style: {
      width: `${paper.width}mm`,
      minHeight: `${paper.height}mm`,
      background: t.pageBackground || 'var(--pd-paper, #fff)',
      boxShadow: 'var(--pd-shadow-paper, 0 1px 2px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08))',
      overflow: 'hidden',
      position: 'relative',
      transform: `scale(${scale})`,
      transformOrigin: '0 0',
    },
  }, [
    ...(t.designBackground?.src ? [h('div', {
      class: 'design-background',
      style: {
        width: `${paper.width}mm`,
        height: `${paper.height}mm`,
        left: '0',
        top: '0',
        transform: t.designBackground.rotation ? `rotate(${t.designBackground.rotation}deg)` : '',
      },
    }, [h('img', { src: t.designBackground.src, draggable: false, alt: '' })])] : []),
    content,
  ])

  const nodes: unknown[] = [
    h('div', { class: 'canvas-scroll' }, [
      h('div', {
        class: 'paper-wrapper',
        style: {
          width: `${mmToPx(paper.width) * scale}px`,
          height: `${mmToPx(paper.height) * scale}px`,
          position: 'relative',
        },
      }, [paperEl]),
      ui.overlayVisible && ui.overlayUrl
        ? h('div', { class: 'overlay-layer' }, [
          h('img', { class: 'overlay-image', src: ui.overlayUrl, style: { opacity: String(ui.overlayOpacity) } }),
        ])
        : '',
    ].filter(Boolean)),
  ]

  if (s.showRuler) {
    nodes.push(h('div', { class: 'ruler-overlay', style: { transform: `translate(${ui.scrollX}px, ${ui.scrollY}px)` } }, [
      h('div', { class: 'ruler-corner' }),
      h('canvas', {
        class: 'pd-ruler is-horizontal',
        dataset: { ruler: 'horizontal' },
        style: { width: `${ui.geom.viewW}px`, height: '20px' },
        onMousedown: (ev: Event) => ctx.fire('ruler-mousedown', { event: ev as MouseEvent, orientation: 'horizontal' }),
      }),
      h('canvas', {
        class: 'pd-ruler is-vertical',
        dataset: { ruler: 'vertical' },
        style: { width: '20px', height: `${ui.geom.viewH}px` },
        onMousedown: (ev: Event) => ctx.fire('ruler-mousedown', { event: ev as MouseEvent, orientation: 'vertical' }),
      }),
    ]))
  }

  if (ui.guidePreview) {
    nodes.push(h('div', {
      class: `ruler-guide-preview guide-${ui.guidePreview.type}`,
      style: ui.guidePreview.type === 'vertical'
        ? { left: `${ui.guidePreview.position}px`, top: '0', height: '100%' }
        : { top: `${ui.guidePreview.position}px`, left: '0', width: '100%' },
    }))
  }

  if (ui.marquee.visible) {
    nodes.push(h('div', {
      class: 'marquee-selection',
      style: { left: `${ui.marquee.x}px`, top: `${ui.marquee.y}px`, width: `${ui.marquee.w}px`, height: `${ui.marquee.h}px` },
    }))
  }

  if (ui.contextMenu.visible) {
    const menu = ui.contextMenu
    nodes.push(h('div', {
      class: 'context-menu',
      style: { left: `${ui.contextMenu.x + ui.contextMenu.flipX}px`, top: `${ui.contextMenu.y + ui.contextMenu.flipY}px` },
    }, ui.contextMenu.targetId
      ? [
        menuItem(ctx, menu, '复制', 'copy'),
        menuItem(ctx, menu, '剪切', 'cut'),
        menuItem(ctx, menu, '粘贴', 'paste', !s.hasClipboard),
        menuItem(ctx, menu, '删除', 'delete'),
        h('div', { class: 'context-menu-sep' }),
        menuItem(ctx, menu, '置顶', 'move-layer', false, 'top'),
        menuItem(ctx, menu, '上移', 'move-layer', false, 'up'),
        menuItem(ctx, menu, '下移', 'move-layer', false, 'down'),
        menuItem(ctx, menu, '置底', 'move-layer', false, 'bottom'),
      ]
      : [
        menuItem(ctx, menu, '粘贴', 'paste-at', !s.hasClipboard),
        menuItem(ctx, menu, '全选', 'select-all'),
        menuItem(ctx, menu, '取消选择', 'clear-selection'),
      ]))
  }

  return h('div', {
    class: 'canvas-area',
    dataset: { test: 'canvas-area' },
    onDragover: (ev: Event) => ev.preventDefault(),
    onDrop: (ev: Event) => ctx.fire('drop', ev as DragEvent),
    onMousedown: (ev: Event) => ctx.fire('canvas-mousedown', ev as MouseEvent),
    onMousemove: (ev: Event) => ctx.fire('canvas-mousemove', ev as MouseEvent),
    onMouseleave: () => ctx.fire('canvas-mouseleave'),
    onWheel: (ev: Event) => ctx.fire('wheel', ev as WheelEvent),
    onScroll: (ev: Event) => ctx.fire('scroll', ev as Event),
    onContextmenu: (ev: Event) => { ev.preventDefault(); ctx.fire('canvas-contextmenu', ev as MouseEvent) },
  }, nodes.filter(Boolean) as never)
}

function menuItem(ctx: ShellCtx, menu: CanvasUI['contextMenu'], label: string, action: string, disabled = false, arg?: unknown) {
  return h('div', {
    class: `context-menu-item${disabled ? ' disabled' : ''}`,
    text: label,
    // 与 canvas 的 emitAction 同口径：点击一律先收起菜单，再按守卫决定是否派发
    // （canvas 的置灰「粘贴」也收起，只是 handlePaste 里 if (hasClipboard) 拦住派发）
    onClick: () => {
      menu.visible = false
      if (!disabled) ctx.fire(action, arg)
      ctx.repaint()
    },
  })
}
