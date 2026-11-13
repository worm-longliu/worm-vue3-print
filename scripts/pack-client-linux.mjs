// 在 Docker 的 Linux 容器里交叉构建桌面客户端安装包（deb / rpm / AppImage）。
// 用法：npm run pack:client:linux（会先构建 core/echarts 与客户端的 out/）
// 为什么走容器：rpm 目标要调用 rpmbuild，宿主 macOS 没有该可执行文件；容器里 apt 装 rpm 即可。
// deb 与 AppImage 其实可在宿主交叉构建，但三类产物同源同环境，避免两种产物口径。
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'clients/print-client/dist')
const image = process.env.WORM_LINUX_BUILDER_IMAGE || 'node:22-bookworm'
const workVolume = 'worm-print-client-linux-work'

// Docker Desktop 不一定把 docker 放进 PATH，回退到应用内置路径。
function resolveDocker() {
  const candidates = ['docker', '/Applications/Docker.app/Contents/Resources/bin/docker']
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}'], { encoding: 'utf8' })
    if (probe.status === 0) return { bin, info: probe.stdout.trim() }
  }
  console.error('未找到可用的 Docker。请启动 Docker Desktop，或安装任意 Linux 容器运行时后重试。')
  process.exit(1)
}

const docker = resolveDocker()
if (!docker.info.startsWith('linux/')) {
  console.error(`Docker 守护进程不是 Linux 虚拟机（当前 ${docker.info}），无法构建 Linux 产物。`)
  process.exit(1)
}
console.log(`使用 Docker（${docker.info}）与镜像 ${image} 构建 Linux 安装包`)

if (!existsSync(join(root, 'clients/print-client/out'))) {
  console.error('未找到 clients/print-client/out，请先执行 npm run build -w @worm-vue3-print/print-client（或直接用 npm run pack:client:linux）')
  process.exit(1)
}

// 图表执行器产物的 dist 必须随源码一起进容器：electron-builder 按 workspace 软链打包 asar，
// 只拷了 out/ 而漏掉 print-echarts/dist 时，主进程 require('@worm-vue3-print/echarts/node') 会在运行期报错。
if (!existsSync(join(root, 'packages/print-echarts/dist'))) {
  console.error('未找到 packages/print-echarts/dist，请先执行 npm run build -w @worm-vue3-print/echarts（npm run pack:client:linux 已包含该步骤）')
  process.exit(1)
}

// 容器内步骤：装 rpmbuild → 拷源码（跳过 node_modules/dist/out）→ npm ci → 出包到 /out
// 受限网络下可换 Debian 源（如 https://mirrors.aliyun.com）；不设则保持官方源
const aptMirror = process.env.APT_MIRROR
const script = `
set -euo pipefail
${aptMirror ? `echo "使用 APT_MIRROR=${aptMirror}"; sed -i 's|http://deb.debian.org|${aptMirror}|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; sed -i 's|http://deb.debian.org|${aptMirror}|g' /etc/apt/sources.list 2>/dev/null || true` : ''}
apt-get update -qq
apt-get install -y -qq --no-install-recommends rpm ca-certificates >/dev/null
command -v rpmbuild >/dev/null || { echo "容器内缺少 rpmbuild"; exit 1; }

# 工作区放在命名卷里，重复构建只更新源码，不重来 npm ci。
tar -C /src --exclude=.git --exclude=node_modules --exclude=dist --exclude=out -cf - . | tar -C /work -xf -
# 宿主已构建好的纯 JS 产物直接复用；先删目标，否则重复构建会把 out/dist 拷成嵌套的 out/out
rm -rf /work/packages/print-core/dist /work/clients/print-client/out
cp -a /src/packages/print-core/dist /work/packages/print-core/dist
cp -a /src/clients/print-client/out /work/clients/print-client/out
# 图表执行器 dist（含注入用 IIFE 与 node 入口）不是纯 JS 源码产物的一部分，必须单独带进容器
rm -rf /work/packages/print-echarts/dist
cp -a /src/packages/print-echarts/dist /work/packages/print-echarts/dist

cd /work
LOCK_HASH=$(sha256sum package-lock.json | cut -c1-16)
if [ ! -d node_modules/electron-builder ] || [ "$(cat /work/.lock-hash 2>/dev/null || true)" != "$LOCK_HASH" ]; then
  npm ci --no-audit --no-fund --loglevel=warn
  echo "$LOCK_HASH" > /work/.lock-hash
else
  echo "依赖已就绪（lockfile 未变），跳过 npm ci"
fi

# 先在容器内出包，再挑三类 Linux 产物拷回宿主，避免动到 dist 里已有的 mac/win 安装包。
cd /work/clients/print-client
npx electron-builder --linux
cp -f dist/*.AppImage dist/*.deb dist/*.rpm /out/
echo "容器内产物："
ls -lh /out/*.AppImage /out/*.deb /out/*.rpm
`

// 网络镜像与宿主机保持一致（国内直连 GitHub 拉 Electron/工具链会超时）。
const envArgs = ['ELECTRON_MIRROR', 'ELECTRON_BUILDER_BINARIES_MIRROR']
  .filter(name => process.env[name])
  .flatMap(name => ['-e', name])

const args = [
  'run',
  '--rm',
  '--platform=linux/amd64',
  '-v', `${root}:/src:ro`,
  '-v', `${dist}:/out`,
  '-v', `${workVolume}:/work`,
  ...envArgs,
  image,
  'bash', '-c', script,
]

const result = spawnSync(docker.bin, args, { stdio: 'inherit' })
if (result.status !== 0) {
  console.error(`Linux 打包失败（退出码 ${result.status}）。首次构建需下载镜像与依赖，网络受限时先设置 ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR；若容器内 apt 拉不到 deb.debian.org，用 APT_MIRROR=https://mirrors.aliyun.com 换源。`)
  process.exit(result.status ?? 1)
}

console.log(`\n产物已写入 ${dist}：`)
console.log('  WormPrintClient-<version>-linux-amd64.deb')
console.log('  WormPrintClient-<version>-linux-x86_64.rpm')
console.log('  WormPrintClient-<version>-linux-x86_64.AppImage')
console.log('下一步：npm run pack:client:release 生成校验和清单与发行版附件上传命令。')
console.log(`（Linux 构建卷 ${workVolume} 可保留复用，需要彻底清理时执行 docker volume rm ${workVolume}）`)
