#!/usr/bin/env node
/**
 * 多音字听审片段：从各场景配音轨里切出「字幕原文 ≠ 喂引擎文本」的那些句子，拼成一个试听文件。
 * 同音替换是为绕开 Edge TTS 不认 SSML 才做的，最终读音必须人耳确认——这个文件把需要确认的句子
 * 集中起来（通常 10~20 句），不用听完整片。
 * 用法：cd .video && VIDEO_SCRIPT=script-<key>.json node polyphone-audio.mjs
 * 产物：out/<key>/polyphone-audio.m4a + polyphone-audio.txt（句子清单，带原文/喂引擎两行对照）
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ffmpegBin, ensureBins } from './bin.mjs'
import { SCRIPT_PATH, OUT_DIR } from './paths.mjs'

ensureBins()
const poly = JSON.parse(readFileSync(join(OUT_DIR, 'polyphone.json'), 'utf8'))
const timingsPath = join(OUT_DIR, 'timings.json')
if (!existsSync(timingsPath)) {
  console.error('缺 timings.json，请先跑 video:voice')
  process.exit(1)
}
const timings = JSON.parse(readFileSync(timingsPath, 'utf8'))
const TMP = join(OUT_DIR, 'tmp-audio')
rmSync(TMP, { recursive: true, force: true })
const files = []
mkdirSync(TMP, { recursive: true })
const lines = ['# 多音字听审清单（只列发生过替换/字面替换的句子）', '']

for (let i = 0; i < poly.scenes.length; i++) {
  const sent = poly.scenes[i].sentences
  const timed = timings.scenes[i].sentences
  if (sent.length !== timed.length) {
    console.error(`场景 ${i + 1} 句数不一致：polyphone ${sent.length} vs timings ${timed.length}`)
    process.exit(1)
  }
  for (let j = 0; j < sent.length; j++) {
    if (sent[j].display === sent[j].say) continue
    const wav = join(OUT_DIR, timings.scenes[i].audio)
    const out = join(TMP, `s${i}-${j}.wav`)
    execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav,
      '-af', `atrim=${Math.max(0, timed[j].start - 0.12)}:${timed[j].end + 0.12},asetpts=PTS-STARTPTS,adelay=200|200`,
      '-ar', '44100', '-ac', '2', out], { stdio: 'ignore' })
    files.push(out)
    lines.push(`- 场景${i + 1} 句${j + 1}`)
    lines.push(`  - 字幕（画面/SRT）：${sent[j].display}`)
    lines.push(`  - 喂引擎（实际合成）：${sent[j].say}`)
  }
}
if (!files.length) {
  console.log('本片没有需要听审的替换句')
  process.exit(0)
}
writeFileSync(join(TMP, 'list.txt'), files.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'))
const dst = join(OUT_DIR, 'polyphone-audio.m4a')
execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(TMP, 'list.txt'),
  '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', dst], { stdio: 'ignore' })
writeFileSync(join(OUT_DIR, 'polyphone-audio.txt'), lines.join('\n') + '\n')
rmSync(TMP, { recursive: true, force: true })
console.log(`听审片段：${dst}（${files.length} 句）`)
console.log(`清单：${join(OUT_DIR, 'polyphone-audio.txt')}`)
