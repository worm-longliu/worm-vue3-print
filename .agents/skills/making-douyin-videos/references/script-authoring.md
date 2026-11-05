# 剧本写作与字段

## 内容结构

沿用项目现有技术讲解风格：结论先行、短句口播、真实操作或真实数据佐证，不念宣传稿。

1. **钩子**：第一场直接说问题、结果或反差，不做长自我介绍。
2. **为什么**：解释问题出现的层级和边界，避免堆概念。
3. **怎么做**：横屏让 `steps` 真点真量；竖屏每屏只讲一个机制。
4. **证据**：数字来自源码、命令或 FFprobe，卡片不编造百分比和版本。
5. **边界**：明确不能做什么、兼容路径、未发布状态。
6. **收尾**：给文档或下一步，不给未确定的排期。

口播使用简体中文，英文只保留包名、协议、工具名等必要术语。一个句号对应一个完整意思；逗号用于短字幕断点。画面和发布文案不得出现 TTS 的同音替换字。

## 横屏剧本

```json
{
  "title": "worm-vue3-print 整页旋转效果",
  "voice": "zh-CN-YunxiNeural",
  "rate": "+12%",
  "video": { "width": 1920, "height": 1080, "fps": 30, "margin": 32 },
  "subtitle": { "lineWidth": 20, "maxLines": 2 },
  "baseUrl": "http://localhost:9303",
  "scenes": [{ "name": "90 度", "voiceover": "口播。", "steps": [] }]
}
```

直接参考默认 `script.json` 的真实步骤。常用动作包括 `assert/click/highlight/key/waitForPreview/measureCss/measureBox/measureCount/showImage/back`；选择器、等待和测量必须与当前 demo 一致，不能沿用已经失效的旧选择器。`VIDEO_FAST=1 node record.mjs` 只用于修步骤，最终交付仍跑完整录制。

## 竖屏剧本

```json
{
  "title": "浏览器、客户端与 AI 的 MCP 链路",
  "voice": "zh-CN-YunxiNeural",
  "rate": "+12%",
  "cards": "cards-mcp-agent.html",
  "video": {
    "width": 1080, "height": 1920, "fps": 30,
    "coreTop": 240, "coreBottom": 1680, "rightFrom": 1100
  },
  "subtitle": { "fontsize": 56, "marginV": 340, "lineWidth": 16, "maxLines": 2 },
  "scenes": [{ "name": "hook", "body": "hook", "voiceover": "口播。" }]
}
```

`body` 对应卡片 HTML 中按 `?body=<键>&idx=<页码>` 切换的内容。沿用深色背景、青色/绿色强调、顶部品牌行、底部留白和三张以内信息块；正文不小于 29px、等宽字不小于 28px。卡片 body 使用 `padding: 240px 168px 520px 72px`，右侧和底部经验避让不可删。

## 封面字段

| 字段 | 约束 |
| --- | --- |
| `coverTitle` | 4–7 字，和片内主结论一致 |
| `coverSub` | `A · B · C` 点列 |
| `coverVerdict` | 一句结论，可用 `<s>错误说法</s>` 保留现有划除分割 |
| `coverCards` | 三张 `{num,unit,label,pct,iso}` 卡，数字必须可举证 |
| `coverVersion` | 缺省读根版本；未发布写「待发布」 |

## 发布文案字段

每条新剧本必须完整填写：

```json
"douyin": {
  "titles": ["推荐", "备选二", "备选三", "备选四", "备选五"],
  "description": "可直接上传的简介，可分多段。",
  "tags": ["打印模板", "Vue3", "前端开发", "开源项目", "效率工具"],
  "pinnedComment": "置顶评论，预答最可能被问的问题。",
  "sources": [
    { "claim": "片中说法", "evidence": "packages/.../file.ts:行号或实测命令" }
  ]
}
```

`titles` 恰好 5 条且每条不超过项目约定的 30 字；`tags` 恰好 5 个、不重复、不带空格。长尾词放进置顶评论，不增加第六个标签。`sources` 只供自检，生成器会标为勿上传。
