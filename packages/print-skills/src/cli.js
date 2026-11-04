import { installSkill } from './install.js'

const DEFAULT_REPO = 'https://github.com/worm-longliu/worm-vue3-print.git'
const HELP = `用法：
  npx @worm-vue3-print/skills <skill-name> [选项]

选项：
  --repo <git-url>       Git 仓库，默认 ${DEFAULT_REPO}
  --ref <branch-or-tag>  指定分支或 tag
  --dir <directory>      技能父目录，默认 <cwd>/.agents/skills
  --force                替换已存在的同名技能
  --help                 显示帮助
`

function parseArgs(argv) {
  const options = { repo: DEFAULT_REPO, force: false }
  const names = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help') return { help: true }
    if (arg === '--force') {
      options.force = true
      continue
    }
    if (['--repo', '--ref', '--dir'].includes(arg)) {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error(`${arg} 需要一个值`)
      options[arg.slice(2)] = value
      continue
    }
    if (arg.startsWith('-')) throw new Error(`未知选项：${arg}`)
    names.push(arg)
  }
  if (names.length !== 1) throw new Error('必须且只能指定一个技能名称')
  return { name: names[0], options }
}

export async function run(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout
  const stderr = io.stderr ?? process.stderr
  try {
    const parsed = parseArgs(argv)
    if (parsed.help) {
      stdout.write(HELP)
      return 0
    }
    const result = await installSkill({ ...parsed.options, name: parsed.name, cwd: io.cwd ?? process.cwd() })
    stdout.write(`已安装 ${parsed.name}\n来源：${result.repo}（${result.ref}）\n目录：${result.skillPath}\n`)
    return 0
  } catch (error) {
    stderr.write(`安装失败：${error instanceof Error ? error.message : String(error)}\n`)
    stderr.write('使用 --help 查看命令用法。\n')
    return 1
  }
}
