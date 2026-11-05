/**
 * 竖屏多剧本流水线路径解析（口径对齐 video/paths.mjs）：
 * - 环境变量 VIDEO_SCRIPT 指定 portrait/ 下的剧本文件名，默认 script.json
 * - script.json → out/；script-<key>.json → out/<key>/
 * - 卡片 HTML 由剧本 `cards` 字段指定（相对本目录），缺省 cards.html
 */
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.env.VIDEO_SCRIPT || 'script.json'
export const PORTRAIT_DIR = __dirname
export const SCRIPT_PATH = name.startsWith('/') ? name : resolve(__dirname, name)
export const SCRIPT_KEY = basename(SCRIPT_PATH).match(/^script-(.+)\.json$/)?.[1] ?? ''
export const OUT_DIR = join(__dirname, 'out', SCRIPT_KEY)
