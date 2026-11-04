import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function git(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => reject(new Error(`无法执行 git：${error.message}`)))
    child.on('close', code => {
      if (code === 0) resolvePromise()
      else reject(new Error(`Git 执行失败：${stderr.trim().split('\n').slice(-3).join(' ') || `退出码 ${code}`}`))
    })
  })
}

async function validateSkill(source, expectedName) {
  const stat = await lstat(source)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('技能来源不是普通目录')
  const entry = join(source, 'SKILL.md')
  const markdown = await readFile(entry, 'utf8').catch(() => {
    throw new Error(`技能 ${expectedName} 缺少 SKILL.md`)
  })
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1]
  const name = /^name:\s*['"]?([a-z0-9-]+)['"]?\s*$/m.exec(frontmatter ?? '')?.[1]
  const description = /^description:\s*(.+)$/m.exec(frontmatter ?? '')?.[1]?.trim()
  if (!name || !description) throw new Error(`技能 ${expectedName} 的 frontmatter 不完整`)
  if (name !== expectedName) throw new Error(`技能目录名 ${expectedName} 与 frontmatter 名称 ${name} 不一致`)

  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isSymbolicLink()) throw new Error(`技能包含不允许的符号链接：${path}`)
      if (item.isDirectory()) await walk(path)
    }
  }
  await walk(source)
}

async function availableSkills(repoRoot) {
  try {
    const entries = await readdir(join(repoRoot, 'skills'), { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => entry.name).sort()
  } catch {
    return []
  }
}

async function replaceWithStaging(source, destination, force) {
  const parent = dirname(destination)
  const staging = await mkdtemp(join(parent, '.worm-skills-'))
  const stagedSkill = join(staging, 'new')
  const backup = join(staging, 'old')
  let movedOld = false
  try {
    await cp(source, stagedSkill, { recursive: true, errorOnExist: true, force: false })
    if (await pathExists(destination)) {
      if (!force) throw new Error(`目标技能已存在：${destination}；如需替换请使用 --force`)
      await rename(destination, backup)
      movedOld = true
    }
    try {
      await rename(stagedSkill, destination)
    } catch (error) {
      if (movedOld) await rename(backup, destination)
      throw error
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function installSkill({ name, repo, ref, dir, force = false, cwd = process.cwd() }) {
  if (!SKILL_NAME.test(name)) throw new Error(`技能名不合法：${name}`)
  const skillRoot = resolve(dir ?? join(cwd, '.agents/skills'))
  const destination = resolve(skillRoot, name)
  if (dirname(destination) !== skillRoot) throw new Error('技能目标路径越界')
  const cloneParent = await mkdtemp(join(tmpdir(), 'worm-print-skills-'))
  const cloneDir = join(cloneParent, 'repo')
  try {
    const args = ['clone', '--depth', '1', '--filter=blob:none', '--sparse']
    if (ref) args.push('--branch', ref, '--single-branch')
    args.push(repo, cloneDir)
    await git(args)
    await git(['-C', cloneDir, 'sparse-checkout', 'set', 'skills'])
    const source = join(cloneDir, 'skills', name)
    if (!await pathExists(source)) {
      const available = await availableSkills(cloneDir)
      throw new Error(`仓库中找不到技能 ${name}${available.length ? `；可安装：${available.join(', ')}` : ''}`)
    }
    await validateSkill(source, name)
    await mkdir(skillRoot, { recursive: true })
    await replaceWithStaging(source, destination, force)
    return { skillPath: destination, repo, ref: ref ?? '默认分支' }
  } finally {
    await rm(cloneParent, { recursive: true, force: true })
  }
}
