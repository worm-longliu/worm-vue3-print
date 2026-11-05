// 应用入口：单实例 → 加载配置/日志 → 渲染池 → 打印引擎 → 回环 HTTP+WS 服务（含 /mcp）→ 托盘驻留。
import { app, Menu } from 'electron'
import { join } from 'node:path'
import { APP_ID } from '@worm-vue3-print/core/client'
import { ConfigStore, generatePairingToken } from './config.js'
import { Logger } from './logger.js'
import { JobHistoryStore } from './job-history.js'
import { getPrintHostWindow, destroyPrintHostWindow } from './print-host.js'
import { PrinterService } from './printer-service.js'
import { PrintEngine, createPrintRuntime } from './print-engine.js'
import { createTemplateRenderer } from './template-renderer.js'
import { createImageReader } from './image-reader.js'
import { buildPdfOutputPolicy, type PdfOutputPolicy } from './pdf-output.js'
import { WsServer } from './ws-server.js'
import { TemplateSessionRegistry } from './template-sessions.js'
import { createMcpRequestHandler } from './mcp-host.js'
import { checkAccess } from './security.js'
import { makeMessageHandler } from './protocol-handler.js'
import { createTray } from './tray.js'
import { MainWindowManager } from './main-window.js'
import { applyAutoStart } from './auto-start.js'
import { TEST_TEMPLATE } from './test-template.js'

let quitting = false
let mainWindow: MainWindowManager | null = null

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // 窗口全部关闭也驻留托盘（设置窗口关闭同理）
  app.on('window-all-closed', () => {
    // 保留默认行为时 Electron 会退出全部窗口的应用；这里显式驻留
  })

  app
    .whenReady()
    .then(async () => {
      // 驻留托盘的应用不需要 File/Edit/View/Window 菜单栏；macOS 保留默认菜单——
      // 应用菜单是 mac 的退出/隐藏与标准快捷键入口，去掉后不合平台惯例。
      if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

      const userData = app.getPath('userData')
      const configStore = new ConfigStore(join(userData, 'config.json'))
      configStore.load()
      if (
        (configStore.current.securityEnabled || configStore.current.mcpEnabled)
        && !configStore.current.pairingToken
      ) {
        configStore.update({ pairingToken: generatePairingToken() })
      }

      const logger = new Logger({
        level: configStore.current.logLevel,
        filePath: join(userData, 'logs', 'client.log'),
      })

      const history = new JobHistoryStore(join(userData, 'jobs.jsonl'), 500)
      // 打印机枚举走常驻隐藏窗口（托盘应用可能没有其它窗口存活）
      const printerService = new PrinterService(() => getPrintHostWindow().webContents.getPrintersAsync())
      // 保留生成的 PDF（排查颜色/方向等问题用）：目录留空则落在 userData/pdf
      const resolvePdfPolicy = (): PdfOutputPolicy =>
        buildPdfOutputPolicy(configStore.current, userData)
      const resolvePdfDir = (): string => resolvePdfPolicy().dir
      const printEngine = new PrintEngine({
        printerService,
        runtime: createPrintRuntime(),
        history,
        logger,
        pdfOutput: resolvePdfPolicy,
      })
      // 视觉回读通路：与打印引擎共用同一个 core runtime（core 会话内部每任务独立隐藏窗口）
      const renderBridge = createTemplateRenderer({ runtime: createPrintRuntime(), logger })
      // 参考图测量通路：本地图片解码（nativeImage）供 analyze/compare 工具使用
      const imageReader = createImageReader({ logger })

      let actualPort = 0
      // 模板会话注册表：attach/detach 来自浏览器，get/apply 供 MCP 工具实时读写
      const templateSessions = new TemplateSessionRegistry(logger)
      const server = new WsServer({
        preferredPort: configStore.current.port,
        handler: makeMessageHandler({
          appId: APP_ID,
          version: app.getVersion(),
          getPort: () => actualPort,
          printerService,
          printEngine,
          templateSessions,
        }),
        checkAccess: input => checkAccess(input, configStore.current),
        handleMcp: createMcpRequestHandler({
          isMcpEnabled: () => configStore.current.mcpEnabled,
          getPairingToken: () => configStore.current.pairingToken,
          version: app.getVersion(),
          templateSessions,
          renderBridge,
          imageReader,
          logger,
        }),
        logger,
      })
      actualPort = await server.start()
      templateSessions.connectBroker({
        request: (ws, type, payload, timeoutMs) => server.requestClient(ws, type, payload, timeoutMs),
        rejectPendingsOf: (ws, message) => server.rejectPendingsOf(ws, message),
      })

      const testPrint = async (printerName?: string) => {
        await printEngine.submit({
          templateJson: TEST_TEMPLATE,
          printData: {},
          print: { printerName },
        })
      }

      // Task 13 将替换此占位为创建配置窗口
      mainWindow = new MainWindowManager({
        configStore,
        logger,
        history,
        printerService,
        printEngine,
        getPort: () => server.port,
        getPdfDir: resolvePdfDir,
        templateSessions,
      })
      mainWindow.registerIpc()
      mainWindow.bindPushEvents()
      const showSettings = () => mainWindow?.show()
      app.on('second-instance', () => mainWindow?.show())
      // macOS 点击 Dock 图标时唤起设置窗口
      app.on('activate', () => mainWindow?.show())
      createTray({
        getPort: () => server.port,
        testPrint,
        showSettings,
        quit: () => app.quit(),
      })

      applyAutoStart(app, configStore.current.autoStart, logger)
      logger.info('客户端启动完成', { port: actualPort, version: app.getVersion() })
      // 绿色版启动即打开设置窗口（应用同时驻留托盘，关闭窗口仅隐藏）
      mainWindow.show()

      app.on('before-quit', e => {
        if (quitting) return
        e.preventDefault()
        quitting = true
        void (async () => {
          templateSessions.stop()
          await server.stop().catch(() => {})
          destroyPrintHostWindow()
          app.exit(0)
        })()
      })
    })
    .catch(err => {
      console.error('启动失败：', err)
      app.quit()
    })
}
