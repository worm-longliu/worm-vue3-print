#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
多音字（中文一字多音）语义判定与配音文本改写。

为什么不用 SSML：Edge TTS 免费端点会把 <phoneme> 当字面文本朗读（本机实测单字
「行」1.49s → 带标签 5.54s），拿不到音素控制权。所以读音靠**同音字替换**锁定：
把需要特定读音的字换成一个「只有这一个读音」的汉字喂给引擎，字幕与 SRT 仍用原文。

两条判据（都取自 pypinyin，避免穷举候选带来的噪声）：
- 判据1 语义改判：句子上下文读音与该字词典默认读音**底音不同**（如 银行 háng vs 默认 xíng、
  长短 cháng vs 默认 zhǎng）。这类位置必须由剧本 read 给出「词 + 目标读音 + 语义理由」，
  缺失即 exit 1 —— 这就是要求的「前后语义识别判断读音」。
- 判据2 风险表多读：字在 RISK 表里且有 >1 个合法读音（大好 hǎo、更新 gēng 这类）。
  允许剧本 accept 做字级认下（写清理由），也可用 read 精确到词。

剧本注解格式：
  scene.read    = [["银行","hang2","指收款开户行"],["模板","keep","mú 与 mó 两读，认引擎上下文"]]
  script.accept = [["好","hao3","形容词「大好」，非「好奇」的 hào"]]
  第二项 "keep" = 认下上下文读音；以 "=" 开头 = 字面替换（给 npm/JSON/vue3 等术语用）。
注解词在剧本里一次没出现 → 报错，防过期注解。

