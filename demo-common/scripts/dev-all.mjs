import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 一次起四个宿主 demo 的 dev server（各自独立 npm 工程，所以各起各的进程），
// 外加 :9300 的宿主示例总览页（serve-nav.mjs，五个工程互跳的入口）。
// 端口：vue3 9331 / vue2 9332 / react 9335 / jquery 9334 / 总览 9300。
const HERE = dirname(fileURLToPath(import.meta.url))
const APPS = [
  { name: 'vue3', dir: 'apps/vue3' },
  { name: 'vue2', dir: 'apps/vue2' },
  { name: 'react', dir: 'apps/react' },
  { name: 'jquery', dir: 'apps/jquery' },
]

const children = APPS.map(({ name, dir }) => {
  const child = spawn('npm', ['run', 'dev'], { cwd: join(HERE, '..', dir), shell: process.platform === 'win32' })
  const prefix = `[${name}]`.padEnd(9, ' ')
  child.stdout.on('data', chunk => process.stdout.write(prefix + chunk))
  child.stderr.on('data', chunk => process.stderr.write(prefix + chunk))
  child.on('exit', code => console.log(`${prefix} 退出（code=${code}）`))
  return child
})

// 总览页（:9300）：五个工程的互跳入口，与四个 dev server 同组启动、同组退出
const nav = spawn(process.execPath, [join(HERE, 'serve-nav.mjs')], { cwd: join(HERE, '..') })
nav.stdout.on('data', chunk => process.stdout.write('[nav]'.padEnd(9, ' ') + chunk))
nav.stderr.on('data', chunk => process.stderr.write('[nav]'.padEnd(9, ' ') + chunk))
children.push(nav)

process.on('SIGINT', () => children.forEach(child => child.kill('SIGINT')))
