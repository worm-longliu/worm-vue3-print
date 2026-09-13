// 系统托盘：显示端口状态、测试打印、设置、退出。
import { Tray, Menu } from 'electron'
import { createTrayIcon } from './tray-icon.js'

export interface TrayDeps {
  getPort: () => number
  testPrint: (printerName?: string) => Promise<void>
  showSettings: () => void
  quit: () => void
}

export function createTray(deps: TrayDeps): Tray {
  const tray = new Tray(createTrayIcon())
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
  // macOS 左键单击直接打开设置窗口（并重建菜单以刷新端口显示）
  tray.on('click', () => deps.showSettings())
  return tray
}