产物：polyphone.json（逐句 display/say，display 进字幕与 SRT、say 进 TTS）、
polyphone.md（判定台账）、swap-map.json（音节 → 唯一读音替换字，由 pypinyin 词库自动筛）。
"""
import json
import re
import sys
from pathlib import Path

from pypinyin import pinyin, Style

SENT_RE = re.compile(r"[^。！？；]+[。！？；]?")
CJK_RE = re.compile(r"[一-鿿]")
# 打印/技术口播里真会读错的多读字（判据2 用），刻意不含「的一是了」这类高频虚字
RISK = set("行长重差率传卷系得地为还调卡模缝载种相折屏参少好空落量给处铺曲背朝转都没着数中分会号大更教干尽担蒙涨冠帖便恶曾藏宿颤禅号")
HERE = Path(__file__)


def tone3(text):
    """句子模式逐字读音（上下文单值），非汉字位返回空串，保证与字符下标对齐。"""
    return [x[0] for x in pinyin(text, style=Style.TONE3, errors=lambda ch: [""] * len(ch))]


def char_readings(ch):
    return pinyin(ch, heteronym=True, style=Style.TONE3)[0]


def default_reading(ch):
    return char_readings(ch)[0]


def base(syl):
    return re.sub(r"\d$", "", syl or "")


def split_sentences(text):
    return [s.strip() for s in SENT_RE.findall(text) if s.strip()]


def build_swap_map():
    """从 pypinyin 词库取常用汉字，只保留「唯一读音」的字当替换字，按词库出现频次优先。"""
    from pypinyin.phrases_dict import phrases_dict
    from pypinyin.pinyin_dict import pinyin_dict as char_dict

    freq = {}
    for phrase in phrases_dict:
        for ch in phrase:
            if CJK_RE.match(ch):
                freq[ch] = freq.get(ch, 0) + 1
    m = {}
    chars = [ch for ch in freq if CJK_RE.match(ch)]
    # 逐字（不做词组上下文）批量取候选读音，一次调用搞定上万个字
    for ch, v in zip(chars, pinyin(chars, heteronym=True, style=Style.TONE3)):
        if len(v) == 1 and v[0] not in m:
            m[v[0]] = ch
    return m


def main(argv):
    if argv and argv[0] == "swapmap":
        m = build_swap_map()
        Path(argv[1]).write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"替换字表 {len(m)} 个音节 → {argv[1]}")
        return 0

    script_path, json_out, md_out = Path(argv[0]), Path(argv[1]), Path(argv[2])
    if not HERE.with_name("swap-map.json").exists():
        print("缺少 swap-map.json，请先跑：python3 polyphone.py swapmap swap-map.json")
        return 1
    script = json.loads(script_path.read_text(encoding="utf-8"))
    swap = json.loads(HERE.with_name("swap-map.json").read_text(encoding="utf-8"))
    accept = {(a[0], a[1]): (a[2] if len(a) > 2 else "") for a in script.get("accept") or []}
    errors, rows, scenes = [], [], []

    def mk(items):
        out = []
        for it in items or []:
            w, target = it[0], it[1]
            # 替换类判定必须靠两字以上的词锚定语义：单字会全片覆盖（「运行」会被换成「运航」）
            if target != "keep" and not target.startswith("=") and len(w) < 2:
                errors.append(f"注解词「{w}」只有 1 个字：锁定读音必须写成两字以上的词（如「命令行」），否则同音替换会全片覆盖")
                continue
            out.append({"w": w, "target": target, "why": it[2] if len(it) > 2 else "", "hits": 0})
        return out

    # 词级判定可以写在剧本顶层（全片生效一次即可），scene.read 只在本场生效、优先级更高
    gann = mk(script.get("read"))
    leftover = []
    for si, scene in enumerate(script["scenes"]):
        sann = mk(scene.get("read"))
        ann = gann + sann
        out_sents = []
        for ti, raw in enumerate(split_sentences(scene["voiceover"])):
            ctx = tone3(raw)
            marks = [None] * len(raw)
            needs_review = False
            for a in ann:
                for pos in range(len(raw)):
                    if not raw.startswith(a["w"], pos):
                        continue
                    a["hits"] += 1
                    if a["target"].startswith("="):
                        # 字面替换整段（英文术语用），只留首位标记，其余位丢弃
                        marks[pos] = a
                        for k in range(1, len(a["w"])):
                            marks[pos + k] = {"skip": True}
                    else:
                        # 词内只标注真正是这读音的那些字，其余字不动
                        for k, wch in enumerate(a["w"]):
                            if a["target"] == "keep" or a["target"] in char_readings(wch):
                                marks[pos + k] = a
            say = []
            for idx, ch in enumerate(raw):
                a = marks[idx]
                if a and a.get("skip"):
                    continue
                if a and a["target"].startswith("="):
                    say.append(a["target"][1:])
                    rows.append([si + 1, ti + 1, ch, raw[max(0, idx - 4):idx + 5], "-", "术语字面替换", a["target"][1:], a["why"] or "英文术语"])
                    continue
                if not CJK_RE.match(ch):
                    say.append(ch)
                    continue
                dflt, cand = default_reading(ch), char_readings(ch)
                cur = ctx[idx] or dflt
                a = marks[idx]
                rule1 = base(cur) != base(dflt)
                rule2 = ch in RISK and len(set(cand)) > 1
                snippet = raw[max(0, idx - 4):idx + 5]
                if a and a["target"].startswith("="):
                    say.append(a["target"][1:])
                    rows.append([si + 1, ti + 1, ch, snippet, "-", "术语字面替换", a["target"][1:], a["why"] or "英文术语"])
                    continue
                if a:
                    if a["target"] == "keep":
                        needs_review = True
                        say.append(ch)
                        rows.append([si + 1, ti + 1, ch, snippet, "/".join(cand), f"认下 {cur}", ch, a["why"] or "语义上取上下文读音"])
                    else:
                        if a["target"] not in cand:
                            errors.append(f"场景{si+1}句{ti+1}「{ch}」声明的 {a['target']} 不是它的合法读音（候选 {cand}）")
                            say.append(ch)
                            continue
                        needs_review = True
                        sub = swap.get(a["target"])
                        if not sub:
                            errors.append(f"场景{si+1}句{ti+1}「{ch}」目标 {a['target']} 没有唯一读音替换字，请改措辞")
                            say.append(ch)
                            continue
                        say.append(sub)
                        rows.append([si + 1, ti + 1, ch, snippet, "/".join(cand), f"锁定 {a['target']}", sub, a["why"] or "词语义判定"])
                    continue
                if rule1:
                    errors.append(f"场景{si+1}句{ti+1} 需语义判定：「{ch}」上下文读 {cur}、词典默认读 {dflt}，语境 …{snippet}… → 请在该 scene.read 里加 [\"词\",\"{cur}\",\"理由\"]")
                    say.append(ch)
                elif rule2:
                    key = (ch, cur)
                    if key not in accept:
                        errors.append(f"场景{si+1}句{ti+1} 风险表多读未认：「{ch}」取 {cur}（候选 {cand}），语境 …{snippet}… → 加 accept [\"{ch}\",\"{cur}\",\"理由\"]")
                    else:
                        needs_review = True
                        say.append(ch)
                        rows.append([si + 1, ti + 1, ch, snippet, "/".join(cand), f"认下 {cur}", ch, accept[key] or "字级认下"])
                else:
                    say.append(ch)
            out_sents.append({"display": raw, "say": "".join(say), "needsReview": needs_review})
        for a in sann:
            if a["hits"] == 0:
                errors.append(f"场景{si+1} 注解词「{a['w']}」台词里没出现（过期注解，删掉或改词）")
        scenes.append({"name": scene["name"], "sentences": out_sents})
    for a in gann:
        if a["hits"] == 0:
            leftover.append(a["w"])
    if leftover:
        errors.append("全片注解词没被任何台词用到（过期注解，删掉）：" + "、".join(leftover))

    json_out.write_text(json.dumps({"scenes": scenes}, ensure_ascii=False, indent=1), encoding="utf-8")
    hard = sum(1 for r in rows if str(r[5]).startswith("锁定"))
    keep = sum(1 for r in rows if str(r[5]).startswith("认下"))
    lines = [
        f"# 多音字读音判定台账 · {script.get('title', '')}",
        "",
        f"- 判定 {len(rows)} 条：同音替换锁定 {hard} 条，认下上下文/字级认下 {keep} 条，术语字面替换 {sum(1 for r in rows if r[5] == '术语字面替换')} 条。",
        "- 门禁：上下文改判且底音不同的位置必须由 `scene.read` 给语义判定；风险表多读字可由 `script.accept` 字级认下。二者缺一本脚本 exit 1。",
        "- 「字幕」列取原文（画面与 SRT 用它），「喂引擎」列是合成 TTS 的实际文本；替换字经 pypinyin 校验为唯一读音，引擎不存在第二条读法。",
        "",
        "| 场景 | 句 | 字 | 语境 | 合法读音 | 判定 | 字幕 | 喂引擎 | 依据 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        sub = r[6]
        disp = r[2]
        lines.append(f"| {r[0]} | {r[1]} | {disp} | {r[3]} | {r[4]} | {r[5]} | {disp} | {sub} | {r[7]} |")
    md_out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    if errors:
        print("多音字判定未通过：")
        for e in errors[:60]:
            print("  ✗", e)
        if len(errors) > 60:
            print(f"  … 另有 {len(errors) - 60} 条")
        return 1
    print(f"多音字判定通过：{len(rows)} 条 → {md_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
