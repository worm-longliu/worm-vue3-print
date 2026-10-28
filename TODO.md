# TODO — 待办与对账台账

> **2026-10-28 V1.4.1 已全渠道发布**：本版唯一实变更为 `d6eadc8`（Gitee PR #1：条码/二维码设计态取值改为 formatter 优先，核心取值单点 `resolveBarcodeDesignValue` 新增 fallback 形参；canvas 2 处 + common 2 处收口）。**出纸渲染管线（`core/src/render/*`、`functions/format.ts`）零变更 ⇒ 客户端不重打包**，dist 里 V1.4.0 的 6 件安装包同名重传到 v1.4.1 发行版，SHA256SUMS 重算后 **GitHub digest 与本地 6/6 一致**`check-release-carriers` 判据已补「沿用上版安装包」口径：README 直链比 tag 版本、dist 只要求单版本内干净。版本号 `1.4.1`：九处 version + canvas/common/render 三处 core 依赖范围 + 六份 lock；中英 CHANGELOG、两份内置更新记录、README 直链与技能安装文档同步。annotated tag `v1.4.1` 落点 `1e5e51d`，origin/github 双推。GitHub Release 7 附件；Gitee 发行版 id `1249008`、target `1e5e51d`；README 7 条直链实测全部 200。npm 发布走 GitHub 流水线（本机 OTP 无法在代理 shell 交互）：publish-npm run `40656753323` 发 core/canvas、publish-common run `40656759282` 发 common，三包 `latest = 1.4.1` 已生效；`next` 仍为 `1.4.0-beta.0`。测试 core 81/1204、canvas 75/720、common 30/348、print-client 14/110（共 200 文件 2382 例全绿）。

> **2026-10-28 V1.4.0 已全渠道发布**：版本号 `1.4.0`（九处 version + 三处 core 依赖范围 + 六份 lock，common 随后按主线号发 `1.4.0` 正式版，见下条）；CHANGELOG 里从未发布过的 V1.3.12 段整体改为 `V1.4.0(2026-10-28)`，并补「并排紧尺寸标签重复计高」修复一条到四载体。annotated tag `v1.4.0` 落点 `174f8dd`，origin/github 双推。GitHub Release 7 附件（6 安装包 + SHA256SUMS），**GitHub digest 与本地 SHA256SUMS 6/6 一致**；Gitee 发行版 id `1248530`、正文 1787 字、target `174f8dd`；README 7 条直链实测全部 200。测试 core 80/1200、canvas 75/714、common 30/344、print-client 14/110（共 199 文件 2368 例），`verify-demo` 四宿主 52/52 ×4。构建坑复现：Electron 重新下载卡在代理（73KB/s）→ 设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后正常；Docker 命名卷再次把 1.3.10/1.3.11 Linux 包带回 dist，已移出到 `~/print-client-dist/` 并重算 SHA256SUMS。
> **2026-10-28 common 1.4.0 正式版已发布**：版本与主线同号，dist-tag `latest = 1.4.0`（GitHub Actions run 40651083013，发布步骤成功；registry 处理约 5 分钟后生效）；`next` 仍为上一轮 `1.4.0-beta.0`，不再作为安装入口。npm 主页面保留「实验性质、不建议用于生产」声明，并含 Vue 3 / Vue 2 / React 三段示例（已核对 tarball README）。
> **仍待维护者**：如要把 `next` 同步到 1.4.0 或删除，需要本机 OTP（npm 令牌改 dist-tag 返回 403）；core/canvas 1.4.0 已在 npm 线上。
> 取证基线：`master` @ `d913e32`（含 T-26 的 `8bac872`；本轮 C1/T-27/T-15 改动尚在工作区未提交）。上一轮全量复验基线 `cd6e7c1`（tag `v1.3.10`）；包版本 core/canvas/print-client `1.3.10`、common `1.3.7-beta.0`。
> **2026-10-26 交接口径（最新）**：本轮全部改动已双推，`origin`/`github` 同指 `1eed485`，工作区干净。
> **V1.3.11 已发布到除 npm 外的全部渠道**：annotated tag `v1.3.11`（落点 `f728137`）、GitHub Release（七件附件 digit 7/7 对账）、Gitee 发行版（id `1242392`，正文 4889 字）、README 七条直链实测可达。
> **唯一未完成**：npm 上 core/canvas 仍是 `1.3.10`（本机 `whoami` 401），common 的 `latest` 仍指预览版。
> 另：#IKPXQL 的公开错话已按载荷级实测更正（评论 id 51816315，复核 `state=closed / comments=2`）。
> **2026-10-26 续作**：T-28（longText 缺省行高）已按方案 A 修完并折进尚未发布的 V1.3.11 段，四载体同步、sync-assets 已重跑；T-29（`wordWrap:false` 三份手写实现收编）已完成并双推；T-22（canvas 测试类型错 53→0 并接入 pretest）已完成并双推；T-24（GitHub #6 右键菜单）已定性为**本机两宿主自动化下均正常、未能复现**，并撤回了上一稿的误报（见该条）。
> **2026-10-26 再续**：T-16（四宿主字体链路）与 T-19b（预览缩放档位断言）已完成并双推，`verify-demo` 42 项 ×4 全绿。
> **2026-10-26 发版进展**：`v1.3.11` annotated tag 已建并双推，落点 `f728137`（最后把改动登记进 V1.3.11 段的提交）；GitHub Release 已创建（`V1.3.11(2026-10-26)`，非草稿、0 附件、正文来自 `.github/release/notes.md`）。
> **Gitee 发行版已建**（2026-10-26）：id `1242392`，tag `v1.3.11`，`target_commitish=f728137`，正文＝中文 CHANGELOG 的 V1.3.11 段（4889 字），匿名复核 15 条发行版里已有 v1.3.11、assets 2（自动源码包）。**首次用 owner 级路径 POST 回 405**——releases 必须走仓库级 `/repos/{owner}/{repo}/releases`。
> **安装包已完成（2026-10-26）**：按用户口径先查「客户端是否变更」——客户端**源码**只改了 package.json 版本号，但客户端 `"@worm-vue3-print/core": "*"` 且内置 core，而 core 的 `render/*`（html-generator / pagination-engine / text-fit）有实质改动 ⇒ 装进客户端的出纸行为变了，按判据必须本版重打；mac/win（mac-x64/mac-arm64 dmg + win exe）与 Linux 三包（deb/rpm/AppImage）已全部重打并上传 v1.3.11，**GitHub 侧 digest 与本地 SHA256SUMS 逐条对账 7/7 一致**（97.2–139.4 MB）。两个坑已修/已记：① 并发跑两个 `build -w core` 会让 electron-builder 撞到半写状态的 `dist/browser/index.d.cts`（改为只单跑 electron-builder）；② 容器内 `apt install rpm` 拉不到 deb.debian.org，给 `pack-client-linux.mjs` 加了 `APT_MIRROR` 支持（本次用 https://mirrors.aliyun.com 出包）；③ 命名卷照旧把上一版 Linux 三包带回 dist，已移出到 `~/print-client-dist/1.3.10-linux/`。
> **README 直链已实测可达**：7 条 v1.3.11 直链逐一 curl（HEAD 跟随 + AppImage 用范围 GET 复核）——6 条 200、AppImage 经 1 次 302 跳转到签名地址后 200/206，全部可用。
> **仍待维护者**：npm 发布 core/canvas 1.3.11（本机 `whoami` 401，多轮复测未变）、common 预览版重发与 `latest` 摘除。
> **2026-10-26 发布前复核**：`npm pack` 三包产物里四条修复全在（`needsHeight` 含 `vline`、`overflow:visible;${nowrap}`、`keepLineBreaks`、`resolveElementNowrap`、`line-height:1.5`），canvas 内置更新记录含 V1.3.11；`npm publish --dry-run`：core 1.3.11 / 30 文件 / 346.0 kB / tag latest，canvas 1.3.11 / 86 文件 / 241.7 kB / tag latest，common 1.3.7-beta.0 / 44 文件 / 423.8 kB / tag next（需带脚本那组 flag）。**本机默认 registry 是 npmmirror**，手敲 publish 会发错源，已在 CONTRIBUTING 记红线。
> **T-11 C2 已按口径 A 实施并双推**（相交才跟随；20/20 产物一致，变异自证红→绿）。原影响面记录：：资产级横向零交集成员 0 例（8 份模板/15 成员），复现确认 `far`/`over` 仍被吸收、`under` 应当跟随；口径 A/B 待你选，选完按「与 C3 同一轮」实施。待裁决新登记：**T-28**（longText 缺省行高 1.5 vs 出纸 normal）、**T-29**（`wordWrap:false` 三份手写实现待收编），以及原有 T-11 C2、T-24 定性、T-16/T-19b、T-22、T-25。

