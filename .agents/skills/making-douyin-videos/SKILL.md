---
name: making-douyin-videos
description: Use when 要为 worm-vue3-print 产出或重跑发抖音的讲解视频、封面图或上传文案——竖屏口播卡片片、横屏真实录屏片、四比例封面（9:16/3:4/16:9/4:3）、改台词后重新出片、字幕避让与「核心内容落在画面中央 3:4」的校验；也用于成片/封面/字幕是否合格、判据与证据怎么拿的问题。普通代码改动、与出片无关的图片工作不适用。
---

# making-douyin-videos（抖音讲解视频与封面交付）

## 目标与边界

- 工具链在 `.video/`，该目录被 gitignore，是**作者本机私有流水线**（依赖 demo 的 vite/ffmpeg 静态包与仓库根 playwright）。本技能规定「怎么跑 + 怎么举证」，不规定画面审美。
- 任何「能看 / 没撞 / 烧上了 / 尺寸对」的结论必须有**量测命令 + 数字**。取图判读需先征得用户同意（AGENTS.md）；没有同意就用几何与亮度判据替代看图。
- 中间产物只落 `.video/` 与 `.video/portrait/`，不得写进 `packages/`、`demo/`、`docs/`。

## 第一步：选链路

| 需求 | 链路 | 入口 |
| --- | --- | --- |
| 讲机制、讲取舍，卡片+架构图就够 | 竖屏 1080×1920（卡片 + 配音 + 烧录字幕） | `cd .video && VIDEO_SCRIPT=script-<key>.json npm run video:portrait` |
| 要看真界面、真命令、真出纸 | 横屏 1920×1080（demo 实录） | `VIDEO_SCRIPT=script-<key>.json npm run video`（需先起 demo dev server 9303） |

- 竖屏链 = `voice → cards → check-layout → compose → check-subs`（check-layout 在 compose 前，排版不过就不出片）。
- 横屏链 = `voice → cover → record → compose`，音画同步另跑 `npm run video:check`。
- 留白口径不同实现：横屏用剧本 `video.margin`（内容台宽 − 2×margin，compose 补黑边，画面不缩放）；竖屏用 `video.coreTop/coreBottom/rightFrom` + 卡片 padding。

**第 0 步 · 先查重**：动手前看 `.video/out-registry.json`、`.video/script-*.json`、`.video/portrait/script-*.json` 里有没有同主题旧片。有旧片就另起 key（同一主题跨两条链路各出一版是允许的，但要在文案里写明与旧片的关系），不并存两套同主题判据，也不悄悄重做覆盖旧产物。

## 新建一条竖屏片要动的四处

| 位置 | 内容 |
| --- | --- |
| `.video/portrait/script-<key>.json` | 剧本：`voice/rate/cards/video/subtitle/scenes[]` |
| `.video/portrait/cards-<key>.html` | 卡片版式，按 `?body=<键>&idx=<页码>` 切屏 |
| `.video/package.json` | 加 `"video:portrait:<key>"`（整链）与 `"…:<key>:cover"`（封面） |
| `.video/out-registry.json` | 加 `"<key>": "portrait/out/<key>"`——封面脚本走横屏 `paths.mjs`，不登记就出到 `.video/out/<key>` |

剧本字段（竖屏）：

```json
"video":    { "width": 1080, "height": 1920, "fps": 30,
              "coreTop": 240, "coreBottom": 1680, "rightFrom": 1100 },
"subtitle": { "fontsize": 56, "marginV": 340 },
"scenes":   [ { "name": "场景名", "body": "卡片 HTML 的键", "voiceover": "口播整段" } ]
```

## 中央 3:4 与抖音避让：数值来源必须分开说

| 数值 | 来源 | 对外能不能讲 |
| --- | --- | --- |
| 核心区 y 240–1680 | 1080 宽画布取 3:4 的算术结果（高 1440 居中） | 可，讲「核心内容区」 |
| 内容带 y 240–1400、右留 168、右列自 y≈1100 起压屏、底部留 520 | 作者自定经验值，**抖音没有公开安全区规范** | 不得称「官方标准」；上传前以平台预览为准 |
| 字幕墨迹 y≈1480–1580 | `check-subs` + 分段亮度实测（fontsize 56 / MarginV 340） | 可，注明「实测」 |

- 卡片 `body` 必须 `padding: 240px 168px 520px 72px`：上沿进核心区、右沿避开按钮列、下沿给字幕留位。
- 字号沿用作者可读性口径：等宽 ≥28px、正文 ≥29px（经验值，更小在手机上是糊的）。
- 口播句内用 `，、` 断句即可自动切成短字幕条（`voice.mjs` 按字数比例分配时间轴）。

## 出片判据（四条都要跑，数字要留档）

可复制的命令（在 `.video/` 下执行，`VIDEO_SCRIPT` 相对 `portrait/`）：

```bash
VIDEO_SCRIPT=script-<key>.json npm run video:portrait:check   # 1 排版与核心区
VIDEO_SCRIPT=script-<key>.json npm run video:portrait:subs    # 3 字幕烧录取证
```

