// services/print-render/src/browser-pool.ts
// Browser 池化管理：信号量并发控制 + 健康探测 + 崩溃自动恢复

import { chromium, type Browser, type Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ─── 系统浏览器探测 ───
// 优先复用系统已安装的 Chromium/Chrome，避免 npx playwright install 下载。
// 顺序：环境变量 → PATH 查找 → 各平台常见安装路径；全部未命中再回退 Playwright 自带浏览器。

const SYSTEM_BROWSER_CANDIDATES: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

const PATH_BROWSER_NAMES: Record<string, string[]> = {
  darwin: ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'],
  linux: ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'microsoft-edge'],
  win32: ['chrome.exe', 'msedge.exe'],
}

/** 在 PATH（含 Windows PATHEXT）中查找可执行文件，返回绝对路径或 undefined */
function resolveFromPath(bin: string): string | undefined {
  const exeExts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')
    : ['']
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  for (const dir of dirs) {
    for (const ext of exeExts) {
      const candidate = path.join(dir, bin + ext)
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
      } catch {
        // ignore stat errors
      }
    }
  }
  return undefined
}

/** 解析系统中已存在的浏览器可执行路径；找不到返回 undefined */
function resolveSystemBrowser(): string | undefined {
  // 1. 环境变量显式指定（最高优先级）
  const envPath = process.env.PLAYWRIGHT_CHROME_PATH
  if (envPath) {
    if (fs.existsSync(envPath)) return envPath
    console.warn(`[BrowserPool] PLAYWRIGHT_CHROME_PATH 指向的文件不存在: ${envPath}，继续探测系统浏览器`)
  }

  // 2. PATH 查找（Linux 上 apt/snap 安装的 chromium 通常在 /usr/bin）
  for (const name of PATH_BROWSER_NAMES[process.platform] || []) {
    const found = resolveFromPath(name)
    if (found) return found
  }

  // 3. 各平台常见安装路径
  for (const candidate of SYSTEM_BROWSER_CANDIDATES[process.platform] || []) {
    if (fs.existsSync(candidate)) return candidate
  }

  return undefined
}

// ─── 内存检测 ───

function detectContainerMemoryMB(): number {
  const envVal = process.env.CONTAINER_MEMORY_MB
  if (envVal) {
    const parsed = parseInt(envVal, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }

  // cgroup v2
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf-8').trim()
    if (raw !== 'max') {
      const mb = Math.floor(parseInt(raw, 10) / (1024 * 1024))
      if (mb > 0) return mb
    }
  } catch {
    // ignore
  }

  // cgroup v1
  try {
    const raw = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf-8').trim()
    const mb = Math.floor(parseInt(raw, 10) / (1024 * 1024))
    if (mb > 0 && mb < 1_000_000) return mb
  } catch {
    // ignore
  }

  return 1024
}

// ─── BrowserPool ───

export class BrowserPool {
  private static instance: BrowserPool

  private browser: Browser | null = null
  private browserPromise: Promise<Browser> | null = null
  private activePages = 0
  private waitQueue: Array<(page: Page) => void> = []
  private maxConcurrent: number
  private shuttingDown = false

  private constructor() {
    const memoryMB = detectContainerMemoryMB()
    this.maxConcurrent = Math.max(1, Math.floor(memoryMB / 200))
    console.log(
      `[BrowserPool] maxConcurrent=${this.maxConcurrent} (memoryMB=${memoryMB})`,
    )
  }