> **2026-10-28 预览默认档（本轮）**：打印预览查看缩放按方案 B 改完——默认档从「有 `printerDpi` 落点阵、否则适配」改为**恒 100%**（core `defaultZoomKey` 单点），点阵档留在档位表首位并新增 core `viewZoomHint(dpi, currentKey)` 出切档提示，画布预览层与四宿主档位条同源显示。实测：canvas `PreviewZoom.spec` 改前 9/9、改后 10/10（两处变异各被 3 条/1 条断言抓住）；canvas 全量 75 文件/714 例、common 30 文件/344 例全绿；`verify-demo` 四宿主（9331/9332/9335/9334）**52/52 ×4**，其中「默认档为 100%（`active=100% zoom=1`）」与「带打印分辨率给点阵切档提示」是本轮把原「默认档与出纸文档缩放一致」一条拆成的两条（**改前 verify-demo 未单独跑基线**）。出纸产物与分页零变化（缩放只写预览文档，`@media print` 复位守卫不动）。
> **本文件只挂未完成项。** 已完成条目压成文末「已完成归档」一行一条；原实施正文、批次记录、浏览器验证实测与探针坑明细
> 已从本文件移出，可在 `git show HEAD:TODO.md`（截至 `cd6e7c1` 的 775 行版）与中英 CHANGELOG 里取回。
>
> **2026-10-26 全量复验**（新鲜跑，非引用旧记录）：`npm run build` exit 0；`npm test` exit 0
> （core 77 文件/1118 例、canvas 72/679、common 26/315、print-client 14/110，合计 189 文件/2222 例零失败）；
> `npm run test -w @worm-vue3-print/render` exit 0（9/30，真实 Chromium）；`verify-demo.mjs` 四宿主 36/36 ×4；
> canvas `npx vue-tsc --noEmit` **exit 2 / 53 条**（T-22）。

