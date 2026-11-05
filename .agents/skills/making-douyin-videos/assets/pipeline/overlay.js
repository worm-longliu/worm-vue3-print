/* 注入到页面的演示叠加层：字幕条、跟随鼠标的大号指针、目标高亮框。
 * 仅顶层窗口注入；z-index 压过设计器与预览弹窗。录制时随画面一起被捕获。
 * 关键约束：showImage 步骤用 page.setContent 换文档，window 上的 API 还在但节点会被带走，
 * 所以三个节点都按「用之前确保挂在当前 document 上」处理（ensureNodes 幂等）。 */
;(function () {
  if (window.top !== window.self) return
  const Z = 2147483000

  const STYLE = `<style id="__demo_style">
      #__demo_subtitle {
        position: fixed; left: 50%; bottom: 64px; transform: translateX(-50%);
        max-width: 76%; padding: 11px 30px; border-radius: 14px;
        background: rgba(15, 18, 26, 0.78); color: #fff;
        font: 600 30px/1.5 -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        text-align: center; letter-spacing: 0.5px; white-space: pre-line;
        text-shadow: 0 1px 2px rgba(0,0,0,.6);
        opacity: 0; transition: opacity .18s ease; pointer-events: none; z-index: ${Z + 2};
      }
      #__demo_cursor {
        position: fixed; width: 34px; height: 34px; margin: -5px 0 0 -5px;
        border-radius: 50%; background: rgba(88, 148, 255, 0.9);
        border: 4px solid #fff; box-shadow: 0 0 13px rgba(0,0,0,.45);
        pointer-events: none; z-index: ${Z + 3}; opacity: 0; transition: opacity .3s;
      }
      #__demo_cursor.clicking { transform: scale(0.62); }
      #__demo_highlight {
        position: fixed; border: 4px solid #ffb020; border-radius: 13px;
        box-shadow: 0 0 0 5px rgba(255, 176, 32, 0.25), 0 0 29px rgba(255, 176, 32, 0.5);
        pointer-events: none; z-index: ${Z + 1}; opacity: 0; transition: opacity .25s;
      }
      #__demo_highlight.on { opacity: 1; animation: __demo_pulse 1.1s ease-in-out infinite; }
      @keyframes __demo_pulse {
        0%, 100% { box-shadow: 0 0 0 4px rgba(255,176,32,.25), 0 0 22px rgba(255,176,32,.5); }
        50% { box-shadow: 0 0 0 9px rgba(255,176,32,.14), 0 0 30px rgba(255,176,32,.65); }
      }
    </style>`

  const nodes = {}

  function ensureNodes() {
    if (!document.body) return null
    if (document.getElementById('__demo_subtitle')) {
      nodes.subtitle = document.getElementById('__demo_subtitle')
      nodes.cursor = document.getElementById('__demo_cursor')
      nodes.highlight = document.getElementById('__demo_highlight')
      return nodes
    }
    const mk = (html) => {
      const host = document.createElement('div')
      host.innerHTML = html
      return host.firstElementChild
    }
    if (!document.getElementById('__demo_style')) document.body.insertAdjacentHTML('afterbegin', STYLE.replace('<style>', '<style id="__demo_style">'))
    nodes.subtitle = mk('<div id="__demo_subtitle"></div>')
    nodes.cursor = mk('<div id="__demo_cursor"></div>')
    nodes.highlight = mk('<div id="__demo_highlight"></div>')
    document.body.append(nodes.subtitle, nodes.cursor, nodes.highlight)
    return nodes
  }

  function lastText() {
    return window.__lastSubtitle || ''
  }

  addEventListener(
    'mousemove',
    (e) => {
      const n = ensureNodes()
      if (!n || !n.cursor) return
      n.cursor.style.opacity = '1'
      n.cursor.style.left = e.clientX + 'px'
      n.cursor.style.top = e.clientY + 'px'
    },
    true,
  )
  addEventListener('mousedown', () => ensureNodes()?.cursor?.classList.add('clicking'), true)
  addEventListener('mouseup', () => ensureNodes()?.cursor?.classList.remove('clicking'), true)

  window.__demoOverlay = {
    setSubtitle(text) {
      window.__lastSubtitle = text || ''
      const n = ensureNodes()
      if (!n || !n.subtitle) return
      n.subtitle.textContent = text || ''
      n.subtitle.style.opacity = text ? '1' : '0'
    },
    highlightRect(x, y, w, h) {
      const n = ensureNodes()
      if (!n || !n.highlight) return
      Object.assign(n.highlight.style, { left: x - 8 + 'px', top: y - 8 + 'px', width: w + 16 + 'px', height: h + 16 + 'px' })
      n.highlight.classList.add('on')
    },
    clearHighlight() {
      ensureNodes()?.highlight?.classList.remove('on')
    },
  }

  ensureNodes()
  document.addEventListener('DOMContentLoaded', ensureNodes, { once: true })
})()
