import { existsSync } from 'node:fs'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

const roots = process.argv.slice(2)
if (roots.length === 0) {
  console.error('用法：node scripts/check-skills.mjs <skill-dir> [...]')
  process.exit(2)
}

let failed = false
const errors = []
const fail = message => {
  failed = true
  errors.push(message)
}

async function walk(directory, skillRoot = directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      fail(`符号链接：${path}`)
      continue
    }
    if (entry.isDirectory()) await walk(path, skillRoot)
    else if (extname(entry.name) === '.md') await checkMarkdown(path, skillRoot)
  }
}

async function checkMarkdown(file, skillRoot) {
  const body = await readFile(file, 'utf8')
  if (file.endsWith(`${sep}SKILL.md`)) {
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)?.[1]
    const name = /^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m.exec(frontmatter ?? '')?.[1]
    const description = /^description:\s*(.+)$/m.exec(frontmatter ?? '')?.[1]?.trim()
    if (name !== basename(skillRoot)) fail(`技能名称不一致：${file}`)
    if (!description) fail(`缺少 description：${file}`)
  }
  for (const match of body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    let target = match[1].trim()
    if (/^(?:https?:|mailto:|#)/.test(target)) continue
    if (target.startsWith('<') && target.includes('>')) target = target.slice(1, target.indexOf('>'))
    else target = target.split(/\s+["']/)[0]
    target = target.split('#')[0]
    if (!target) continue
    const resolved = resolve(dirname(file), decodeURIComponent(target))
    if (resolved !== skillRoot && !resolved.startsWith(`${skillRoot}${sep}`)) {
      fail(`链接越出技能目录：${file} -> ${target}`)
    } else if (!existsSync(resolved)) {
      fail(`链接不存在：${file} -> ${target}`)
    }
  }
}

for (const input of roots) {
  const root = resolve(input)
  try {
    const stat = await lstat(root)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      fail(`不是技能目录：${input}`)
      continue
    }
    if (!existsSync(join(root, 'SKILL.md'))) {
      fail(`缺少 SKILL.md：${input}`)
      continue
    }
    await walk(root)
    console.log(`✅ ${input}`)
  } catch (error) {
    fail(`${input}：${error.message}`)
  }
}

for (const error of errors) console.error(`❌ ${error}`)
process.exit(failed ? 1 : 0)