## 标记口径

| 标记 | 含义 |
|---|---|
| 【成立】 | 断言与代码一致，已逐坐标或运行时确认 |
| 【口径修正】 | 现象成立，但原描述的性质/影响面需改 |
| 【已推翻】 | 断言不成立，**不要按原话实施** |
| 【新增】 | 核实时新发现，原台账/issue 未提及 |

---

## 一、待办清单

### T-15 common 发布面 —— **1.4.0 正式版已发 latest**

- **dist-tag 实况（2026-10-28）**：`latest = 1.4.0`（正式版），`next = 1.4.0-beta.0`（上一轮预发布，不再作为安装入口）。
  安装直接 `npm i @worm-vue3-print/common`；npm 主页面保留实验性声明并提供 Vue 3 / Vue 2 / React 示例。
- **预发布通路保留**：`publish:common:beta`（`--tag next`）只用于预发布；正式版走 `publish:common` 或 `publish-common.yml`。
  仓库令牌可 publish，但 `dist-tag rm/add` 返回 403；如需调整 `next`，维护者本机 OTP 执行。
- **【已解决】预览版曾落后主线 40 个提交**：2026-10-28 已重发 `1.4.0-beta.0`，四个 common 宿主 demo 与 npm 上的预览版恢复同源。
- **【口径修正】原「`latest` 尚不存在，省略 `@next` 会报错」是假的**：README / 包内 README / 集成技能三处都这么写，
  2026-10-26 实测官方 registry 回 `{"latest":"1.3.7-beta.0","next":"1.3.7-beta.0"}` —— 裸写 `npm i @worm-vue3-print/common`
  **不报错、静默装到实验包**（npm 给新包首发自动打 `latest`，`--tag next` 挡不住）。三处文档已按实测更正。
- **仓库侧已固化判据**：新增 `scripts/check-common-dist-tag.mjs`（exit 0 健康 / 1 红灯并给出修复命令 / 2 读不到），
  已串进 `publish:common:beta`（发布后自动 `--fix` 摘 `latest`）与 `publish:common:dry-run`（`--dry-run` 只报不改），单独复查 `npm run publish:common:check`。
  实跑判据：`node scripts/check-common-dist-tag.mjs` → 红灯 exit 1（本机未登录 npm，未做 registry 写）。
  本轮再加两点：**① 我先前把它挂在 `publish:common:dry-run` 链尾是设计缺陷**——既有红灯会把演练判成失败，破坏了文档里「演练 exit 0」的约定；已加 `--warn-only`（照旧打印但 exit 0），实测 `npm run publish:common:dry-run` 回到 **exit 0**（core 77/canvas 73/common 27 全绿、tarball 44 文件 / 422.6 kB、`with tag next`）。**② 试过 `publishConfig.tag` 作结构性兜底，实测无效**（npm 11.19 不带 `--tag` 的 dry-run 仍报 `tag latest`；`access`/`registry` 两项生效并已留在包里）。防线只剩脚本的 `--tag next` 与发布后 `--fix`，别再往 `publishConfig.tag` 上加注。
  **`--fix`/`--dry-run` 四条分支已用离线 npm shim 跑满**（shim 忠实模拟「摘掉 latest 后 npm 不再回该键」）：
  A 现状预览版占 latest→exit 1｜B `latest` 是正式版→exit 0 并提示转正同步文档｜C `latest` 缺失→exit 0｜
  D `--fix`→确实调用 `dist-tag rm` 且复查后 `latest` 消失→exit 0｜E `--dry-run`→exit 1 且 shim 里**没有任何写调用**、状态文件未变。
  `verify-demo` 四宿主 36/36 ×4 本轮新鲜重跑；技能 `template-schema.md` 的 `wordWrap` 行与 `docs/中文/指南/模板设计器.md` 的 `textFit` 三档已回写单行溢出/版本边界口径；`build_template.py` 的 `COMMON_ALIAS` 补了 `keepLineBreaks`（此前技能生成不出该字段），端到端跑通：生成→校验 0 项→core 落值出 nowrap 不出 pre-wrap。
- **剩一条只能维护者本机做**：`npm login` 后跑 `node scripts/check-common-dist-tag.mjs --fix` 摘掉 `latest`；
  以及按既有口径走 `publish:common:beta` 重发预览版（该包已落后主线 40+ 笔提交）。

### T-24 GitHub #6 表格右键菜单很难唤醒 —— **本机两宿主自动化下均正常，未能复现**（2026-10-26 定性）

- **对外结论**：在 demo 9303（Vue3 画布）与 common 9331（零框架宿主）上，用 CDP 真实输入右键表格单元格，
  单元格菜单**稳定唤出**：9303 逐帧 30 帧持续在场（`.table-ctx-menu`）、事件序列 `mousedown(b2) → contextmenu(b2) → mouseup(b2)`；
  9331 菜单渲染在 shadow 内（`shell/table.ts` 注释即如此），穿透 shadow 后量到 **142×398 px、12 个菜单项**。
  ⇒ 四条既有口径（右键先单选、外点关闭、单元格右键不要求先选中、菜单项点击收起）在该构建上成立，**GitHub #6 未复现**。
