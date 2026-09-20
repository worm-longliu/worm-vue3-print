# v1.3.0 发布操作手册

> 生成时间：2026-09-20 ｜ 目标版本：`v1.3.0`（core / canvas / demo 已同步）
> 发布机制：`.github/workflows/release.yml` 为 **手动触发**（`workflow_dispatch`），推送标签不会自动发版。

## 一、发布前置（已全部完成）

| 项 | 状态 | 说明 |
|---|---|---|
| 版本号四处同步 | ✅ | 根包 `package.json`、`packages/print-core`、`packages/print-canvas`、`demo/package.json` 均为 `1.3.0` |
| lock 文件同步 | ✅ | 根 `package-lock.json`（4 处）、`demo/package-lock.json`（4 处） |
| `render` 对 core 依赖 | ✅ | `services/print-render/package.json` 由 `^1.2.2` 改为 `^1.3.0` |
| CHANGELOG 三处同步 | ✅ | `docs/中文/CHANGELOG.md`、`docs/en/CHANGELOG.en.md`、`packages/print-canvas/src/help-content/changelog.ts` |
| 使用说明文档 | ✅ | 模板设计器 / 使用指南 / 渲染管线 / API 文档均已补 1.3.0 能力 |
| 文档里写死的旧版本号 | ✅ | `README.md`、`skills/worm-vue3-print-integration` 的 `1.2.2` → `1.3.0` |
| Release 正文 | ✅ | `.github/release/notes.md`（中英双语，工作流 `body_path` 读取此文件） |
| 全量构建 | ✅ | `npm run build` core → client → render → canvas → print-client 全通过 |
| 全量测试 | ✅ | core 696 + canvas 308 + client-sdk 19 + print-client 90 = **1113 通过** |
| 架构守卫 | ✅ | `npm run lint:print-architecture` 通过 |

## 二、Git 操作命令

```bash
cd /Users/worm/worm/worm-vue3-print

# 1. 先看一眼改动面
git status --short
git diff --stat

# 2. 提交（Conventional Commits + 中文描述）
git add -A
git commit -m "chore(release): v1.3.0 多页面模板、页面旋转、批量打印、套打底图与出纸确定性修复"

# 3. 打附注标签
git tag -a v1.3.0 -m "v1.3.0：多页面模板 / 页面内容旋转 / 批量打印 / 设计背景（套打底图） / 条码点阵对齐 / 矢量水印三线同源"

# 4. 推送两个远端（origin=Gitee、github=GitHub，缺一会导致分叉）
git push origin master && git push origin v1.3.0
git push github master && git push github v1.3.0
```

## 三、本地命令行发布 npm（不走 CI 时的替代方案）

> 本机 `~/.npmrc` 的 `registry` 是 `https://registry.npmmirror.com`（淘宝镜像），**发布必须显式指定中央仓库** `--registry=https://registry.npmjs.org`，否则会向镜像源提交而失败。

```bash
cd /Users/worm/worm/worm-vue3-print

# 1. 登录（本机 ~/.npmrc 里已有的 authToken 已失效，npm whoami 返回 401，需重新登录；开启 2FA 时按提示输 OTP）
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org

# 2. 发布前试跑（不上传，只看包内容清单）
npm publish --dry-run --registry=https://registry.npmjs.org -w @worm-vue3-print/core
npm publish --dry-run --registry=https://registry.npmjs.org -w @worm-vue3-print/canvas

# 3. 正式发布：顺序固定，core 先发（canvas 依赖 core）
cd packages/print-core  && npm publish --access public --registry=https://registry.npmjs.org && cd -
cd packages/print-canvas && npm publish --access public --registry=https://registry.npmjs.org && cd -
```

若走了本地发布，GitHub Release 就不再走工作流的 publish 步骤（仓库 `NPM_TOKEN` 未配置时会在此步失败），此时应在 GitHub/Gitee 手工创建发行版。

## 四、GitHub Release + npm 发布

1. 打开 Actions → 选 **Release** → 右上角 `Run workflow`
2. `tag` 填 `v1.3.0`（标签必须已推送到 GitHub）
3. 工作流依次执行：`npm ci` → `npm run build` → `npm test` → **校验标签与 core/canvas 版本号一致** → 先发 `@worm-vue3-print/core`（canvas 依赖它）→ 再发 `@worm-vue3-print/canvas` → 最后用 `.github/release/notes.md` 自动创建 GitHub Release
4. 依赖 `secrets.NPM_TOKEN`，缺 Token 会在 publish 步骤失败（前面的步骤都跑完，属幂等可重试）

## 五、Gitee 发行版（手工）

Gitee 无 Actions，需手动创建：**仓库 → 发行版 → 新建发行版**

- 版本号 / 标签：`v1.3.0`
- 标题：`v1.3.0（2026-09-20）`
- 正文：直接粘贴 `.github/release/notes.md` 的**简体中文**部分（`# v1.3.0（2026-09-20）—— 简体中文` 之下、`## v1.3.0 (2026-09-20) — English` 之上的整段）

## 六、发布后核对

```bash
npm view @worm-vue3-print/core version     # 应输出 1.3.0
npm view @worm-vue3-print/canvas version   # 应输出 1.3.0
npm view @worm-vue3-print/canvas dependencies  # core 应为 ^1.0.0 或更高兼容范围
```

设计器「帮助 → 更新记录」应能看到 v1.3.0 小节（由 `print-canvas` 构建产物携带）。

## 七、回滚

- npm 包已发布不可删除：用 `npm dist-tag` 把 `latest` 指回上一个版本，并立即发 `1.3.1` 补丁。
  ```bash
  npm dist-tag set @worm-vue3-print/core@1.2.2 latest
  npm dist-tag set @worm-vue3-print/canvas@1.2.2 latest
  ```
- 标签仅在本地撤销：`git tag -d v1.3.0`；已推送则需 `git push --delete <remote> v1.3.0`（谨慎，Release 页面需同步删）。
