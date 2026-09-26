#!/usr/bin/env node
/**
 * 按场景合成配音：script.json → out/voice/scene-N.wav + out/timings.json
 * 借鉴 worm-html-2-video「配音先行、时长反推」，并针对其未处理的两个坑强化：
 * 1) edge-tts 每句 mp3 自带首尾静音：用 silencedetect 定位真实发声边界后 atrim 精剪再测时长，
 *    字幕 start/end 即说话边界（旧版 ffmpeg 的 areverse+silenceremove 尾部裁剪失效，不可依赖）；
 * 2) 句间插固定 0.3s 静音间隙，段落节奏稳定。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin, ffprobeBin, ensureBins } from './bin.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')
const VOICE_DIR = join(OUT_DIR, 'voice')
const script = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8'))
const GAP = 0.3

ensureBins()

function run(args) {
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

function ttsText(text, outFile) {
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync('python3', ['-m', 'edge_tts', '--voice', script.voice, '--text', text, '--write-media', outFile], { stdio: 'ignore' })
      return
    } catch (e) {
      if (attempt >= 3) throw e
      console.warn(`  edge-tts 第 ${attempt} 次失败，1.5s 后重试…`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)
    }
  }
}

function probeDuration(file) {
  const out = execFileSync(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return parseFloat(out.trim())
}

/** silencedetect 求静音区间，取 [首个发声, 末尾发声] 用 atrim 精剪，首尾静音彻底去除 */
function trimToVoice(inFile, outFile) {
  const dur = probeDuration(inFile)
  const r = spawnSync(ffmpegBin, ['-v', 'info', '-i', inFile, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' })
  const text = String(r.stderr)
  const starts = [...text.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => +m[1])
  const ends = [...text.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => +m[1])
  let vs = 0
  if (starts.length && starts[0] < 0.1) {
    vs = ends.find((e) => e > starts[0]) ?? dur
  }
  let ve = dur
  const last = starts[starts.length - 1]
  if (last != null && last > (ends[ends.length - 1] ?? 0)) ve = last
  run(['-i', inFile, '-af', `atrim=${vs}:${ve},asetpts=PTS-STARTPTS`, '-ar', '44100', '-ac', '2', outFile])
  return probeDuration(outFile)
}

function splitSentences(text) {
  const parts = text.match(/[^。！？；]+[。！？；]?/g) || [text]
  return parts.map((s) => s.trim()).filter(Boolean)
}

rmSync(VOICE_DIR, { recursive: true, force: true })
mkdirSync(VOICE_DIR, { recursive: true })
run(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(GAP), join(VOICE_DIR, 'gap.wav')])

const scenes = []
for (let i = 0; i < script.scenes.length; i++) {
  const scene = script.scenes[i]
  const sentences = splitSentences(scene.voiceover)
  const wavFiles = []
  let cursor = 0
  const timed = []
  console.log(`[${i + 1}/${script.scenes.length}] ${scene.name}`)
  for (let j = 0; j < sentences.length; j++) {
    const mp3 = join(VOICE_DIR, `tmp-${i}-${j}.mp3`)
    const wav = join(VOICE_DIR, `tmp-${i}-${j}.wav`)
    process.stdout.write(`  句 ${j + 1}/${sentences.length} 合成中… `)
    ttsText(sentences[j], mp3)
    run(['-i', mp3, '-ar', '44100', '-ac', '2', join(VOICE_DIR, `raw-${i}-${j}.wav`)])
    rmSync(mp3, { force: true })
    const d = trimToVoice(join(VOICE_DIR, `raw-${i}-${j}.wav`), wav)
    rmSync(join(VOICE_DIR, `raw-${i}-${j}.wav`), { force: true })
    timed.push({ start: +cursor.toFixed(3), end: +(cursor + d).toFixed(3), text: sentences[j] })
    cursor += d + (j < sentences.length - 1 ? GAP : 0)
    wavFiles.push(wav)
    process.stdout.write(`${d.toFixed(2)}s\n`)
  }
  const listFile = join(VOICE_DIR, `list-${i}.txt`)
  const interleave = []
  wavFiles.forEach((f, k) => {
    if (k > 0) interleave.push(join(VOICE_DIR, 'gap.wav'))
    interleave.push(f)
  })
  writeFileSync(listFile, interleave.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n'))
  const sceneFile = join(VOICE_DIR, `scene-${i}.wav`)
  run(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', sceneFile])
  wavFiles.forEach((f) => rmSync(f, { force: true }))
  rmSync(listFile, { force: true })
  scenes.push({ name: scene.name, audio: `voice/scene-${i}.wav`, duration: +cursor.toFixed(3), sentences: timed })
}

writeFileSync(join(OUT_DIR, 'timings.json'), JSON.stringify({ title: script.title, scenes }, null, 2))
console.log(`\n配音完成：总时长 ${scenes.reduce((s, x) => s + x.duration, 0).toFixed(1)}s → ${resolve(OUT_DIR, 'timings.json')}`)