- **公开撤回我此前的误报**：本台账上一稿写过「三台探针 1/6、0/18、菜单未进 DOM，命中层通但菜单不渲染」。**那是错的**——
  我的探针只查 `.context-menu`，而**单元格菜单的类名是 `.table-ctx-menu`**，且 print-common 的菜单渲染在 shadow root 内；
  换成正确选择器并逐帧采样后，两个宿主都稳定出菜单。责任在探针，不在产品；该结论已作废。
- **仍未解释的部分**：报告人（GitHub #6）在**他的环境**下遇到「很难唤醒」。本机两条通路都正常，说明差异可能来自
  ① 平台（Windows 原生 contextmenu 时序与 macOS 不同）；② 具体模板（超大表格 / 画布滚动容器内 / 缩放档位）；
  ③ 高负载下 `nextTick` 翻转定位的时序。**这些本机都复现不了，不能靠猜**。
- 下一步（需要报告人或 Windows 实机）：
  1. 请报告人补：操作系统与浏览器版本、是否在缩放档（点阵/适配/200%）下、表格是否超出画布可视区需滚动、出现频率；
  2. Windows 实机按同一探针法（右键格中心 → 逐帧数 `.table-ctx-menu`）量命中率，与本机 30/30 对照；
  3. 若确认平台相关，再查 `TableElement.vue` 的 `menu.visible` 置位与 `window.addEventListener('mouseup', closeMenuOnOutsideMouseup)`
     在同一手势里的先后——本机实测 mouseup 晚于 contextmenu 约 40ms 且菜单未被关掉，说明这段时序本身是安全的。
- 本项**未改任何代码**；一次性探针已全部删除。


### T-25 Linux 三包真机与 `cross-end` 比对（cross-end 已跑通两腿，Linux 真机仍缺）

- **2026-10-26：cross-end 已在两腿之间真实执行**（此前台账写「因缺客户端 PDF 未执行」）：
  - 服务端腿：直接走 print-render 的代码路径（`createDomHostRuntime` + playwright driver + `renderPdf`）产 PDF，
    模板刻意含 T-27（关自动换行）与 T-28（longText 缺省行高）的三段长文本 → `pageCount=1`、47507 字节；
  - 客户端腿：用客户端自己的 `createElectronDriverFactory`（Electron 隐藏窗口测量 + `printToPDF`，与打印引擎同一套代码）产 PDF
    → `pageCount=1`、47416 字节；
  - 比对：`node services/print-render/src/cross-end.parity.mjs` → 两端 `MediaBox [0 0 595.91998 841.91998]`、**页数与纸尺寸一致，exit 0**。
- **顺带修掉比对脚本自身的两个缺陷**（此前台账把失败误诊成「解析不了服务端 PDF」）：
  1. **位置参数错位**：`const [, serverPdf, clientPdf] = process.argv` 把 `argv[1]`（脚本自身路径）当成了服务端 PDF，
     第二份文件从未被读取 —— 所以无论喂什么，服务端一栏恒为「未解析到」。已改为 `[, , serverPdf, clientPdf]`；
  2. 读不到文件时抛原始 ENOENT 栈且 exit 1，现改为一句可读提示 + **exit 2**（与「不一致 exit 1」区分）。
- **本机跑 Electron 的坑（记下来）**：agent shell 里 `ELECTRON_RUN_AS_NODE=1` 已设置，直接 `npx electron x.cjs` 会以 Node 模式跑、
  `require('electron').app` 为 undefined；必须先 `env -u ELECTRON_RUN_AS_NODE`。另外**同一进程连开两个隐藏窗口**会报
  `bootstrap_look_up ... Permission denied`，故取证脚本只调一次 `renderPdf`（内部自含 prepare）。
- **仍缺**：Linux 三包真机安装与出纸；本机无 Linux 设备与签名凭据。


---

## 二、本轮对台账的更正（2026-10-26 复验）
1. **T-22 的 49 条 → 实测 53 条**（涨幅来自近期改动过的 spec）。
2. **T-19b「verify-demo 不含顶栏收纳断言」不属实**——收纳两条在 T-10 轮已入库；真实缺口只剩缩放档位与字体链路。
3. **V1.3.10「待办：npm 由维护者手工发 `1.3.10`」实际已完成**：官方 registry `core` 与 `canvas` 的 `latest` 均为 `1.3.10`。
4. **T-07b 的前提被推翻**，改为公共面定性题（见该条）。
5. **Gitee 台账缺两条**：`#IKPMYK`（条码打印问题·严重，10-22 提，10-26 08:58 以「1.3.10 版本已经修复更新」关闭，comments 5）
   与 `#IKPXQL`（10-26 08:52 关闭）此前完全未登记。`#IKPMYK` 的修复确实落在 V1.3.10 段（条高 `barHeight`、静区 `barQuietZone`、
   条宽倍率上限 4→8、按 `printerDpi` 给推荐档、单元格条码字号改取 `barFontSize ?? fontSize`），只是 issue 编号没进任何载体。
6. **`#IKIPD9` 状态已变**：原台账写「未动（无证据表明同一缺陷）」，实况是 10-22 被标为 `rejected`（comments 2）。对外已收口，只是没登记。

## 二·补 同族形态横向对账（2026-10-26，C1/T-27 修完后穷举同类漏点）