  static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool()
    }
    return BrowserPool.instance
  }

  // ─── 公共 API ───

  /** 获取一个可用 Page（请求级绑定） */
  async acquire(): Promise<Page> {
    if (this.shuttingDown) {
      throw new Error('BrowserPool is shutting down')
    }

    // 信号量：超过并发上限则排队等待
    if (this.activePages >= this.maxConcurrent) {
      return new Promise<Page>((resolve) => {
        this.waitQueue.push(resolve)
      })
    }

    return this.createHealthyPage()
  }

  /** 归还 Page */
  async release(page: Page): Promise<void> {
    // 关闭当前 Page
    try {
      if (!page.isClosed()) {
        await page.close()
      }
    } catch {
      // ignore close errors
    }

    this.activePages--

    // 出队下一个等待者
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!
      try {
        const newPage = await this.createHealthyPage()
        next(newPage)
      } catch (err) {
        // 如果创建失败，将等待者 reject 通过传递错误
        // 但此处 next 只接受 resolve，所以直接抛出由全局处理
        console.error('[BrowserPool] Failed to create page for queued request:', err)
      }
    }
  }

  /** 当前活跃渲染数 */
  get activeCount(): number {
    return this.activePages
  }

  /** 最大并发数 */
  get concurrencyLimit(): number {
    return this.maxConcurrent
  }

  /** 排队等待数 */
  get queueLength(): number {
    return this.waitQueue.length
  }

  /** 优雅关闭 */
  async shutdown(): Promise<void> {
    this.shuttingDown = true
    if (this.browser) {
      try {
        await this.browser.close()
      } catch {
        // ignore
      }
      this.browser = null
    }
    this.browserPromise = null
  }

  // ─── 内部方法 ───

  /** 确保 Browser 实例可用，返回 Browser */
  private async ensureBrowser(): Promise<Browser> {
    // 已有可用 browser
    if (this.browser && this.browser.isConnected()) {
      return this.browser
    }

    // 正在创建中，等待结果
    if (this.browserPromise) {
      return this.browserPromise
    }

    // 创建新 browser
    this.browserPromise = this.launchBrowser()
    try {
      this.browser = await this.browserPromise
      this.browserPromise = null

      // 监听断开连接事件 → 自动重置
      this.browser.on('disconnected', () => {
        console.warn('[BrowserPool] Browser disconnected, will reset on next request')
        this.browser = null
        this.browserPromise = null
      })

      return this.browser
    } catch (err) {
      // 启动失败，清除 promise 以便下次重试
      this.browserPromise = null
      throw err
    }
  }

  private async launchBrowser(): Promise<Browser> {
    // 选择顺序：PLAYWRIGHT_CHROME_PATH → PATH 中的 chromium/chrome → 各平台常见安装路径 → Playwright 自带 Chromium
    const executablePath = resolveSystemBrowser()

    const opts: Parameters<typeof chromium.launch>[0] = {
      headless: true,
      args: [
        '--disable-dev-shm-usage', // Docker 中 /dev/shm 空间可能不足
        '--no-sandbox',             // 容器中可能需要
      ],
    }
    if (executablePath) {
      opts.executablePath = executablePath
      console.log(`[BrowserPool] 使用系统浏览器: ${executablePath}`)
    } else {
      // 根 .npmrc 默认 playwright_skip_browser_download=true，未装系统浏览器时这里会启动失败；
      // 提前抛出可读错误，避免 Playwright 原始的「Executable doesn't exist」误导排查。
      const bundledPath = chromium.executablePath()
      if (!bundledPath || !fs.existsSync(bundledPath)) {
        throw new Error(
          '[BrowserPool] 未找到可用浏览器：请安装系统 Chromium/Chrome（如 apt-get install chromium），'
          + '或设置 PLAYWRIGHT_CHROME_PATH 指向浏览器可执行文件；'
          + '也可执行 npx playwright install chromium 下载 Playwright 自带版本。',
        )
      }
      console.log(`[BrowserPool] 未找到系统浏览器，回退 Playwright 自带 Chromium: ${bundledPath}`)
    }
    return chromium.launch(opts)
  }

  /** 创建 Page 并通过健康探测 */
  private async createHealthyPage(): Promise<Page> {
    const browser = await this.ensureBrowser()
    const page = await browser.newPage()
    this.activePages++

    // 健康探测
    const healthy = await this.healthCheck(page)
    if (!healthy) {
      // Page 不可用，尝试关闭后重新创建
      try { await page.close() } catch { /* ignore */ }
      this.activePages--

      // Browser 本身可能有问题 → 重置后重试一次
      await this.resetBrowser()
      const retryBrowser = await this.ensureBrowser()
      const retryPage = await retryBrowser.newPage()
      this.activePages++

      const retryHealthy = await this.healthCheck(retryPage)
      if (!retryHealthy) {
        try { await retryPage.close() } catch { /* ignore */ }
        this.activePages--
        throw new Error('Browser health check failed after retry')
      }
      return retryPage
    }

    return page
  }

  /** 健康探测：3s 超时 */
  private async healthCheck(page: Page): Promise<boolean> {
    try {
      const result = await Promise.race([
        page.evaluate(() => true),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('health check timeout')), 3000),
        ),
      ])
      return result === true
    } catch {
      return false
    }
  }

  /** 重置 Browser（崩溃恢复） */
  private async resetBrowser(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close()
      } catch {
        // ignore
      }
      this.browser = null
    }
    this.browserPromise = null
  }
}
