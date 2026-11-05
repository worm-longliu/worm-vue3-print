---
name: making-douyin-videos
description: Use when 要在 worm-vue3-print 创作、重跑或验收抖音讲解视频、口播剧本、字幕、封面与发布文案，或需要排查多音字误读、字幕遮挡、封面裁切和标签数量问题。普通代码改动及与视频交付无关的图片工作不适用。
---

# 抖音讲解视频与封面交付

## 目标

用本技能自带的同一套流水线、卡片、封面模板和真实默认剧本出片。横屏用于真实操作，竖屏用于机制讲解；不得另画一套封面或凭记忆重写样式。

- 技能源文件：`assets/pipeline/`。历史 `.video/` 只作参考，不是新片源文件。
- 产物只写运行目录；`.video/` 与 `.video-*/` 均已忽略，不进入包源码和文档。
- 取图判读前先说明来源、用途和问题并取得用户同意；未同意时只做 DOM、FFmpeg、FFprobe 等量测。
- TTS、录屏、整链重跑耗时或耗额度，执行前说明；不得自动上传抖音。

## 1. 准备独立运行目录

在仓库根目录执行：

```bash
node .agents/skills/making-douyin-videos/scripts/bootstrap.mjs --target .video-skill
npm install
npm run build -w @worm-vue3-print/core
python3 -m pip install pypinyin edge-tts
```

目标目录必须为空；不得覆盖已有 `.video/`。Playwright 使用仓库根依赖，FFmpeg 优先使用 demo 静态包、再回退系统命令。横屏实录另起 demo：

```bash
npm run dev -w demo -- --port 9303
```

## 2. 复制并改写真实剧本

默认示例不是免审查的事实来源，发布前必须重新核对版本、数字和源码行号。

| 链路 | 默认剧本与卡片 | 新片做法 |
| --- | --- | --- |
| 横屏 1920×1080 | `.video-skill/script.json` | 复制为 `script-<key>.json`，改 `scenes[].voiceover/steps` |
| 竖屏 1080×1920 | `.video-skill/portrait/script.json` + `cards-mcp-agent.html` | 复制为 `portrait/script-<key>.json` 与 `cards-<key>.html`，同步改 `cards` 字段 |

先读 [剧本写作与字段](references/script-authoring.md)。台词、录屏步骤、卡片、封面和 `douyin` 文案必须围绕同一主题；事实给源码或实测出处，未发布就写未发布。

## 3. 先过读音与排版，再合成

多音字和字幕规则见 [多音字与字幕](references/polyphone-and-subtitles.md)。核心闭环：

`pypinyin 上下文识别 → read/accept 人工语义确认 → 同音字只替换 TTS 文本 → display 原文进字幕 → 听审片段复核`。

无唯一同音替换字时改措辞或 `keep` 加听审，不得声称 ASR 已证明读音正确。

### 竖屏整链

```bash
cd .video-skill
VIDEO_SCRIPT=script-<key>.json npm run video:portrait
```

顺序：配音门禁 → 听审片段 → 卡片 → 几何检查 → 合成与烧录字幕 → 字幕墨量检查 → 四比例封面 → 五标签文案 → 总验收。

### 横屏整链

```bash
cd .video-skill
VIDEO_SCRIPT=script-<key>.json npm run video
```

顺序：配音门禁 → 听审片段 → 片头 → 实录 → 合成 → 音画同步 → 四比例封面 → 五标签文案 → 总验收。需要讲解卡片时先运行 `VIDEO_SCRIPT=script-<key>.json npm run video:panels`。

只改台词必须重跑配音及其后续步骤；只改卡片可跳过 TTS，但仍须重跑排版、合成和验收。不得静默重跑历史成片。

## 4. 抖音交付硬约束

- 字幕：短条、最多两行；竖屏默认每行 16 字、56px、`MarginV=340`，横屏默认每行 20 字。均为项目经验值，不称平台官方安全区。
- 封面：保持 `cover-douyin.html` 现有分割与三层标题，只改剧本 `cover*` 字段。
- 必交 `cover-douyin-4x3.png`（1440×1080）和 `cover-douyin-3x4.png`（1080×1440）；保留 16:9、9:16 母版。裁切规则不得改成拉伸或补边。
- 文案：自动生成 `douyin-copy.md`，含 5 条标题候选、简介、**恰好 5 个不重复标签**、置顶评论和勿上传的口径出处。
- 成片、SRT、时间轴、多音字台账与听审文件、四张封面、文案必须同目录。详见 [封面与验收](references/delivery.md)。

## 5. 验收与停手条件

整链末尾运行 `verify.mjs`，检查视频参数、四封面尺寸、字幕原文与两行约束、多音字文件和五标签文案。竖屏另保留反面对照：临时抬高 `coreTop` 或换左右等宽卡片，检查必须变红，再恢复并重跑全绿。

禁止：

- 用“看着没撞”替代量测，或用 `-ss` 抽单帧断言整段字幕存在。
- 把同音替换字写进画面或 SRT，跳过未认下的多音字继续出片。
- 自绘封面、改变现有裁切分割、交付少于或多于 5 个标签。
- 把经验安全区称为抖音官方规范，把 `private` / 待发布能力写成已发布。
- 用整链测试代替人工听审；最终读音与平台裁切仍需用户上传前预览确认。