修完两条后，把「同一类写法」在渲染层扫了一遍，结论是**没有兄弟缺陷**，且我的一条怀疑被复现推翻：

1. **「按类型白名单决定发不发 `height`」这一形态**：全仓只有 `html-generator.ts:895` 一处（就是 C1 那条），无其它白名单遗漏。
   页眉/页脚与拼版走的不是这条——它们复用 `elementPositionStyle`（`css-builder.ts:384`），实测页眉 vline 出
   `width:1.8mm;height:14mm;…border-left…` 正常、hline 出 `height:1.8mm;…height:0`（后者是有意覆盖）。**C1 的影响面就到跟随区为止。**
2. **「提前 `return` 吞掉后续声明」这一形态**：元素级（`:409`）已修；单元格级 `:727` 我怀疑同族，**直调 dist 复现后被推翻**——
   `textFit:'autoHeight'` + `wordWrap:false` 的单元格照样出 `white-space:nowrap;overflow:hidden`，因为 td 层的换行声明
   与内层定高容器是两条独立通路（`resolveCellTextFit` 在缺省时也把「不换行」判成 `clip`）。画布 `TableElement.vue:292-293`
   同语义（`pre-wrap` / `nowrap` 二选一），两端一致。**不要按「单元格也有这个 bug」去改代码。**
3. 其余 `return ''` 落点（`:419` fitAttrs、`:800`/`:832` 小计汇总行、`:888` 找不到跟随元素）与本族无关。

### 资产级静态扫描（分页引擎自己的判据，13 份示例 + 8 份技能模板 + 3 份 demo JSON）

补这条是因为我原来的存量结论只到「改前/改后产物逐字一致」，而**没证那批产物里到底有没有真的跑出跟随区**——现在用引擎判据扫完：

- **跟随区路径被真实命中 4 份**：`purchase-receipt`(1 个跟随元素)、`sales-outbound`(5)、`comprehensive-showcase`(1)、`thermal-receipt`(**8，其中含一条 `hline` = `rc-16`**)。
  ⇒ 「harness 里没产生跟随区」这个担忧不成立；且 thermal-receipt 那条 hline 是**天然负对照**：它落在 C1 改动的同一条判据上，改前后字节一致，
  反向证明「不该动的没动」。**技能资产与 demo JSON 与示例同形**（同一份 hline 也出现在 `thermal-receipt.template.json`）。
- **`vline` 在跟随区里零命中** ⇒ C1 在仓库全部资产上**零影响**，受益面只在外部用户模板（#IKPXQL 那类「表格下方放竖线要跟着走」的形态）。
- **`wordWrap: false` 的 text/longText 在仓库资产上零命中** ⇒ T-27 的存量影响面在仓库内同样为零，
  改前/改后 25/31 一致这件事从此有了第二种独立证法（静态扫描 + 字节比对互证），不再只靠一次 harness。
- 局限如实记：`pagination-edge` 与各 `*.data.json` 在该 harness 下报 `template.margins` 缺失（前者是多页包装结构、后者是数据文件），属扫描器口径而非模板缺陷。


---

## 三、对外动作的通路（执行 T-14 与对外回帖前先看）

- 私人令牌在 `~/.zshenv`，**变量名是 `GITEE_ACCESS_TOKEN`**（2026-10-26 实测 `GITEE_TOKEN` 长度为 0，用它发写请求回 `401 Access token does not exist`）。`access_token` 表单参数对 issue 写操作有效；`Bearer` 头这次实测回「登录失效，无权限访问该资源」，**别再按旧口径用 Bearer 试写操作**。
- **issue 写操作走 owner 级端点**：`POST /api/v5/repos/{owner}/issues`、`PATCH .../issues/{number}`，body 的 `repo` 只填仓库名；
  GitHub 式 `/repos/{owner}/{repo}/issues` 在写操作上不存在，误用报的 404 措辞不指向格式错误。
  发行版：`POST /repos/{owner}/{repo}/releases` **必须带 `target_commitish`**（漏了回 400），`PATCH .../releases/{id}` 改正文不必带。
- 仓库配置「已完成 / 已拒绝的 issue 不允许评论」→ 给已关闭的 issue 补通知必须先重开（T-23 即此形态）。
- 写操作后一律用**匿名 GET 复核**落库与 `comments` 计数，防「报错但其实写进去了」或「以为发了其实没发」。
- 浏览器通路两个坑：`fill` 不激活提交按钮（需真点击，点两次会重复发帖——T-14 的重条评论即此形态）；
  自己评论的删除菜单不进无障碍快照，程序化点不到。
- 查 npm 发布面一律加 `--registry=https://registry.npmjs.org`，npmmirror 会滞后一个版本。
- **发版载体自检**：`npm run check:release-carriers`（自动判态）/ 加 `-- --post` 发版后复核 / 加 `-- --base=<上个有资产的 tag>` 判安装包要不要重打。
  它专查历史上真出过的三次事故（内置更新记录漏条目、README 直链指旧版、`clients/print-client/dist` 混旧包）。
  本轮实跑：默认态 FAIL 0 / WARN 2（未发布段待折叠 + 需升号），`--post` 态按预期回 FAIL 1 / exit 1；
  开发过程中它自己有两个 bug 被跑出来了——`(.*?)` 漏 `s` 标志导致未发布段读空、把待发内容误判成"已清空"，以及一处被 Edit 吞掉的换行造成语法错——都已修并复跑。
