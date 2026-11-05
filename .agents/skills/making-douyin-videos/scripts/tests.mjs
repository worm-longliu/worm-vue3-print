import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pipeline = join(here, '..', 'assets', 'pipeline')

test('字幕按语义短条切分，保留原文且时间轴连续', async () => {
  const { subtitlesFor } = await import(pathToFileURL(join(pipeline, 'subtitles.mjs')))
  const source = '先在浏览器里设计模板，再交给客户端打印，字幕仍显示原始汉字。'
  const parts = subtitlesFor(source, 1, 7, { lineWidth: 12, maxLines: 2 })
  assert.ok(parts.length >= 2)
  assert.equal(parts[0].start, 1)
  assert.equal(parts.at(-1).end, 7)
  assert.equal(parts.map((x) => x.text.replaceAll('\n', '')).join(''), source)
  for (let i = 1; i < parts.length; i++) assert.equal(parts[i].start, parts[i - 1].end)
})

test('字幕最多两行，长句不会整段挤进一条', async () => {
  const { subtitlesFor } = await import(pathToFileURL(join(pipeline, 'subtitles.mjs')))
  const parts = subtitlesFor('这是一个没有标点但长度明显超过抖音短字幕两行上限的完整句子', 0, 8, { lineWidth: 10, maxLines: 2 })
  assert.ok(parts.length >= 2)
  for (const part of parts) {
    const lines = part.text.split('\n')
    assert.ok(lines.length <= 2)
    assert.ok(lines.every((line) => [...line].length <= 10))
  }
})

test('发布文案保留恰好五个不重复标签', async () => {
  const { renderDouyinCopy } = await import(pathToFileURL(join(pipeline, 'douyin-copy.mjs')))
  const script = {
    title: '测试视频',
    douyin: {
      titles: ['首选标题', '备选二', '备选三', '备选四', '备选五'],
      description: '这是发布简介。',
      tags: ['打印模板', 'Vue3', '前端开发', '开源项目', '效率工具'],
      pinnedComment: '置顶补充。',
      sources: [{ claim: '事实', evidence: 'packages/print-core/src/index.ts:1' }],
    },
  }
  const copy = renderDouyinCopy(script, { videoFile: 'portrait.mp4' })
  const tagLine = copy.split('\n').find((line) => line.startsWith('#打印模板'))
  assert.equal(tagLine.trim().split(/\s+/).length, 5)
  assert.throws(() => renderDouyinCopy({ ...script, douyin: { ...script.douyin, tags: ['少一个'] } }, {}), /恰好 5 个/)
})

test('多音字只改 TTS 文本，不污染字幕原文', () => {
  const dir = mkdtempSync(join(tmpdir(), 'douyin-poly-'))
  const script = join(dir, 'script.json')
  writeFileSync(script, JSON.stringify({
    title: '多音字测试',
    accept: [['行', 'xing2', '行走及句尾代词读 xíng']],
    scenes: [{ name: '银行', voiceover: '收款银行不能读成行走的行。', read: [['银行', 'hang2', '金融机构'], ['行走', 'xing2', '走路']] }],
  }))
  execFileSync('python3', [join(pipeline, 'polyphone.py'), script, join(dir, 'poly.json'), join(dir, 'poly.md')])
  const poly = JSON.parse(readFileSync(join(dir, 'poly.json'), 'utf8'))
  const sentence = poly.scenes[0].sentences[0]
  assert.equal(sentence.display, '收款银行不能读成行走的行。')
  assert.notEqual(sentence.say, sentence.display)
  assert.ok(sentence.say.includes('银'))
})

test('引导脚本可在空目录生成横竖屏流水线', () => {
  const target = mkdtempSync(join(tmpdir(), 'douyin-bootstrap-'))
  execFileSync('node', [join(here, 'bootstrap.mjs'), '--target', target])
  for (const file of ['package.json', 'voiceover.mjs', 'douyin-copy.mjs', 'cover-douyin.html', 'script.json', 'portrait/voice.mjs', 'portrait/script.json']) {
    assert.ok(readFileSync(join(target, file), 'utf8').length > 0, file)
  }
})
