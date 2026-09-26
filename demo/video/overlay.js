/* 注入到页面的演示叠加层：字幕条、跟随鼠标的大号指针、目标高亮框。
 * 仅顶层窗口注入；z-index 压过设计器与预览弹窗。录制时随画面一起被捕获。 */
;(function () {
  if (window.top !== window.self) return
  const Z = 2147483000

  function mount(html) {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild
  }

  function boot() {
    const style = mount(`<style>
      #__demo_subtitle {
        position: fixed; left: 50%; bottom: 56px; transform: translateX(-50%);
        max-width: 82%; padding: 13px 35px; border-radius: 16px;
        background: rgba(15, 18, 26, 0.78); color: #fff;
        font: 600 36px/1.5 -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        text-align: center; letter-spacing: 0.5px;
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
    </style>`)
    const subtitle = mount('<div id="__demo_subtitle"></div>')
    const cursor = mount('<div id="__demo_cursor"></div>')
    const highlight = mount('<div id="__demo_highlight"></div>')
    document.documentElement.append(style)
    document.body.append(subtitle, cursor, highlight)

    addEventListener('mousemove', (e) => {
      cursor.style.opacity = '1'
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
    }, true)
    addEventListener('mousedown', () => cursor.classList.add('clicking'), true)
    addEventListener('mouseup', () => cursor.classList.remove('clicking'), true)

    window.__demoOverlay = {
      setSubtitle(text) {
        subtitle.textContent = text || ''
        subtitle.style.opacity = text ? '1' : '0'
      },
      highlightRect(x, y, w, h) {
        Object.assign(highlight.style, { left: x - 8 + 'px', top: y - 8 + 'px', width: w + 16 + 'px', height: h + 16 + 'px' })
        highlight.classList.add('on')
      },
      clearHighlight() {
        highlight.classList.remove('on')
      },
    }
  }

  if (document.body) boot()
  else addEventListener('DOMContentLoaded', boot, { once: true })
})()
