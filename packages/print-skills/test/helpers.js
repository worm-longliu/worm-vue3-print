import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const cliPath = join(dirname(fileURLToPath(import.meta.url)), '../bin/cli.js')

export function tempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => execFileSync('rm', ['-rf', dir]))
  return dir
}

export function commitAll(repo) {
  execFileSync('git', ['add', '.'], { cwd: repo })
  execFileSync('git', ['commit', '-m', '测试技能'], { cwd: repo, stdio: 'ignore' })
}

export function writeSkill(repo, name, content, directory = 'skills') {
  const skillDir = join(repo, directory, name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), content)
}

export function createSkillRepo(t) {
  const repo = tempDir(t, 'worm-skills-repo-')
  execFileSync('git', ['init', '-b', 'main'], { cwd: repo, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'tests@example.com'], { cwd: repo })
  execFileSync('git', ['config', 'user.name', '测试'], { cwd: repo })
  writeSkill(repo, 'demo', '---\nname: demo\ndescription: 测试技能\n---\n\n# v1\n')
  writeSkill(repo, 'experts', '---\nname: experts\ndescription: 开发技能\n---\n', '.agents/skills')
  commitAll(repo)
  execFileSync('git', ['tag', 'v1.0.0'], { cwd: repo })
  writeSkill(repo, 'demo', '---\nname: demo\ndescription: 测试技能\n---\n\n# v2\n')
  commitAll(repo)
  return repo
}

export function runCli(args, cwd) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf8',
  })
}
