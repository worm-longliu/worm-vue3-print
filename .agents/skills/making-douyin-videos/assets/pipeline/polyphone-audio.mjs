#!/usr/bin/env node
/** 把同音替换和人工判定过的风险句集中为听审片段，避免重新听完整片。 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin, ensureBins } from './bin.mjs'
import { SCRIPT_PATH, OUT_DIR } from './paths.mjs'
import { sentenceWindow } from './subtitles.mjs'

export const needsAudioReview = (sentence) => sentence.display !== sentence.say || sentence.needsReview === true

function main() {
  ensureBins()
  const poly = JSON.parse(readFileSync(join(OUT_DIR, 'polyphone.json'), 'utf8'))
  const timingsPath = join(OUT_DIR, 'timings.json')
  if (!existsSync(timingsPath)) throw new Error('缺 timings.json，请先跑配音')
  const timings = JSON.parse(readFileSync(timingsPath, 'utf8'))
  const TMP = join(OUT_DIR, 'tmp-audio')
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  const files = []
  const lines = ['# 多音字听审清单（替换句与人工判定风险句）', '']

  for (let i = 0; i < poly.scenes.length; i++) {
    const sentences = poly.scenes[i].sentences
    const timed = timings.scenes[i].sentences
    for (let j = 0; j < sentences.length; j++) {
      if (!needsAudioReview(sentences[j])) continue
      const wav = join(OUT_DIR, timings.scenes[i].audio)
      const out = join(TMP, `s${i}-${j}.wav`)
      const window = sentenceWindow(timed, j)
      execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav,
        '-af', `atrim=${Math.max(0, window.start - 0.12)}:${window.end + 0.12},asetpts=PTS-STARTPTS,adelay=200|200`,
        '-ar', '44100', '-ac', '2', out], { stdio: 'ignore' })
      files.push(out)
      lines.push(`- 场景${i + 1} 句${j + 1}`, `  - 字幕（画面/SRT）：${sentences[j].display}`, `  - 配音（喂引擎）：${sentences[j].say}`)
    }
  }
  const dst = join(OUT_DIR, 'polyphone-audio.m4a')
  if (!files.length) {
    execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.2', '-c:a', 'aac', dst], { stdio: 'ignore' })
  } else {
    const list = join(TMP, 'list.txt')
    writeFileSync(list, files.map((file) => `file '${file.replace(/\\/g, '/')}'`).join('\n'))
    execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'aac', '-b:a', '128k', dst], { stdio: 'ignore' })
  }
  rmSync(TMP, { recursive: true, force: true })
  writeFileSync(join(OUT_DIR, 'polyphone-audio.txt'), lines.join('\n') + '\n')
  console.log(`听审片段：${dst}（${files.length} 句）`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
