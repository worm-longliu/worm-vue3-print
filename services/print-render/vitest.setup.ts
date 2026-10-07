// 集成用例的 30s 预算是「一次渲染」的量级，但浏览器是懒启动的：首个用例要替 Chromium 冷启动买单
// （GitHub runner 上首启 /usr/bin/chromium 实测 26–31s，直接顶破 30s；同文件后续用例只要 0.3–2.2s）。
// 在 setup 阶段先把浏览器拉起来，让冷启动成本落在用例计时之外。预热自身给足预算，不掩盖真实回归。
import { beforeAll } from 'vitest'
import { BrowserPool } from './src/browser-pool.js'

beforeAll(async () => {
  const pool = BrowserPool.getInstance()
  const page = await pool.acquire()
  await pool.release(page)
}, 180_000)
