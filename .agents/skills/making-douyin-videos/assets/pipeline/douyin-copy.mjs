#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export function validateDouyin(script) {
  const d = script.douyin
  if (!d) throw new Error('剧本缺 douyin：titles/description/tags/pinnedComment/sources')
  if (!Array.isArray(d.titles) || d.titles.length !== 5 || d.titles.some((x) => !x?.trim())) {
    throw new Error('douyin.titles 必须提供 5 条非空标题，第一条为推荐')
  }
  for (const title of d.titles) {
    if ([...title].length > 30) throw new Error(`标题超过项目约定的 30 字：${title}`)
  }
  if (!Array.isArray(d.tags) || d.tags.length !== 5 || d.tags.some((x) => !x?.trim())) {
    throw new Error('douyin.tags 必须恰好 5 个非空标签')
  }
  if (new Set(d.tags).size !== 5) throw new Error('douyin.tags 必须恰好 5 个且不能重复')
  if (d.tags.some((tag) => /\s/.test(tag.trim()))) throw new Error('douyin.tags 单个标签内部不能带空格')
  if (!d.description?.trim() || !d.pinnedComment?.trim()) throw new Error('发布简介和置顶评论不能为空')
  if (!Array.isArray(d.sources) || !d.sources.length || d.sources.some((x) => !x.claim?.trim() || !x.evidence?.trim())) {
    throw new Error('douyin.sources 至少一条，且每条必须含 claim 与 evidence')
  }
  return d
}

export function renderDouyinCopy(script, { videoFile = 'video_final.mp4' } = {}) {
  const d = validateDouyin(script)
  const lines = [
    `# 抖音上传文案 ·《${script.title}》`, '',
    '## 配套素材', '',
    `- 成品：\`${videoFile}\``,
    '- 平台封面：`cover-douyin-4x3.png`（1440×1080）· `cover-douyin-3x4.png`（1080×1440）',
    '- 保留母版：`cover-douyin-16x9.png` · `cover-douyin-9x16.png`',
    '- 字幕与读音：`subtitles.srt` · `polyphone.md` · `polyphone-audio.m4a`', '',
    '## 一、作品标题（第一条推荐）', '',
    ...d.titles.map((title, i) => `${i + 1}. ${title}`), '',
    '## 二、发布简介', '',
    d.description.trim(), '',
    '## 三、话题标签（恰好 5 个）', '',
    d.tags.map((tag) => `#${tag.replace(/^#/, '')}`).join(' '), '',
    '## 四、置顶评论', '',
    d.pinnedComment.trim(), '',
    '## 五、口径备注（勿上传）', '',
    '| 说法 | 源码或实测出处 |', '| --- | --- |',
    ...d.sources.map((x) => `| ${x.claim} | \`${x.evidence}\` |`), '',
  ]
  return lines.join('\n')
}

async function main() {
  const { readFileSync } = await import('node:fs')
  const { SCRIPT_PATH, OUT_DIR } = await import('./paths.mjs')
  const script = JSON.parse(readFileSync(SCRIPT_PATH, 'utf8'))
  const videoFile = SCRIPT_PATH.includes(`${sep}portrait${sep}`) ? 'portrait.mp4' : 'video_final.mp4'
  const out = join(OUT_DIR, 'douyin-copy.md')
  writeFileSync(out, renderDouyinCopy(script, { videoFile }))
  console.log(`抖音文案：${out}（5 个标签）`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
