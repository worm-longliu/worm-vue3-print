# 封面与交付验收

## 同一封面模板与四种比例

只使用 `assets/pipeline/cover-douyin.html`，保留品牌行、三层叠印标题、副标题、三张数字卡、结论划除行和版本/时长角标的现有分割。内容来自剧本 `cover*`，不要为单片修改模板坐标。

| 文件 | 尺寸 | 生成方式 |
| --- | --- | --- |
| `cover-douyin-16x9.png` | 1920×1080 | 横屏母版 |
| `cover-douyin-9x16.png` | 1080×1920 | 竖屏母版，关键内容在中央 3:4 |
| `cover-douyin-3x4.png` | 1080×1440 | 从 9:16 中心裁 `crop=1080:1440:0:240` |
| `cover-douyin-4x3.png` | 1440×1080 | 从 16:9 中心裁 `crop=1440:1080:240:0` |

不放大、不拉伸、不补边。抖音交付至少取 4:3 与 3:4；平台具体落位以上传预览为准。生成器检查画布溢出、内容块重叠、占位符、三层标题一致和裁切安全区，并用 FFprobe 复核必需尺寸。

单独重跑：

```bash
VIDEO_SCRIPT=script-<key>.json npm run video:cover-douyin
VIDEO_SCRIPT=portrait/script-<key>.json npm run video:cover-douyin
```

## 单目录交付清单

横屏成品为 `video_final.mp4`，竖屏为 `portrait.mp4`，同目录还应有：

- `subtitles.srt`：与烧录字幕同源，保留原始汉字和最多两行短条。
- `timings.json`：真实配音时长、短条起止和原句编号。
- `polyphone.json` / `polyphone.md`：双轨文本和判定台账。
- `polyphone-audio.m4a` / `polyphone-audio.txt`：需人工确认的句子。
- 四张 `cover-douyin-*.png`。
- `douyin-copy.md`：发布简介、恰好五个标签、置顶评论及勿上传出处。
- 横屏 `video_raw.webm` / `recording_meta.json` 或竖屏 `cards/scene-*.png`，用于追查音画问题。

## 验证命令

```bash
# 当前剧本
VIDEO_SCRIPT=script-<key>.json npm run video:verify
VIDEO_SCRIPT=script-<key>.json npm run video:check

# 当前竖屏剧本；package 脚本会自动补 portrait/ 前缀
VIDEO_SCRIPT=script-<key>.json npm run video:portrait:check
VIDEO_SCRIPT=script-<key>.json npm run video:portrait:subs
VIDEO_SCRIPT=script-<key>.json npm run video:portrait:verify

# 技能自身，不调用 TTS
node --test .agents/skills/making-douyin-videos/scripts/tests.mjs
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" .agents/skills/making-douyin-videos
```

`verify.mjs` 复核 h264/yuv420p、画幅、四封面尺寸、SRT 与时间轴、多音字原文、文案是否由当前剧本重新生成。技能测试另覆盖标签数量、长句切分、时间连续、听审窗口和默认剧本门禁。

## 几何与字幕证据

- `check-layout`：所有场景必须绿；再做一次必然变红的反面对照，证明判据有效。
- `check-subs`：整片无 seek 扫描字幕带墨量，参照帧必须走同一 x264/yuv420p 链路。窗口首尾 ≤0.05s 或场景淡入可解释为采样量化，中部成簇无墨必须查 ASS 事件。
- 不用 `-ss` 抽单帧证明整段字幕存在；成品 GOP 会让单帧结论失真。
- “排版全绿”不证明非空屏，必要时用内容带 YAVG 等量测；未经用户同意不取图判读。
- 最终报告写实际命令和数字，不把历史片数字复制到本轮。
