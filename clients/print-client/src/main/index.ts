import { app, BrowserWindow } from 'electron'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 800, height: 600 })
    win.loadURL('data:text/html,<meta charset="utf-8">worm-vue3-print 客户端骨架启动成功')
  })
}
