import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { commitAll, createSkillRepo, runCli, tempDir, writeSkill } from './helpers.js'

test('省略 --dir 时安装到当前项目的 .agents/skills', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  const result = runCli(['demo', '--repo', repo], cwd)
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(join(cwd, '.agents/skills/demo/SKILL.md'), 'utf8'), /# v2/)
})

test('不扫描或安装 .agents 下的开发技能', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  const result = runCli(['experts', '--repo', repo], cwd)
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(join(cwd, '.agents/skills/experts')), false)
  assert.match(result.stderr, /demo/)
})

test('--dir 与 --ref 安装指定版本到指定父目录', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  const target = join(cwd, 'custom')
  const result = runCli(['demo', '--repo', repo, '--ref', 'v1.0.0', '--dir', target], cwd)
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(join(target, 'demo/SKILL.md'), 'utf8'), /# v1/)
})

test('缺少名称、多个名称和未知选项均失败', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  for (const args of [[], ['demo', 'other'], ['demo', '--unknown']]) {
    const result = runCli([...args, '--repo', repo], cwd)
    assert.notEqual(result.status, 0, args.join(' '))
  }
})

test('非法技能名在访问仓库前失败', t => {
  const cwd = tempDir(t, 'worm-skills-cwd-')
  for (const name of ['../demo', '/tmp/demo', 'demo/evil', 'Demo']) {
    const result = runCli([name, '--repo', '/不存在的仓库'], cwd)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /技能名/)
  }
})

test('缺少 SKILL.md 的技能不会被安装', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  mkdirSync(join(repo, 'skills/broken'), { recursive: true })
  writeFileSync(join(repo, 'skills/broken/README.md'), '缺少入口')
  commitAll(repo)
  const result = runCli(['broken', '--repo', repo], cwd)
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(join(cwd, '.agents/skills/broken')), false)
})

test('frontmatter 名称与目录不匹配时失败且无残留', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  writeSkill(repo, 'mismatch', '---\nname: other\ndescription: 错误名称\n---\n')
  commitAll(repo)
  const result = runCli(['mismatch', '--repo', repo], cwd)
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(join(cwd, '.agents/skills/mismatch')), false)
})

test('技能内符号链接会被拒绝', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  writeSkill(repo, 'linked', '---\nname: linked\ndescription: 链接技能\n---\n')
  writeFileSync(join(repo, 'outside.txt'), '仓库外内容')
  symlinkSync(join(repo, 'outside.txt'), join(repo, 'skills/linked/escape.txt'))
  commitAll(repo)
  const result = runCli(['linked', '--repo', repo], cwd)
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(join(cwd, '.agents/skills/linked')), false)
})

test('目标存在时默认拒绝，--force 才替换', t => {
  const repo = createSkillRepo(t)
  const cwd = tempDir(t, 'worm-skills-cwd-')
  const target = join(cwd, '.agents/skills/demo')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'SKILL.md'), '旧技能')
  const rejected = runCli(['demo', '--repo', repo], cwd)
  assert.notEqual(rejected.status, 0)
  assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), '旧技能')
  const replaced = runCli(['demo', '--repo', repo, '--force'], cwd)
  assert.equal(replaced.status, 0, replaced.stderr)
  assert.match(readFileSync(join(target, 'SKILL.md'), 'utf8'), /# v2/)
})

test('仓库不存在时失败且不创建目标技能', t => {
  const cwd = tempDir(t, 'worm-skills-cwd-')
  const result = runCli(['demo', '--repo', join(cwd, 'missing-repo')], cwd)
  assert.notEqual(result.status, 0)
  assert.equal(existsSync(join(cwd, '.agents/skills/demo')), false)
})

test('--help 不需要技能名或仓库', t => {
  const cwd = tempDir(t, 'worm-skills-cwd-')
  const result = runCli(['--help'], cwd)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--repo/)
  assert.match(result.stdout, /--force/)
})
