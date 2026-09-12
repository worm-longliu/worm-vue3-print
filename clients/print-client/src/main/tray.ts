// 系统托盘：显示端口状态、测试打印、设置（Task 13 接入）、退出。
import { Tray, Menu, nativeImage } from 'electron'

export interface TrayDeps {
  getPort: () => number
  testPrint: (printerName?: string) => Promise<void>
  showSettings: () => void
  quit: () => void
}

// 1x1 透明图标占位；正式图标资源后续补充（各平台建议 16/32@2x png 或 Template 图）。
const EMPTY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

export function createTray(deps: TrayDeps): Tray {
  const tray = new Tray(nativeImage.createFromDataURL(EMPTY_PNG_DATA_URL))
  tray.setToolTip('worm-vue3-print 静默打印客户端')

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `监听端口：${deps.getPort()}`, enabled: false },
      { type: 'separator' },
      {
        label: '测试打印（默认打印机）',
        click: () => {
          void deps.testPrint().catch(() => {})
        },
      },
      { label: '设置…', click: () => deps.showSettings() },
      { type: 'separator' },
      { label: '退出', click: () => deps.quit() },
    ]),
  )

  return tray
}
