#!/usr/bin/env node
/**
 * 音画同步客观校验（可重复运行）：
 * 1) 每句字幕：起点附近应有语音（响度达标），起点前与终点后应处于停顿（响度达标）
 *    —— 用分段响度法，避免"句内逗号停顿"导致的 voiced 段索引错位误判
 * 2) 录像时长 − preRoll ≈ 场景总时长（片头偏移已被合成裁剪覆盖）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin, ffprobeBin } from './bin.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'out')
const timings = JSON.parse(readFileSync(join(OUT, 'timings.json'), 'utf8'))
const meta = JSON.parse(readFileSync(join(OUT, 'recording_meta.json'), 'utf8'))
let failed = false
const fail = (msg) => { console.error(`✗ ${msg}`); failed = true }

function meanVolume(file, ss, t) {
  const r = spawnSync(ffmpegBin, ['-v', 'info', '-ss', String(Math.max(0, ss)), '-t', String(t), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = String(r.stderr).match(/mean_volume:\s*(-?[\d.]+) dB/)
  return m ? +m[1] : -91
}

for (let i = 0; i < timings.scenes.length; i++) {
  const sc = timings.scenes[i]
  const audio = join(OUT, sc.audio)
  if (!existsSync(audio)) { fail(`场景${i + 1} 缺音频 ${sc.audio}`); continue }
  sc.sentences.forEach((s, k) => {
    const speech = meanVolume(audio, s.start + 0.1, 0.5)
    if (speech < -35) fail(`场景${i + 1} 句${k + 1} 字幕起点 ${s.start.toFixed(2)}s 处无语音（响度 ${speech}dB）`)
    if (s.start > 0.15) {
      const before = meanVolume(audio, s.start - 0.3, 0.2)
      if (before > -45) fail(`场景${i + 1} 句${k + 1} 起点前仍有语音残留（${(s.start - 0.3).toFixed(2)}s 响度 ${before}dB），字幕会滞后`)
    }
    const after = meanVolume(audio, s.end + 0.1, 0.25)
    if (after > -45 && s.end < sc.duration - 0.2) fail(`场景${i + 1} 句${k + 1} 终点 ${s.end.toFixed(2)}s 后仍在说话（响度 ${after}dB），字幕会抢跑`)
  })
  console.log(`场景${i + 1} ${sc.name}: ${sc.sentences.length} 句校验完成`)
}

const webmDur = +spawnSync(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(OUT, meta.video)], { encoding: 'utf8' }).stdout.trim()
const total = meta.scenes.reduce((s, x) => s + x.duration, 0)
if (meta.preRoll == null) fail('recording_meta.json 缺少 preRoll（需新版 record.mjs 重录）')
else {
  const slack = webmDur - meta.preRoll - total
  if (slack < -0.5 || slack > 2.5) fail(`片头裁剪后余量异常: webm ${webmDur.toFixed(2)} − preRoll ${meta.preRoll.toFixed(2)} − 场景合计 ${total.toFixed(2)} = ${slack.toFixed(2)}`)
  else console.log(`preRoll ${meta.preRoll.toFixed(2)}s 已记录；webm 余量 ${slack.toFixed(2)}s（尾部 0.8s 等待属正常）`)
}

console.log(failed ? '\n同步校验失败' : '\n同步校验通过')
process.exit(failed ? 1 : 0)
