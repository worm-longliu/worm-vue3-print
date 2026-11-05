#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffprobeBin } from './bin.mjs'
import { renderDouyinCopy } from './douyin-copy.mjs'

function srtTexts(srt) {
  return srt.trim().split(/\r?\n\r?\n/).map((block) => block.split(/\r?\n/).slice(2).join('\n'))
}

/** 对比词典原文、配音时间轴与 SRT 三轨，并执行最多两行的短字幕约束。 */
export function validateSubtitleEvents(poly, timings, srt, lineWidth) {
  const errors = []
  const actual = srtTexts(srt)
  let eventIndex = 0
  const events = timings.scenes.flatMap((scene, sceneIndex) => scene.sentences.map((event) => ({ ...event, sceneIndex, eventIndex: eventIndex++ })))
  if (actual.length !== events.length) errors.push(`SRT 条数 ${actual.length} 与时间轴 ${events.length} 不一致`)
  for (let i = 0; i < Math.min(actual.length, events.length); i++) {
    if (actual[i] !== events[i].text) errors.push(`SRT 第 ${i + 1} 条与时间轴文本不一致`)
  }
  for (const [sceneIndex, scene] of poly.scenes.entries()) {
    for (const [sentenceIndex, sentence] of scene.sentences.entries()) {
      let parts = events.filter((event) => event.sceneIndex === sceneIndex && event.sentence === sentenceIndex)
      if (!parts.length && scene.sentences.length === timings.scenes[sceneIndex]?.sentences.length) {
        const old = events.filter((event) => event.sceneIndex === sceneIndex && event.sentence == null)
        parts = old[sentenceIndex] ? [old[sentenceIndex]] : []
      }
      const display = parts.map((part) => part.text.replaceAll('\n', '')).join('')
      if (display !== sentence.display) errors.push(`场景 ${sceneIndex + 1} 句 ${sentenceIndex + 1} 时间轴不是原文：${display}`)
      const srtDisplay = parts.map((part) => actual[part.eventIndex]?.replaceAll('\n', '') ?? '').join('')
      if (srtDisplay !== sentence.display) errors.push(`场景 ${sceneIndex + 1} 句 ${sentenceIndex + 1} SRT 不是原文：${srtDisplay}`)
    }
  }
  for (const [index, event] of events.entries()) {
    const lines = event.text.split('\n')
    if (lines.length > 2) errors.push(`字幕第 ${index + 1} 条超过两行`)
    if (lines.some((line) => [...line].length > lineWidth)) errors.push(`字幕第 ${index + 1} 条单行超过 ${lineWidth} 字`)
  }
  return [...new Set(errors)]
}

function probe(file) {
  const out = execFileSync(ffprobeBin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'json', file], { encoding: 'utf8' })
  return JSON.parse(out).streams[0]
}

async function main() {
  const { SCRIPT_PATH, OUT_DIR } = await import('./paths.mjs')
  const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
  const portrait = SCRIPT_PATH.includes(`${sep}portrait${sep}`)
  const videoFile = portrait ? 'portrait.mp4' : 'video_final.mp4'
  const errors = []
  const video = join(OUT_DIR, videoFile)
  if (!existsSync(video)) errors.push(`缺 ${videoFile}`)
  else {
    const v = probe(video)
    if (v.width !== script.video.width || v.height !== script.video.height) errors.push(`视频尺寸 ${v.width}×${v.height} 与剧本不符`)
    if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p') errors.push(`视频编码应为 h264/yuv420p，实测 ${v.codec_name}/${v.pix_fmt}`)
    console.log(`视频：${v.width}×${v.height} · ${v.codec_name} · ${v.pix_fmt}`)
  }
  for (const [file, width, height] of [
    ['cover-douyin-4x3.png', 1440, 1080], ['cover-douyin-3x4.png', 1080, 1440],
    ['cover-douyin-16x9.png', 1920, 1080], ['cover-douyin-9x16.png', 1080, 1920],
  ]) {
    const path = join(OUT_DIR, file)
    if (!existsSync(path)) { errors.push(`缺 ${file}`); continue }
    const size = probe(path)
    if (size.width !== width || size.height !== height) errors.push(`${file} 实测 ${size.width}×${size.height}`)
  }
  for (const file of ['polyphone.md', 'polyphone-audio.m4a', 'polyphone.json', 'timings.json', 'subtitles.srt', 'douyin-copy.md']) {
    if (!existsSync(join(OUT_DIR, file))) errors.push(`缺 ${file}`)
  }
  if (!existsSync(join(OUT_DIR, 'douyin-copy.md')) || readFileSync(join(OUT_DIR, 'douyin-copy.md'), 'utf8') !== renderDouyinCopy(script, { videoFile })) {
    errors.push('douyin-copy.md 缺失、过期或未满足五标签契约，请重跑 video:copy')
  }
  if (errors.length === 0) {
    const poly = JSON.parse(readFileSync(join(OUT_DIR, 'polyphone.json'), 'utf8'))
    const timings = JSON.parse(readFileSync(join(OUT_DIR, 'timings.json'), 'utf8'))
    const srt = readFileSync(join(OUT_DIR, 'subtitles.srt'), 'utf8')
    errors.push(...validateSubtitleEvents(poly, timings, srt, script.subtitle?.lineWidth ?? (portrait ? 16 : 20)))
  }
  if (errors.length) {
    console.error(errors.map((error) => `✗ ${error}`).join('\n'))
    process.exit(1)
  }
  console.log(`✓ ${OUT_DIR}\n  四比例封面 / 字幕原文与两行短条 / 多音字台账与听审 / 抖音文案五标签`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
