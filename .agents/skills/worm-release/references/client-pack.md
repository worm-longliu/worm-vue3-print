# 客户端安装包：判重打 → 出包 → 上传对账

## 一、先判要不要重打

判据是**客户端运行时依赖闭包**，不是「core 改了就重打」。闭包由 `npm run pack:client:prepare` 实构：
`core` → `contract` → `mcp` → `print-client`（`canvas` / `common` / `skills` 都不参与）。

| 计入 | 不计入 |
|---|---|
| `packages/print-{core,contract,mcp}/src/**` | `packages/print-{canvas,common,skills}/**` |
| `clients/print-client/src/**` | 任意 `*.test.ts` / `*.spec.ts` |
| `clients/print-client/{package.json,electron-builder.*,tsconfig*}` | `demo*/**`、`docs/**`、`services/print-render/**` |
| — | **纯版本号 bump**（升版那笔改的 client `package.json` 与 `mcp/src/version.ts`） |

```bash
node $REL client --version=X --base=v<上版>     # dry-run 先给出判据与命中文件清单
```

- 未命中 → 沿用上版安装包：README 直链整条留上版，本版 Release 不挂附件，正文注明沿用哪个 tag。
- 命中 → 六件重打（mac x64 / mac arm64 / win exe / linux deb / rpm / AppImage）+ `SHA256SUMS.txt`。
- `skills` 只被客户端拼成 npx 命令字符串，改它不重打。

**与仓库自检脚本的判据分歧（已核实）**：`scripts/check-release-carriers.mjs:95` 的重打正则只有
`packages/print-core/src/(render/|functions/format.ts)`，比上表窄。改到 `core/src` 的其它子目录、`contract`/`mcp` 的 `src`
或客户端自身 `src` 时，它会判「可沿用上版」而本技能判「需重打」——**以本技能的闭包为准**。
分歧有实际后果：此时若按重打把 README 直链切到本版，该脚本反而会因 `needsRepack=false` 判 README 那条 FAIL。

## 二、出包

```bash
export ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://cdn.npmmirror.com/binaries/electron-builder-binaries/
export APT_MIRROR=https://mirrors.aliyun.com          # 容器 apt 拉不到 deb.debian.org 时才需要
npm run pack:client                                   # mac + win（宿主）
npm run pack:client:linux                             # deb / rpm / AppImage（Docker）
node scripts/pack-client-release.mjs v<X.Y.Z>         # 生成 SHA256SUMS.txt 与上传命令
```

不设两个 Electron 镜像变量，`packaging platform=darwin` 之后拉 Electron 发行物会 `connect ETIMEDOUT`，与 npm 依赖无关。
Linux 走容器是因为 `rpm` 目标要 `rpmbuild`，macOS 宿主没有。镜像 `node:22-bookworm`（可用 `WORM_LINUX_BUILDER_IMAGE` 换）；
Docker Desktop 没起先 `open -a Docker`（约 40s 出 VM）。**不要并发跑两个 `build -w core`**，会撞半写 dist 报 ENOENT。

### dist 卫生（出包前后各一次）

`pack-client-release.mjs` 把 dist 里**所有** `.dmg/.exe/.deb/.rpm/.AppImage` 一并收进 `SHA256SUMS.txt`，
旧版混在里面就会挂错资产。`*.zip` / `*.blockmap` 是 electron-updater 元数据，脚本按扩展名排除，不必手删。

- **出包前**：上一版整批 `mv` 到 `~/print-client-dist/<上版>/`（可回移，**不删**）。
- **Linux 构建后必须再过一遍**：命名卷 `worm-print-client-linux-work` 里残留旧版 dist，
  容器末段 `cp -f dist/*.AppImage dist/*.deb dist/*.rpm /out/` 会把旧包一起拷回宿主。
- 判据：`ls clients/print-client/dist | grep -v <本版>` 只剩 `.icon-icns` / `.icon-ico` 之类中间物。

## 三、上传与对账

上传属**对外动作，单独要用户授权**；`--apply` 不是授权。

```bash
gh release upload v<X.Y.Z> clients/print-client/dist/<六件> clients/print-client/dist/SHA256SUMS.txt --clobber
```

六件并发上传（`Promise.all`）比串行快一个量级；mac-arm64 偶发连接重置，单件重试即可，不必整批重来。

**对账判据比「命令没报错」硬**：

```bash
gh api repos/worm-longliu/worm-vue3-print/releases/<id>/assets --jq '.[]|.name+" "+(.digest//"")'
```

GitHub 侧 `digest`（形如 `sha256:…`）与本地 `SHA256SUMS.txt` 逐条对齐。
**拿不到 digest 算证据缺失，不算通过**。同一 tag 上可能并存多条 release，定位一律用 release id，不用 tag。

本机 `github.com:443` 不通 ⇒ **不要用 `curl -sIL` 直链取 200 当判据**（会得 `000`），GitHub 侧证据一律走 `gh api`。

## 四、载荷内验的可达边界（无签名凭据前提下）

| 产物 | 取 `app.asar` 的办法 |
|---|---|
| mac dmg | `hdiutil attach -nobrowse -readonly`，取 `Contents/Resources/app.asar`（挂载点带空格，整体加引号） |
| win exe | 直接看 `dist/win-unpacked/resources/app.asar` |
| deb / rpm | `bsdtar -xf`（deb 再解一层 `data.tar.xz`） |
| AppImage | 内嵌 squashfs，**本机无工具可解**；需 Docker 内 `7z x` |

同一批产物的 asar 应逐字节同尺寸。AppImage 若只到校验和级证据，**如实标注未做载荷核对**，别写成已验证。

## 五、两条固定声明

- **未签名 / 未公证**：主程序与 Helper 带 Electron 预编译的 `adhoc,linker-signed`，arm64 不缺执行前提；
  缺的是 bundle 资源封印，只影响 Gatekeeper 提示。**不要为了发布自建 ad-hoc 重签**（提示会从「无法验证开发者」变成更差的「已损坏」）。
- **Linux 三包未经真机验证**：sandbox / fuse 坑要写进 README，不宣称已在 Linux 上跑通。