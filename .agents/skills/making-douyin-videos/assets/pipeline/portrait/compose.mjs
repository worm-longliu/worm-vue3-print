#!/usr/bin/env node
/**
 * 合成竖屏成品：out/cards/scene-N.png + out/voice/scene-N.wav → out/portrait.mp4（1080×1920）
 * - 每场景静帧 + 配音（apad 补齐到场景时长），逐段编码后 concat
 * - 字幕用自生成 ASS（PlayRes 取画布尺寸；字号与底边距由剧本 `subtitle` 决定，
 *   缺省 64 / MarginV 260，与卡片内容带不重叠且避开抖音右侧按钮与底部文案区）
 * - 同时导出 subtitles.srt，供平台上传挂轨
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ffmpegBin, ensureBins } from '../bin.mjs'
import { OUT_DIR, SCRIPT_PATH } from './paths.mjs'

const TMP_DIR = join(OUT_DIR, 'tmp')
const SRT_HOP = 0.12

ensureBins()
const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))
const { width: W, height: H, fps } = script.video
const SUB = { fontsize: 64, marginV: 260, ...(script.subtitle || {}) }

rmSync(TMP_DIR, { recursive: true, force: true })
mkdirSync(TMP_DIR, { recursive: true })

function ff(args) {
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

function pad(sec) {
  const ms = Math.round(sec * 1000)
  return [Math.floor(ms / 3600000), Math.floor((ms % 3600000) / 60000), Math.floor((ms % 60000) / 1000)]
    .map((v) => String(v).padStart(2, '0'))
    .join(':')
}
function tenths(sec) {
  // 必须与 pad() 同源：pad() 的秒字段对「四舍五入到 ms」后取 floor，
  // 这里若改用 Math.round(sec*100)%100，x.995~x.999 会让百分秒进位而秒不进位，
  // 事件结束时刻被写成早 1 秒（实测表现为字幕整段提前消失）。
  const ms = Math.round(sec * 1000)
  return String(Math.floor((ms % 1000) / 10)).padStart(2, '0')
}
function srtTime(sec) {
  const ms = Math.round(sec * 1000)
  return `${pad(sec)},${String(ms % 1000).padStart(3, '0')}`
}

const segments = []
const srt = []
const assEvents = []
let cursor = 0

for (let i = 0; i < timings.scenes.length; i++) {
  const t = timings.scenes[i]
  const png = join(OUT_DIR, 'cards', `scene-${i}.png`)
  const wav = join(OUT_DIR, t.audio)
  const seg = join(TMP_DIR, `seg-${i}.mp4`)
  ff([
    '-loop', '1', '-t', String(t.duration), '-i', png,
    '-i', wav,
    '-filter_complex',
    `[0:v]fps=${fps},scale=${W}:${H},setsar=1,fade=t=in:st=0:d=0.25,format=yuv420p[v];` +
      `[1:a]apad,atrim=0:${t.duration}[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    seg,
  ])
  segments.push(`file '${seg.replace(/\\/g, '/')}'`)
  for (const s of t.sentences) {
    const st = cursor + Math.max(0, s.start - SRT_HOP)
    const en = cursor + s.end + SRT_HOP
    srt.push(`${srt.length / 4 + 1}`, `${srtTime(st)} --> ${srtTime(en)}`, s.text, '')
    assEvents.push(`Dialogue: 0,${pad(st)}.${tenths(st)},${pad(en)}.${tenths(en)},Default,,0,0,0,,${s.text.replace(/[{}]/g, '').replaceAll('\n', '\\N')}`)
  }
  cursor += t.duration
  console.log(`[${i + 1}/${timings.scenes.length}] ${t.name} ${t.duration.toFixed(1)}s`)
}

const ass = [
  '[Script Info]',
  'ScriptType: v4.00+',
  `PlayResX: ${W}`,
  `PlayResY: ${H}`,
  'WrapStyle: 0',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  `Style: Default,Hiragino Sans GB,${SUB.fontsize},&H00F8FAFC,&H000B1120,&H80000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,${SUB.marginV},1`,
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ...assEvents,
].join('\n')
const assPath = join(TMP_DIR, 'subs.ass')
writeFileSync(assPath, ass, 'utf8')

const listFile = join(TMP_DIR, 'list.txt')
writeFileSync(listFile, segments.join('\n'))
const concatPath = join(TMP_DIR, 'concat.mp4')
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatPath])

const finalMp4 = join(OUT_DIR, 'portrait.mp4')
ff([
  '-i', concatPath,
  '-filter_complex', `[0:v]ass=${assPath.replace(/:/g, '\\:')}[v];[0:a]loudnorm=I=-15:TP=-1.2:LRA=11,aresample=44100[a]`,
  '-map', '[v]', '-map', '[a]',
  '-t', String(+cursor.toFixed(3)), // loudnorm 会多出 ~0.1s 预热，按视频总长裁齐，避免尾部空白
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', finalMp4,
])

writeFileSync(join(OUT_DIR, 'subtitles.srt'), srt.join('\n'))
rmSync(TMP_DIR, { recursive: true, force: true })
console.log(`\n成品：${finalMp4}（${W}×${H}，总时长 ${cursor.toFixed(1)}s）`)
