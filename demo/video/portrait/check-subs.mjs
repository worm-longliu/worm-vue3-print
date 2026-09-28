import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin } from '../bin.mjs'

/**
 * 字幕烧录取证。成品 GOP ~8s，用 -ss 抽帧会落到同一关键帧，故整片无 seek 扫描；
 * 参照物不是卡片 PNG，而是「同一张图走同一条 x264/yuv420p 链路」的重编码帧，
 * 色域（limited range）与编码偏移因此完全抵消，帧亮度减参照即字幕墨量。
 */
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')
const BAND = 'crop=1080:260:0:1540'
const HOP = 0.12
const LOG = '/tmp/portrait-subs-scan.log'

function scan(input, vf) {
  rmSync(LOG, { force: true })
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-i', input, '-vf', `${vf},signalstats,metadata=mode=print:file=${LOG}`, '-an', '-f', 'null', '-'], { stdio: 'ignore' })
  return [...readFileSync(LOG, 'utf8').matchAll(/frame:(\d+).*?YAVG=([\d.]+)/gs)].map((m) => ({ i: +m[1], y: +m[2] }))
}

const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))

const ref = timings.scenes.map((_, i) => {
  const ctl = `/tmp/portrait-ctl-${i}.mp4`
  rmSync(ctl, { force: true })
  execFileSync(ffmpegBin, [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', join(OUT_DIR, 'cards', `scene-${i}.png`),
    '-frames:v', '1', '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ctl,
  ], { stdio: 'ignore' })
  const y = scan(ctl, BAND)[0].y
  rmSync(ctl, { force: true })
  return y
})

const frames = scan(join(OUT_DIR, 'portrait.mp4'), `fps=10,${BAND}`)
let off = 0
const span = timings.scenes.map((sc) => { const a = off; off += sc.duration; return [a, off] })
const wins = []
off = 0
for (const sc of timings.scenes) {
  for (const s of sc.sentences) wins.push([off + Math.max(0, s.start - HOP), off + s.end + HOP])
  off += sc.duration
}

let sum = 0, n = 0, bare = []
for (const fr of frames) {
  const t = fr.i / 10
  const si = span.findIndex(([a, b]) => t >= a && t < b)
  if (si < 0 || !wins.some(([a, b]) => t >= a && t <= b)) continue
  if (t < span[si][0] + 0.3) continue // 场景首帧有 0.25s 淡入，会整体压暗，不参与墨量判定
  const ink = fr.y - ref[si]
  sum += ink; n++
  if (ink < 0.5) bare.push(+t.toFixed(2))
}
console.log(`无字幕参照：${ref.map((r) => r.toFixed(1)).join(' / ')}`)
console.log(`字幕窗口内 ${n} 帧：平均墨量 ${(sum / n).toFixed(2)}，无墨帧 ${bare.length} 个 ${bare.length ? `@ ${bare.slice(0, 8).join(', ')}` : ''}`)
console.log(`（采样时刻取整到 0.1s，窗口首尾 ±0.1s 内出现无墨帧属正常量化误差）`)
if (n < timings.scenes.length * 5) { console.error('✗ 取样帧过少，检查字幕时间轴'); process.exit(1) }
if (sum / n < 1) { console.error('✗ 字幕疑似未烧录（整体无墨量）'); process.exit(1) }
if (bare.length / n > 0.06) { console.error('✗ 窗口内大面积无墨，字幕时间轴与音频不符'); process.exit(1) }
console.log('✓ 字幕已烧录：窗口内平均墨量显著，无墨帧占比在量化误差内')