- GitHub 侧用 `gh api`，URL 含 `?` 必须整体加引号，否则 zsh 报 `no matches found` 并中断整条命令。

---

## 四、已完成归档（一行一条；正文与取证明细见 git 历史与 CHANGELOG）

| 项 | 一句话结论 | 本轮验证方式 |
|---|---|---|
| T-23b | #IKPXQL 那条「请更新最新版本，当前最新版本已经解决」已按载荷级实测更正：重开 → 贴更正（评论 id 51816315，逐条区分 1.3.10 已生效 / V1.3.11 才有的元素级换行）→ 再关闭；匿名复核 `state=closed`、`comments=2` | 三步写操作 + 匿名 GET 复核 |
| T-28 | longText 缺省行高三端不一致已修：出纸在未设 `lineHeight` 时补 `line-height:1.5`（无单位，不覆盖显式 pt）；**存量影响**：29 份产物 25 份一致，差异只有 4 组「longText + 未设行高」各多一条声明，示例库 13 份 + 技能 8 份全未变（资产里 longText 未设行高者 0 个，未设行高的 85 个全是 `text` 且三端本就 normal）；真实 Chromium 每行 22px→24px 与画布同值 | RED/GREEN + 逐份 cmp + Chromium 行盒 + 四载体回写（中英 CHANGELOG / 两份 help-content / 指南 / 技能） |
| T-29 | `wordWrap === false → nowrap` 已收编到 core 单点：新增 `resolveElementNowrap`（随 `/designer` 导出），出纸 `elementFitStyle`、画布 `Text/LongTextElement`、print-common `textLikeStyle` 三端消费同一份；单元格那两处（td 层与 cell-fit 层）属另一套语义，按原样保留 | core 2 条判据用例 + 三端既有落值用例 + 出纸声明逐字复核（`line-height:1.5;overflow:visible;white-space:nowrap;text-overflow:ellipsis;`） |
| T-22 | canvas 测试类型错 **53 → 0**：`tableColWidths` 非空断言 16、`pages` 夹具按最小对象构造并标 `TemplateData` 11、`borders`/`dots` 可空 2、`VueNode.value` 转 `HTMLInputElement`/`HTMLSelectElement` 5、隐式 any 6、`toEqual` 消息参数位置 1、单元格夹具补 `id` 9、TableCellImage 夹具 cast 1 等；并把 `vue-tsc --noEmit` 接进 canvas 的 `pretest`（变异验证：故意插一条类型错 → 门禁 exit 2 且 vitest 根本没跑） | vue-tsc 计数 53→0 + canvas 73 文件/688 例全绿 + 变异自证 |
| T-16 | 四个 common 宿主接上字体链路：各加 `fontsOf(tpl)`（多页合并、按 family 去重）并在 `el.template` 之后赋 `el.fonts`；证据：`verify-demo` 新增 3 条断言——带字体示例声明 3 个字体 / `@font-face` 3 条进文档 / 下拉 1 默认 + 3 候选；**变异自证**：撤掉 vue3 宿主的注入后两条立即变红（matched=0/3、options=1），恢复即绿 | 四宿主 42/42 ×4 实跑 |
| T-19b | 预览缩放档位断言补齐：五档齐（点阵 203dpi/适配/100%/200%/400%）、默认档与出纸文档缩放一致（实测 `html{zoom:2.11458}` = 203/96）、说明文案与 `@media print{html{zoom:1 !important}}` 复位守卫在位；`verify-demo` 由 36 项增至 **42 项** | 四宿主 42/42 ×4 实跑 |
| T-07b | `resolveToolbarOverflow` 按推荐口径 ① 定性为**公开契约**：core README 新增「`/designer` 的稳定面」小节，登记收纳判据（入参 + 链序）、三档文字显示判据、`resolveElementWhiteSpace`/`resolveElementNowrap`、预览缩放六个导出、元素边框五个编辑函数，并写明破坏性变更需 minor 及以上；方案 ②（收回）因四个宿主断链不采用。登记前逐个核过真实导出名（我初稿里编的 `resolvePreviewZoomPresets` 并不存在，已按源码改正） | README 登记 + `designer/index.ts` 导出链核对 |
| T-11 C2 | 跟随区不再无条件吸收：`buildFollowMap` 增「与表格横向相交」判据（表格横向区间取列宽和，缺列宽退回元素宽），零交集的元素保持原地；**并保留同列正下方照旧跟随**。用例：旁侧 far/over 不被跟随 + 贴右缘视为不相交/压住一格则相交；**变异自证**：撤判据后两条用例变红（2 failed），恢复即绿；**存量**：20 份产物逐字比对 20/20 一致 | RED→GREEN + 资产级逐字比对 + 变异自证 |
| T-14 ② | #IKOYG0 那条重复评论已删：`DELETE /issues/comments/51703090` 回 **204**，保留首条 51703062；匿名复核评论数 **5 → 4**、issue `comments=4`、`state=closed` | 删除前读回正文与时间确认重复、删后匿名复核 |
| T-26 | 元素级 `\n` 与前导空格已支持：新增 `keepLineBreaks` 档（缺省关），判据单点 core `resolveElementWhiteSpace`，三端消费同一份；属性台两端同位置同文案；已折进 V1.3.11 段并随 tag 发出 | 27 份真实管线产物逐字比对 + 两端 UI 实测 |
| T-23 | #IKPXQL 已闭环：需求1（单元格内温馨提示 + 出纸跟随 + 首行缩进）1.3.10 已生效；需求2 的元素级换行随 V1.3.11 的 `keepLineBreaks` 支持；C1/C2 两条同源缺陷均已修；公开更正帖已发（id 51816315）。**唯一遗留**：npm 上仍是 1.3.10，装不到该档 | 真实两趟管线 + 载荷级核对 + 匿名复核 |
| D-1 / D-2 / D-3 / D-4 | 拍板 `em` / CSS 值原样透传 / 删除字段 / 工具栏自适应收纳 | 随各条 |
| T-01 | 长文本首行缩进出纸生效：新增 `indentStyle()` 仅 `case 'longText'` 出 `text-indent:Nem`，画布与 common 两处 `pt`→`em` | 代码坐标 + core/canvas/common 单测 + render 集成 30 例全绿 |
| T-02 | 独立 image 的 `object-fit` 不再写死 `contain`，改 `opts.fit \|\| 'contain'`；未设 `fit` 的存量模板逐字不变 | 同上（缺省路径已用断言锁死） |
| T-03 | `objectPosition` 裁剪锚点贯通 core + `data-binder` 逐字段透传 + 画布两端 + common，非法值整条丢弃 | 同上 + 单元格链路用例 |
| T-04 | `TextAlign` 加 `justify`，三端同策（flex 主轴转纵向 + `text-align-last:justify`），单元格第 4 档「两端」同源 | 同上 |
| T-05a–d | 硬编码浅色改 `var(--pd-*, 原值)`，新令牌登记在 `.designer-container`；`.pd-switch::after` 白底显式豁免 | 代码坐标 + `npm run build`/`npm test` 绿；深色注入的浏览器证据系 2026-10-19 所取，本轮未重做 |
| T-06 | 僵尸字段 `lHeight`、`leftSpaceRemoved` 已删净（全仓仅 CHANGELOG 提及） | 精确 grep 源码零命中 |
| T-07 / T-07a | 工具栏自适应收纳（core 共用判定）+ `.tb-more-panel` 最小宽修掉嵌套浮层横向溢出 | 代码坐标（`native-controls.css:386`）+ 收纳两条断言实测在位 |
| T-08 | `PresetColorPicker` 多根告警收口：`defineOptions({ inheritAttrs: false })` + 触发器 `v-bind="$attrs"`，class 落到真实 `div` | `PropertyPanel.vue:124-129` + canvas 单测绿 |
| T-09 | 文档/技能同步：中英 CHANGELOG、`使用指南.md`、`模板设计器.md`、技能 `template-schema.md`，两份内置更新记录均含 V1.3.10 | grep 命中核对 |
| T-10 | demo-common 四宿主顶栏接入收纳 | `verify-demo` 36/36 ×4 新鲜实测 |
| T-12 | #IKP3MU 已回帖（现 `closed`）；#IKIPD9 现 `rejected`（本轮补登记，见 §二.6） | 匿名 API 复核 |
| T-13 | #IKN95F 已回帖通知升级验证，issue `closed`（comments 7） | 匿名 API 复核 |
| T-14 ① | 1.3.8 三处更新记录已登记并回帖（② 仍待办） | 匿名 API 复核 |
| T-17 | 未求值表达式不再当真实图：判据单点收在 `resolveCropPreview()`（空或含 `{`/`}` 即视为无图）+ `@error` 清尺寸 + 取景框 `fit-content` | `crop-anchor.ts:222` 坐标 + 用例绿 |
| T-18 | 素材台长字段名自适应换行（`.node-meta` `flex-wrap`），并入 V1.3.8 重发、已回帖关闭 | 匿名 API 复核 `closed` |
| T-19 | 预览缩放档位判据下沉 core `preview-zoom.ts`，`usePreviewZoom.ts` 删除，四宿主补档位条 | **浏览器动态实测**：9331/9334 五档齐、默认点阵 203dpi、`computed zoom=2.11458`、print 复位守卫在位 |
| T-19b | 宿主顶栏收纳四条缺口（派生产物过期、弹性占位、状态类、兜底类名）已修，判定改调 core | `verify-demo` 收纳两条 + 五档实测收起数 |
| T-20 | 三处分叉全改 canvas：`:target` 传原始值、`LayerPanel` 补 `flowList: '⊟'`、`FlowListGroup` 补 `.pd-help` | `PropertyPanel.vue:124`、`LayerPanel.vue:70`、`FlowListGroup.vue` 9 处命中 + canvas 72 文件全绿 |
| T-21 | 五条备案落地：静区留空靠占位、字体候选收紧成 canvas 判据、模糊匹配单点到 core、技能脚本补 `flowList`、common 类型红清零 | `print-common/src/core/font-catalog.ts` 已不存在 + common 26 文件/315 例全绿 |
| T-11 C1 | 跟随区 `vline` 丢高度已修：`html-generator` 的 `needsHeight` 补 `vline`（`hline` 的 `height:0` 有意为之，未动）；正对照 rect/oval/image、负对照 hline 各一条用例 | RED→GREEN 实跑（改前 3 红、改后 core 77 文件/1137 例全绿）+ 跟随区产物逐字比对 + 真实 Chromium 落纸（vline 0px→52.91px=14mm，hline 逐值不变） |
| T-27 | 长文本关「自动换行」出纸不生效已修：`elementFitStyle()` 不再在 `autoHeight` 分支提前 `return`，改为 `overflow:visible;` 与 `white-space:nowrap;text-overflow:ellipsis;` 拼接（与画布/Common 逐字同形）。**属可见行为变更，按 minor**：凡关自动换行且未显式设溢出形式的 text/longText，出纸从多行折变单行，`autoHeight` 实测高度随之收缩为 1 行。**分页落点不变**（真实两趟管线实测：内容底边越出内容区 3mm 的形态两档同页，独立元素按 `top` 归页）——撤回上一稿「可能牵动分页」的说法。31 份产物逐字比对：25 份一致，差异只多出这一条声明、全部落在 `wordWrap:false` + `autoHeight` 的 5 组组合，示例库 13 份全一致（无用例采该组合）；`pagination-edge` 在该离线 harness 出不了纸，属取证局限 | RED→GREEN 实跑 + 改前/改后 dist 产物 `cmp` 逐份比对 + 真实 Chromium 行盒（4 行→1 行、6.67px、溢出 816px） + **三端各自落值用例齐备**（canvas `KeepLineBreaks.spec` 与 common `keep-line-breaks.spec` 各补 1 条「longText 关自动换行：`overflow:visible` 与 `nowrap` 并存」，含负对照） |
| C1/T-27 真实管线永久用例 | 渲染服务新增 `follow-region.integration.test.ts`（表格真分页→引擎自己检出跟随区→vline 落纸带 `height:14mm`，对照 hline 仍不出 height）与 `text-fit.integration.test.ts` 两条两趟用例（实测高度折行≥单行 2 倍且单行≈一行行高、两档同页）。**变异自证已做**：分别临时撤掉两处修复——撤 C1 只让跟随区那条变红；撤 T-27 让 core 2 条 + render 2 条变红，而 C1 那条仍绿（两组判据互不牵连）。恢复后 render 10 文件/34 例、core 1137 例、`npm run build` 全 exit 0 | 撤回态与恢复态各实跑一轮 |
| （T-27 附注） | 该组合落纸是**单行溢出**而非「省略号」：`autoHeight` 保留 `overflow:visible`，省略号只在裁剪容器里才画得出——与画布同形，要省略号须显式设「截断」。已写进中英 CHANGELOG | 真实 Chromium `Range` 行盒实测 |
| T-15（仓库侧） | `latest` 占用预览版这条已按实测更正三处文档口径，并新增退出码分级自检 `scripts/check-common-dist-tag.mjs`，串进 `publish:common:beta`（`--fix`）与 `publish:common:dry-run`（`--dry-run`）；**registry 摘除与重发预览版仍需维护者本机 npm 登录态** | `node scripts/check-common-dist-tag.mjs` 实跑回红灯 exit 1 + `npm view` 实况 |
| 发布 | V1.3.9 / V1.3.10 已双推；GitHub Release + Gitee 发行版 + 七件安装包附件已传；npm 主线 `1.3.10` 已发 | registry 与台账实况（Linux 真机见 T-25） |

