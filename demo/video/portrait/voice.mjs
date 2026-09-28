#!/usr/bin/env node
/**
 * 竖屏口播配音：script.json → out/voice/scene-N.wav + out/timings.json
 * 沿用横屏流水线的「逐句精剪」口径（silencedetect 求发声包络 → atrim），
 * 保证字幕 start/end 对齐真实说话边界；句间 0.35s 间隙，场景间 0.5s。
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ffmpegBin, ffprobeBin, ensureBins } from '../bin.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, 'out')
const VOICE_DIR = join(OUT_DIR, 'voice')
const script = JSON.parse(readFileSync(join(__dirname, 'script.json'), 'utf8'))
const GAP = 0.25
const SCENE_TAIL = 0.25

ensureBins()
rmSync(VOICE_DIR, { recursive: true, force: true })
mkdirSync(VOICE_DIR, { recursive: true })

function run(args) {
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

function ttsText(text, outFile) {
  for (let attempt = 1; ; attempt++) {
    try {
      const rateArg = script.rate ? [`--rate=${script.rate}`] : []
      execFileSync('python3', ['-m', 'edge_tts', '--voice', script.voice, ...rateArg, '--text', text, '--write-media', outFile], { stdio: 'ignore' })
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

function trimToVoice(inFile, outFile) {
  const dur = probeDuration(inFile)
  const r = spawnSync(ffmpegBin, ['-v', 'info', '-i', inFile, '-af', 'silencedetect=noise=-35dB:d=0.25', '-f', 'null', '-'], { encoding: 'utf8' })
  const text = String(r.stderr)
  const starts = [...text.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => +m[1])
  const ends = [...text.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => +m[1])
  let vs = 0
  if (starts.length && starts[0] < 0.1) vs = ends.find((e) => e > starts[0]) ?? dur
  let ve = dur
  const last = starts[starts.length - 1]
  if (last != null && last > (ends[ends.length - 1] ?? 0)) ve = last
  run(['-i', inFile, '-af', `atrim=${vs}:${ve},asetpts=PTS-STARTPTS`, '-ar', '44100', '-ac', '2', outFile])
  return probeDuration(outFile)
}

/** 长句按，、拆成可读子幕，时间按字数比例在真实句时长内分配（逗号处本就是停顿，误差可接受） */
function subtitlesFor(sentence, start, end) {
  const clauses = sentence.split(/[，、]/).map((s) => s.trim()).filter(Boolean)
  if (clauses.length <= 1 || (end - start) < 3.2) return [{ start, end, text: sentence }]
  const chars = clauses.reduce((s, c) => s + c.length, 0)
  const span = end - start
  let acc = start
  return clauses.map((c, k) => {
    const d = (c.length / chars) * span
    const segStart = acc
    acc += d
    const segEnd = k === clauses.length - 1 ? end : acc
    return { start: +segStart.toFixed(3), end: +segEnd.toFixed(3), text: c }
  })
}

function splitSentences(text) {
  const parts = text.match(/[^。！？；]+[。！？；]?/g) || [text]
  return parts.map((s) => s.trim()).filter(Boolean)
}

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
    timed.push(...subtitlesFor(sentences[j], cursor, cursor + d))
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
  scenes.push({ name: scene.name, body: scene.body, audio: `voice/scene-${i}.wav`, duration: +(cursor + SCENE_TAIL).toFixed(3), sentences: timed })
}

writeFileSync(join(OUT_DIR, 'timings.json'), JSON.stringify({ title: script.title, scenes }, null, 2))
console.log(`\n配音完成：总时长 ${scenes.reduce((s, x) => s + x.duration, 0).toFixed(1)}s → ${resolve(OUT_DIR, 'timings.json')}`)
