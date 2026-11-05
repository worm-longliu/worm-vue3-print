#!/usr/bin/env node
/** 竖屏与横屏共用 display/say 双轨：原文进字幕，同音锁定文本只进 TTS。 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin, ffprobeBin, ensureBins } from '../bin.mjs'
import { subtitlesFor } from '../subtitles.mjs'
import { validateDouyin } from '../douyin-copy.mjs'
import { OUT_DIR, SCRIPT_PATH } from './paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VOICE_DIR = join(OUT_DIR, 'voice')
const POLY_JSON = join(OUT_DIR, 'polyphone.json')
const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
validateDouyin(script)
if ((script.subtitle?.maxLines ?? 2) !== 2) throw new Error('抖音字幕 subtitle.maxLines 必须为 2')
const GAP = 0.25
const SCENE_TAIL = 0.25

ensureBins()
mkdirSync(OUT_DIR, { recursive: true })
const py = spawnSync('python3', [join(__dirname, '..', 'polyphone.py'), SCRIPT_PATH, POLY_JSON, join(OUT_DIR, 'polyphone.md')], { stdio: 'inherit' })
if (py.status !== 0) process.exit(py.status ?? 1)
if (!existsSync(POLY_JSON)) throw new Error('缺少 polyphone.json')
const poly = JSON.parse(readFileSync(POLY_JSON, 'utf8'))

function run(args) {
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

function ttsText(text, outFile) {
  for (let attempt = 1; ; attempt++) {
    try {
      const rateArg = script.rate ? [`--rate=${script.rate}`] : []
      execFileSync('python3', ['-m', 'edge_tts', '--voice', script.voice, ...rateArg, '--text', text, '--write-media', outFile], { stdio: 'ignore' })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      console.warn(`  edge-tts 第 ${attempt} 次失败，1.5s 后重试…`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)
    }
  }
}

function probeDuration(file) {
  const out = execFileSync(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  return parseFloat(out.trim())
}

function trimToVoice(inFile, outFile) {
  const dur = probeDuration(inFile)
  const r = spawnSync(ffmpegBin, ['-v', 'info', '-i', inFile, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' })
  const text = String(r.stderr)
  const starts = [...text.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => +m[1])
  const ends = [...text.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => +m[1])
  let vs = 0
  if (starts.length && starts[0] < 0.1) vs = ends.find((e) => e > starts[0]) ?? dur
  let ve = dur
  const last = starts.at(-1)
  if (last != null && last > (ends.at(-1) ?? 0)) ve = last
  run(['-i', inFile, '-af', `atrim=${vs}:${ve},asetpts=PTS-STARTPTS`, '-ar', '44100', '-ac', '2', outFile])
  return probeDuration(outFile)
}

rmSync(VOICE_DIR, { recursive: true, force: true })
mkdirSync(VOICE_DIR, { recursive: true })
run(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(GAP), join(VOICE_DIR, 'gap.wav')])

const scenes = []
for (let i = 0; i < script.scenes.length; i++) {
  const scene = script.scenes[i]
  const pScene = poly.scenes[i]
  if (!pScene?.sentences.length) throw new Error(`场景「${scene.name}」没有切出句子`)
  const wavFiles = []
  const timed = []
  let cursor = 0
  console.log(`[${i + 1}/${script.scenes.length}] ${scene.name}`)
  for (let j = 0; j < pScene.sentences.length; j++) {
    const { display, say } = pScene.sentences[j]
    const mp3 = join(VOICE_DIR, `tmp-${i}-${j}.mp3`)
    const wav = join(VOICE_DIR, `tmp-${i}-${j}.wav`)
    process.stdout.write(`  句 ${j + 1}/${pScene.sentences.length} 合成中… `)
    ttsText(say, mp3)
    run(['-i', mp3, '-ar', '44100', '-ac', '2', join(VOICE_DIR, `raw-${i}-${j}.wav`)])
    rmSync(mp3, { force: true })
    const duration = trimToVoice(join(VOICE_DIR, `raw-${i}-${j}.wav`), wav)
    rmSync(join(VOICE_DIR, `raw-${i}-${j}.wav`), { force: true })
    const parts = subtitlesFor(display, cursor, cursor + duration, { lineWidth: script.subtitle?.lineWidth ?? 16, maxLines: 2 })
    timed.push(...parts.map((part) => ({ ...part, source: display, sentence: j })))
    cursor += duration + (j < pScene.sentences.length - 1 ? GAP : 0)
    wavFiles.push(wav)
    process.stdout.write(`${duration.toFixed(2)}s\n`)
  }
  const listFile = join(VOICE_DIR, `list-${i}.txt`)
  const interleave = []
  wavFiles.forEach((file, index) => {
    if (index > 0) interleave.push(join(VOICE_DIR, 'gap.wav'))
    interleave.push(file)
  })
  writeFileSync(listFile, interleave.map((file) => `file '${file.replace(/\\/g, '/')}'`).join('\n'))
  const sceneFile = join(VOICE_DIR, `scene-${i}.wav`)
  run(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', sceneFile])
  wavFiles.forEach((file) => rmSync(file, { force: true }))
  rmSync(listFile, { force: true })
  scenes.push({ name: scene.name, body: scene.body, audio: `voice/scene-${i}.wav`, duration: +(cursor + SCENE_TAIL).toFixed(3), sentences: timed })
}

writeFileSync(join(OUT_DIR, 'timings.json'), JSON.stringify({ title: script.title, scenes }, null, 2))
console.log(`\n配音完成：总时长 ${scenes.reduce((sum, scene) => sum + scene.duration, 0).toFixed(1)}s`)
