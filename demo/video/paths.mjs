/**
 * 多剧本流水线路径解析：
 * - 环境变量 VIDEO_SCRIPT 指定 video/ 下的剧本文件名，默认 script.json
 * - 输出目录：script.json → out/；script-<key>.json → out/<key>/
 */
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const name = process.env.VIDEO_SCRIPT || 'script.json'
export const SCRIPT_PATH = name.startsWith('/') ? name : join(__dirname, name)
const m = basename(SCRIPT_PATH).match(/^script-(.+)\.json$/)
export const OUT_DIR = join(__dirname, 'out', m ? m[1] : '')
