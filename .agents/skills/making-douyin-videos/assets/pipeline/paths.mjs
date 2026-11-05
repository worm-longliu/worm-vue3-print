/**
 * 多剧本流水线路径解析：
 * - 环境变量 VIDEO_SCRIPT 指定 video/ 下的剧本文件名，默认 script.json
 * - 输出目录：script.json → out/；script-<key>.json → out/<key>/
 * - 画幅口径：script.video = { width, height, margin }
 *   margin 为抖音安全留白（左右各一条黑边），内容台 = 画布宽 − 2×margin，
 *   录制按内容台尺寸出图，合成期补黑边到画布尺寸，画面全程不缩放、不拉伸。
 */
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.env.VIDEO_SCRIPT || 'script.json'
export const SCRIPT_PATH = name.startsWith('/') ? name : join(__dirname, name)
const m = basename(SCRIPT_PATH).match(/^script-(.+)\.json$/)
const KEY = m ? m[1] : ''
// 产物目录：优先按 out-registry.json 的「日期-主题」登记（out/2026-10-27-vue3-integration 这类），
// 登记表里没有的新剧本回落到 out/<key>，跑完再登记即可。
const portraitScript = basename(dirname(SCRIPT_PATH)) === 'portrait'
let dir = join(__dirname, portraitScript ? 'portrait/out' : 'out', KEY)
try {
  const reg = JSON.parse(readFileSync(join(__dirname, 'out-registry.json'), 'utf8'))
  if (KEY && reg[KEY]) dir = join(__dirname, reg[KEY])
} catch {}
export const OUT_DIR = dir
export const OUT_KEY = KEY

let video = { width: 1920, height: 1080, margin: 0 }
try {
  video = { ...video, ...JSON.parse(readFileSync(SCRIPT_PATH, 'utf8')).video }
} catch {}

export const MARGIN = video.margin
export const CANVAS = { width: video.width, height: video.height }
export const STAGE = { width: video.width - video.margin * 2, height: video.height }