---

## 五、建议执行顺序

| 序 | 项 | 代价 | 备注 |
|---|---|---|---|
| 1 | ~~**T-11 C1**~~ **已修并验完（2026-10-26）** | 见 §四 | 改前 RED、改后 core 全量 1137 例绿 |
| 2 | **T-14 ② / §二补登记** | 纯手工 | 零代码；T-15 仓库侧已完成，只剩维护者本机 `--fix` 与重发预览版 |
| 3 | **T-16 + T-19b** | 四宿主各一份 `activeFonts` + `verify-demo` 补 2 项 | 合并做，实现与断言同批落地才防得住回归 |
| 4 | ~~**T-26 元素级换行**~~ **已按方案 B 实施并验完（2026-10-26）** | 见该条 | 27 份真实管线产物逐字比对、两端 UI 实测、门禁全绿；待发版折条目 |
| 5 | ~~**T-27**~~ **已修并出存量结论（2026-10-26）** | 见 §四 | 31 份逐字比对，示例库 13 份零变化；发版需按 minor 写明触发条件 |
| 6 | **T-24 #6 定性** | 实测命中率，暂不改码 | 定完才知要不要出补丁版 |
| 7b | **T-28 缺省行高分叉** | 需先出存量结论 | 与 T-27 同一取证通路撞出；三端只有出纸不是 1.5，改它会动存量长文本高度，**等裁决** |
| 7 | **T-11 C2** | 需你先定跟随区口径 | 与 C3 的 X 轴记账语义互相影响，且要保住「用户确实要跟随」这条需求（见 T-23），**不要直接动代码** |
| 8 | **T-22** | 按 spec 分文件推进 | 与功能对齐无关，建议独立轮；顺手把 `vue-tsc` 串进 CI |
| 9 | **T-07b** | 文档级定性 | 二选一，见该条 |
| 10 | **T-25** | 需目标机 | 本机不可验证 |

~~T-23 验证 #IKPXQL~~ —— 2026-10-26 已跑完真实管线复现，结论回写在该条；剩下的对外动作是补一句限定回帖。