1. `check-layout.mjs`：逐屏 `getBoundingClientRect`，出画布 / 高于 `coreTop` / 低于 `coreBottom` / 侵入底部遮挡区 / 侵入右侧按钮列 任一即 exit 1。要求**全场景绿**。
2. **反面对照（必做）**：临时抬高 `coreTop`、或换一份左右等宽的卡片再跑一次，必须变红并贴出报红原文——证明判据不是空转。判据全绿 ≠ 判据有效。
3. `check-subs.mjs`：整片 `fps=10` 扫字幕带 YAVG，参照帧是「同一张卡片走同一条 x264/yuv420p 链路」的重编码帧，色域与编码偏移相互抵消，差值即字幕墨量。要报窗口内帧数、平均墨量、无墨帧个数，并**逐个归因**：贴窗口首尾 ≤0.05s 或场景淡入 = 采样量化；成片中部成簇无墨 = 缺陷，去查对应 ASS 事件。
4. `ffprobe` 复核 `width×height / codec / pix_fmt / fps / duration / size`，封面四档尺寸逐一实测。

抽帧**不要**用 `-ss` 定位单帧来断言字幕在不在（成品 GOP ~8s，会落到关键帧，时刻与文本对不上）；整片无 seek 扫描才可信。

## 封面：四档共用同一模板，不要自绘

- 模板 `.video/cover-douyin.html` 不动，内容全部来自剧本 `cover*` 字段：

| 字段 | 写法 |
| --- | --- |
| `coverTitle` | 4–7 字（缺省取 `title` 去前缀） |
| `coverSub` | `A · B · C` 点列 |
| `coverVerdict` | 一句结论，可用 `<s>被划掉的说法</s>` |
| `coverCards` | 三张数字卡 `{num,unit,label,pct,iso}`，取值必须是源码真值或实测值 |
| `coverVersion` | 缺省读根 `package.json`；能力未进正式版写「待发布」 |

- 出图命令：`VIDEO_SCRIPT=portrait/script-<key>.json npm run video:cover-douyin`（横屏 paths，路径相对 `.video`，竖屏剧本要带 `portrait/` 前缀）。
- 自带判据：16:9 要求主标题落在中央 3:4 横带、9:16 要求关键内容在 y 240–1680；另查溢出画布、内容块两两重叠、`__占位符__` 残留、三层叠印主标题文本一致；越界 exit 1，按报文坐标调模板。
- `cover-douyin-3x4.png` 由 9x16 中心裁 `crop=1080:1440:0:240`、`-4x3` 由 16:9 中心裁，不放大不补边。抖音主页网格用 **3:4**，竖版封面用 **9:16**。

## 交付物与发布文案

一条片目录应有：成片（竖屏 `portrait.mp4` / 横屏 `video_final.mp4`）、`subtitles.srt`（与烧录同源）、`timings.json`、`cards/scene-*.png`、`cover-douyin-{9x16,3x4,16x9,4x3}.png`、`douyin-copy.md`。

`douyin-copy.md` 六段固定结构：

1. 版式口径 + 本轮实测数字（含反面对照报文、无墨帧归因）
2. 标题候选 5 条（≤30 字，标推荐及理由）
3. 简介正文（分块小标题，每块讲清一件事实）
4. 话题标签（主标签 3–5 个，长尾留给评论区）
5. 置顶评论（预答 4–6 条必然被问的问题）
6. 口径备注（每条结论配 `file:line` 出处，标明「勿上传」）

## 口径红线

- **未发布就说未发布**：包是 `private` 就写「没发到 npm」；能力没进正式版就 `coverVersion: 待发布`。不得暗示生产可用，不得给排期。
- 一条片的能力**横跨两个版本**（一部分已发布、一部分没发）时：`coverVersion` 取最保守那一档（缺省「待发布」），正文拆成两句分别标版本，不得用已发布那部分的版本号给整片背书。判定要现取：`npm view @worm-vue3-print/core version` 对照根 `package.json` 与 `git tag`，别凭印象。
- 竖屏链路**没有** `verify-douyin` / `check-sync` / `deliverables` / `polyphone-audio`——它们都读横屏 `paths.mjs` 且只认 `video_final.mp4`。所以配音的多音字与数字读法只能人耳听审，交付时要写明「未做 ASR 自动核验」。
- `index.mjs` 生成的 `out/INDEX.md` 只统计 `video_final.mp4`，竖片在里面时长/体积为空是**预期行为**，不是丢文件。
- 上传抖音需要用户凭据，代理不代为上传；TTS、渲染、打包这类耗时/耗额度的命令，跑之前先说明代价。

## 常见错

| 现象 | 真因与处置 |
| --- | --- |
| 改了台词，画面与字幕对不上 | 必须整链重跑 `voice → cards → compose`；只改版式可只跑 `cards + compose` |
| 某句字幕整段提前消失 | ASS 的秒字段（`pad()` 取 floor）与百分秒字段（旧 `tenths()` 取 round）不同源，x.995–x.999 会把结束时刻写成早 1 秒；已修，**别改回** |
| 封面出到了 `.video/out/<key>` | 忘在 `out-registry.json` 登记竖片目录 |
| 排版全绿但画面是空屏 | `check-layout` 跳过 0 尺寸元素；再逐屏量内容带亮度（YAVG/峰值）确认每屏真有排布 |
| 卡片被拒「侵入右侧按钮区」 | 右 padding 必须 ≥168；左右等宽的老卡片必红 |
| 判据全绿就宣布合格 | 缺反面对照；先证明它会红，再证明它绿 |

## 红旗（出现即停手）

- 用「看着没撞」当证据
- 给竖屏另写一套校验并与现有判据并存
- 用 `-ss` 抽一帧断言字幕存在与否
- 封面自绘，不复用 `cover-douyin.html`
- 文案把「private / 待发布」写成「已发布」
- 静默重跑整链而不说明耗时与额度
