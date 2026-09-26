#!/usr/bin/env node
/**
 * 合成成品视频：out/cover.png（片头）+ out/voice/scene-N.mp3 + out/video_raw.webm → out/video_final.mp4
 * - 开头拼 3s 封面片头（静帧 + 静音轨，0.5s 淡入淡出），缺失 cover.png 时先跑 video:cover
 * - 每场景音频用 apad 补齐到录制实际时长（步骤超时也不影响音画对齐）
 * - 片头与正文经同一 filter_complex 拼混流为 H.364（30fps / yuv420p）
 * - 顺带导出 out/subtitles.srt 便于上传平台挂轨（时间轴已计入片头偏移）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin, ensureBins } from './bin.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')
const TMP_DIR = join(OUT_DIR, 'tmp')
ensureBins()

const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))
const meta = JSON.parse(readFileSync(join(OUT_DIR, 'recording_meta.json'), 'utf8'))
const script = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8'))

if (timings.scenes.length !== meta.scenes.length) {
  console.error(`场景数不一致：timings ${timings.scenes.length} vs recording ${meta.scenes.length}`)
  process.exit(1)
}

function ff(args) {
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

rmSync(TMP_DIR, { recursive: true, force: true })
mkdirSync(TMP_DIR, { recursive: true })

const SRT_HOP = 0.12 // 字幕前后各留一点呼吸
const INTRO = 3 // 片头封面时长（秒），正文与字幕轨整体后移

function fmtTime(sec) {
  const ms = Math.round(sec * 1000)
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')
  const t = String(ms % 1000).padStart(3, '0')
  return `${h}:${m}:${s},${t}`
}

let cursor = INTRO
const srtLines = []
const concatList = []
for (let i = 0; i < timings.scenes.length; i++) {
  const t = timings.scenes[i]
  const actual = meta.scenes[i].duration
  const padded = join(TMP_DIR, `scene-${i}.wav`)
  ff(['-i', join(OUT_DIR, t.audio), '-filter:a', 'apad', '-t', String(actual), '-ar', '44100', '-ac', '2', padded])
  concatList.push(`file '${padded.replace(/\\/g, '/')}'`)
  for (const s of t.sentences) {
    srtLines.push(
      `${srtLines.length / 4 + 1}`,
      `${fmtTime(cursor + Math.max(0, s.start - SRT_HOP))} --> ${fmtTime(cursor + s.end + SRT_HOP)}`,
      s.text,
      '',
    )
  }
  cursor += actual
  console.log(`[${i + 1}/${timings.scenes.length}] ${t.name}：音频补齐 ${t.duration.toFixed(1)}s → ${actual.toFixed(1)}s`)
}

const listFile = join(TMP_DIR, 'list.txt')
writeFileSync(listFile, concatList.join('\n'))
const fullAudio = join(TMP_DIR, 'audio_full.wav')
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', fullAudio])

const finalMp4 = join(OUT_DIR, 'video_final.mp4')
const coverPng = join(OUT_DIR, 'cover.png')
if (!existsSync(coverPng)) {
  console.error(`缺少片头封面 ${coverPng}，请先运行：npm run video:cover -w @worm-vue3-print/demo`)
  process.exit(1)
}
const preRoll = Number(meta.preRoll || 0)
const { width: W, height: H } = script.video
ff([
  '-loop', '1', '-t', String(INTRO), '-i', coverPng,
  '-f', 'lavfi', '-t', String(INTRO), '-i', 'anullsrc=r=44100:cl=stereo',
  ...(preRoll > 0 ? ['-ss', String(preRoll)] : []), '-i', join(OUT_DIR, meta.video),
  '-i', fullAudio,
  '-filter_complex',
  `[0:v]fps=30,scale=${W}:${H},setsar=1,fade=t=in:st=0:d=0.5,fade=t=out:st=${INTRO - 0.5}:d=0.5,format=yuv420p[v0];` +
    `[2:v]fps=30,scale=${W}:${H},setsar=1,format=yuv420p[v1];` +
    `[v0][1:a][v1][3:a]concat=n=2:v=1:a=1[v][a]`,
  '-map', '[v]', '-map', '[a]',
  '-t', String(+cursor.toFixed(3)),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
  '-movflags', '+faststart',
  finalMp4,
])

writeFileSync(join(OUT_DIR, 'subtitles.srt'), srtLines.join('\n'))
rmSync(TMP_DIR, { recursive: true, force: true })
console.log(`\n成品：${finalMp4}（总时长 ${cursor.toFixed(1)}s，4:3 ${script.video.width}×${script.video.height}）`)
console.log(`字幕：${join(OUT_DIR, 'subtitles.srt')}`)
