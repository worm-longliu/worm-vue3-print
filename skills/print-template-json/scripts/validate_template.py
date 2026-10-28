#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校验 worm-vue3-print 模板 JSON 能否安全出纸（不依赖任何第三方库）。

用法：
    python3 validate_template.py output.template.json
    python3 validate_template.py output.template.json --json   # 机器可读输出

校验项（对应渲染管线的硬规则，踩过的坑都在这）：
  1. 结构：paperSize / orientation / margins / elements 三要素，或多页 {pages:[...]}
  2. 内容区：纸宽高 − 四边边距 − 页眉页脚高度
  3. 元素越界：left+width / top+height 超出内容区
  4. 分页安全余量：固定纸纵向留 2mm（引擎内建 SAFETY_MARGIN），贴边会被判到第二页；
     拼版模板更会直接报「拼版要求每份标签恰好 1 页」
  5. 分页预算预测：按引擎「横向相交分列累计」口径复算单份页数；左右并排块未组合时
     整宽尾行会重复扣两列高度而超页（拼版模板报 ERROR，其余报 WARN；含表格/流式列表的模板跳过）
  6. 表格：列宽和 == 元素宽、行高和 == 元素高、每行单元格数 == 列数
  7. 拼版：连续纸不支持、列数是否超出目标纸可用宽、标签是否超出可用高
  8. 表达式：{} 是否配对、函数名是否在已知清单内

退出码：0 = 无 ERROR；1 = 存在 ERROR。
"""

import json
import math
import sys
from typing import Any, Dict, List, Optional, Tuple

# 纸张预设（mm）；连续纸/小票纸的高度只是设计画布高度，出纸按内容推导
PAPER_DIMENSIONS = {
    'A4': (210, 297),
    'A3': (297, 420),
    'A5': (148, 210),
    'Letter': (216, 279),
    'Legal': (216, 356),
    'DOT_FULL': (241, 279.4),
    'DOT_HALF': (241, 139.7),
    'DOT_THIRD': (241, 93.1),
    'LABEL_80X60': (80, 60),
    'LABEL_60X40': (60, 40),
    'LABEL_40X30': (40, 30),
    'THERMAL_57': (57, 297),
    'THERMAL_80': (80, 297),
    'THERMAL_110': (110, 297),
    'CUSTOM': (210, 297),
    'CONTINUOUS': (80, 297),
}
CONTINUOUS_PAPERS = {'CONTINUOUS', 'THERMAL_57', 'THERMAL_80', 'THERMAL_110'}

# 分页引擎的安全余量（mm）：内容底边必须离版心底边至少这么远
SAFETY_MARGIN = 2.0
# 浮点容差
EPS = 0.01

KNOWN_FUNCTIONS = {
    'MONEY', 'CONCAT', 'IF', 'FORMAT', 'SUBSTR', 'LEN', 'ROUND', 'NOW',
    'IFEMPTY', 'PAD', 'REPLACE', 'JSON', 'DATE', 'UPPER',
    'ADD', 'SUB', 'MUL', 'DIV',
    'ROUNDUP', 'CEIL', 'ROUNDDOWN', 'FLOOR', 'ROUNDBANK',
    'SUM', 'AVG', 'COUNT', 'MIN', 'MAX',
}
KNOWN_SYSTEM_VARS = {'pageIndex', 'totalPages', 'printDate', 'printTime'}


class Report:
    def __init__(self) -> None:
        self.items: List[Dict[str, str]] = []

    def add(self, level: str, scope: str, message: str) -> None:
        self.items.append({'level': level, 'scope': scope, 'message': message})

    def error(self, scope: str, message: str) -> None:
        self.add('ERROR', scope, message)

    def warn(self, scope: str, message: str) -> None:
        self.add('WARN', scope, message)

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.items if i['level'] == 'ERROR')


def paper_mm(t: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """取纸张实际宽高（mm），横向互换；CUSTOM 用 customWidth/customHeight"""
    size = t.get('paperSize')
    if size == 'CUSTOM':
        w = t.get('customWidth')
        h = t.get('customHeight')
        if not (isinstance(w, (int, float)) and isinstance(h, (int, float)) and w > 0 and h > 0):
            return None
        width, height = float(w), float(h)
    else:
        dim = PAPER_DIMENSIONS.get(size)
        if not dim:
            return None
        width, height = dim
    if t.get('orientation') == 'landscape' and size not in CONTINUOUS_PAPERS:
        width, height = height, width
    return width, height


def check_expressions(report: Report, scope: str, text: Optional[str]) -> None:
    """{} 配对 + 已知函数/变量名"""
    if not isinstance(text, str) or '{' not in text:
        return
    depth = 0
    for ch in text:
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth < 0:
                report.error(scope, '表达式 {} 不配对（多余的 }}）：{}'.format('{}', text[:60]))
                return
    if depth != 0:
        report.error(scope, '表达式大括号未闭合：{}'.format(text[:60]))
        return
    # 提取 { ... } 内的函数调用名与首层变量
    buf = ''
    depth = 0
    for ch in text:
        if ch == '{':
            depth += 1
            buf = ''
            continue
        if ch == '}':
            depth -= 1
            inner = buf.strip()
            head = inner.split('(')[0].strip().lstrip('!')
            if '(' in inner and head and head.isupper() and head not in KNOWN_FUNCTIONS:
                report.warn(scope, '未知表达式函数 {}（已知：{}）：{}'.format(
                    head, '/'.join(sorted(KNOWN_FUNCTIONS)), inner[:60]))
            elif '(' not in inner:
                root = inner.split('.')[0].strip()
                if root and root not in KNOWN_SYSTEM_VARS and not root.replace('_', '').isalnum():
                    report.warn(scope, '可疑表达式：{}'.format(inner[:60]))
            buf = ''
            continue
        if depth > 0:
            buf += ch


def check_table(report: Report, scope: str, options: Dict[str, Any]) -> None:
    cols = options.get('tableColWidths') or []
    rows = options.get('tableRows') or []
    width = options.get('width', 0)
    height = options.get('height', 0)
    if not cols:
        report.error(scope, '表格缺少 tableColWidths')
        return
    # 列宽/行高与元素框不一致时，设计器加载会按「实际渲染出的列宽/行高」回写元素尺寸
    # （TableElement 实测如此），因此这里只提示、不判死：
    # 但拼版标签的高度变化会改变拼版几何，需自行确认仍放得下。
    col_sum = sum(float(c) for c in cols)
    if abs(col_sum - float(width)) > EPS:
        report.warn(scope, '表格列宽和 {:.2f}mm ≠ 元素宽度 {:.2f}mm；设计器加载时会按列宽回写宽度'.format(
            col_sum, float(width)))
    row_sum = sum(float(r.get('height', 0)) for r in rows)
    if rows and abs(row_sum - float(height)) > EPS:
        report.warn(scope, '表格行高和 {:.2f}mm ≠ 元素高度 {:.2f}mm；设计器加载时会按实际行高回写高度'.format(
            row_sum, float(height)))
    for i, r in enumerate(rows):
        n = len(r.get('cells', []))
        if n != len(cols):
            report.error(scope, '表格第 {} 行单元格数 {} ≠ 列数 {}（含合并占位格）'.format(i + 1, n, len(cols)))
        if r.get('type') not in ('header', 'data', 'subtotal', 'summary'):
            report.error(scope, '表格第 {} 行类型 {} 非法'.format(i + 1, r.get('type')))
        for c in r.get('cells', []):
            check_expressions(report, '{} 行{}'.format(scope, i + 1), c.get('formatter'))
    # 只有声明了 dataSource 才要求 data 行；纯 header 行的表格是常见的「栅格排版」用法（单据抬头），不算问题
    if options.get('dataSource') and not any(r.get('type') == 'data' for r in rows):
        report.warn(scope, '已声明 dataSource 但没有 data 行（明细不会迭代）')


def check_tiling(report: Report, t: Dict[str, Any]) -> None:
    cfg = t.get('tiling') or {}
    if not cfg.get('enabled'):
        return
    scope = '拼版'
    if t.get('paperSize') in CONTINUOUS_PAPERS:
        report.error(scope, '连续纸/小票纸不支持拼版打印')
    sheet_key = cfg.get('sheetPaperSize', 'A4')
    if sheet_key == 'CUSTOM':
        sw, sh = cfg.get('sheetCustomWidth'), cfg.get('sheetCustomHeight')
        if not (isinstance(sw, (int, float)) and isinstance(sh, (int, float)) and sw > 0 and sh > 0):
            report.error(scope, '拼版自定义目标纸宽高必须是大于 0 的数值（mm）')
            return
        sheet_w, sheet_h = float(sw), float(sh)
    else:
        dim = PAPER_DIMENSIONS.get(sheet_key)
        if not dim:
            report.error(scope, '未知拼版目标纸张：{}'.format(sheet_key))
            return
        sheet_w, sheet_h = dim
    if cfg.get('sheetOrientation') == 'landscape':
        sheet_w, sheet_h = sheet_h, sheet_w

    m = cfg.get('sheetMargin', {})
    margin = {k: float(m.get(k, 10)) for k in ('top', 'right', 'bottom', 'left')}
    avail_w = sheet_w - margin['left'] - margin['right']
    avail_h = sheet_h - margin['top'] - margin['bottom']
    label = paper_mm(t)
    if not label:
        report.error(scope, '无法解析标签纸张尺寸：{}'.format(t.get('paperSize')))
        return
    label_w, label_h = label
    gap_x = float(cfg.get('gapX', 2))
    gap_y = float(cfg.get('gapY', 2))
    columns = cfg.get('columns', 2)
    if not isinstance(columns, int) or columns < 1:
        report.error(scope, '拼版列数必须是大于 0 的整数')
        return
    max_columns = math.floor((avail_w + gap_x) / (label_w + gap_x)) if label_w + gap_x > 0 else 0
    if columns > max_columns:
        need = columns * label_w + (columns - 1) * gap_x
        report.error(scope, '列数 {} 超出纸面可用宽度 {:.1f}mm：最多 {} 列；当前需 {:.1f}mm'.format(
            columns, avail_w, max_columns, need))
    rows_fit = math.floor((avail_h + gap_y) / (label_h + gap_y)) if label_h + gap_y > 0 else 0
    if rows_fit < 1:
        report.error(scope, '标签高度 {:.1f}mm 超出纸面可用高度 {:.1f}mm，每张 0 行'.format(label_h, avail_h))


def _rect(el: Dict[str, Any]) -> Dict[str, Any]:
    o = el.get('options') or {}
    left = float(o.get('left', 0))
    width = float(o.get('width') if o.get('width') is not None else 100)
    return {
        'id': el.get('id') or '?',
        'group': o.get('groupId'),
        'x0': left,
        'x1': left + width,
        'top': float(o.get('top', 0)),
        'height': float(o.get('height', 0)),
    }


def _intersect(a: Tuple[float, float], b: Tuple[float, float]) -> bool:
    """区间严格相交（边相切不算），与分页引擎 xIntersects 同口径。"""
    return a[0] < b[1] and b[0] < a[1]


def predict_pages(items: List[Dict[str, Any]], budget: float) -> Tuple[int, Optional[str]]:
    """
    复刻分页引擎的二维占用预算：
    - 同列（横向相交）按内容高度合计扣减，设计坐标间隙不计入；
    - 显式编组与「横竖都相交」的隐式堆叠簇合成一个单元，纵向只扣一次并集高度；
    - 单元放不进本列剩余即整组换页。
    返回（预测页数, 首次换页的触发说明）。高度取模板声明值，实测更高的元素会更早换页。
    """
    parent = {it['id']: it['id'] for it in items}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i, a in enumerate(items):
        for b in items[i + 1:]:
            if a['group'] or b['group']:
                # 显式编组只并按 groupId 合簇；未编组元素不会被隐式聚类拉进组（与引擎同口径）
                if a['group'] and a['group'] == b['group']:
                    union(a['id'], b['id'])
                continue
            v_overlap = a['top'] < b['top'] + b['height'] and b['top'] < a['top'] + a['height']
            if v_overlap and _intersect((a['x0'], a['x1']), (b['x0'], b['x1'])):
                union(a['id'], b['id'])

    clusters: Dict[str, List[Dict[str, Any]]] = {}
    for it in items:
        clusters.setdefault(find(it['id']), []).append(it)

    units = []
    for members in clusters.values():
        units.append({
            'ids': [m['id'] for m in members],
            'x0': min(m['x0'] for m in members),
            'x1': max(m['x1'] for m in members),
            'top': min(m['top'] for m in members),
            'height': max(m['top'] + m['height'] for m in members) - min(m['top'] for m in members),
        })
    units.sort(key=lambda u: u['top'])

    pages, occupied, trigger = 1, [], None
    for u in units:
        depth = sum(o['height'] for o in occupied if _intersect((u['x0'], u['x1']), (o['x0'], o['x1'])))
        if depth + u['height'] > budget + EPS:
            pages += 1
            if trigger is None:
                trigger = ('元素 {} 本列已占 {:.2f}mm + 自身 {:.2f}mm > 预算 {:.2f}mm'.format(
                    '+'.join(u['ids']), depth, u['height'], budget))
            occupied = []
        occupied.append(u)
    return pages, trigger


def check_pagination(report: Report, t: Dict[str, Any], label: str, avail_h: float, continuous: bool) -> None:
    """
    分页预算预测（引擎口径）：只适用于「元素级版式」（无表格/流式列表）的固定纸模板。
    拼版与标签类超页会被管线直接拒纸，按 ERROR 报；其余按 WARN 提示。
    """
    types = {el.get('type') for el in t['elements']}
    if continuous or types & {'table', 'flowList'}:
        return
    budget = avail_h - SAFETY_MARGIN
    items = [_rect(el) for el in t['elements']]
    pages, trigger = predict_pages(items, budget)
    if pages <= 1:
        return
    tiling = (t.get('tiling') or {}).get('enabled') is True
    scope = '{} 分页预算'.format(label)
    detail = '{}；把并排块组合（options.groupId）或压缩纵向高度即可收回一页'.format(trigger)
    if tiling:
        report.error(scope, '拼版要求每份标签恰好 1 页，预测出 {} 页（{}'.format(pages, detail))
    else:
        report.warn(scope, '按引擎预算预测单份会出 {} 页（{}'.format(pages, detail))


def check_page(report: Report, t: Dict[str, Any], label: str) -> None:
    if not isinstance(t, dict):
        report.error(label, '页面不是对象')
        return
    for key in ('paperSize', 'orientation', 'margins', 'elements'):
        if key not in t:
            report.error(label, '缺少关键字段 {}'.format(key))
    if not isinstance(t.get('elements'), list):
        report.error(label, 'elements 必须是数组')
        return

    dim = paper_mm(t)
    if not dim:
        report.error(label, '无法解析纸张尺寸：{}（CUSTOM 需 customWidth/customHeight）'.format(t.get('paperSize')))
        return
    paper_w, paper_h = dim
    m = t.get('margins', {})
    margin = {k: float(m.get(k, 0)) for k in ('top', 'right', 'bottom', 'left')}
    header_h = float((t.get('header') or {}).get('height', 0))
    footer_h = float((t.get('footer') or {}).get('height', 0))
    avail_w = paper_w - margin['left'] - margin['right']
    avail_h = paper_h - margin['top'] - margin['bottom'] - header_h - footer_h
    if avail_w <= 0 or avail_h <= 0:
        report.error(label, '版心被边距/页眉页脚吃光：可用 {:.1f}×{:.1f}mm'.format(avail_w, avail_h))
        return

    continuous = t.get('paperSize') in CONTINUOUS_PAPERS
    bottom_limit = avail_h if continuous else avail_h - SAFETY_MARGIN

    for i, el in enumerate(t['elements']):
        o = el.get('options', {})
        scope = '{} 元素#{} {}'.format(label, i + 1, el.get('type', '?'))
        left, top = float(o.get('left', 0)), float(o.get('top', 0))
        width, height = float(o.get('width', 0)), float(o.get('height', 0))
        if left < -EPS or top < -EPS:
            report.warn(scope, '坐标为负：left={} top={}'.format(left, top))
        if left + width > avail_w + EPS:
            report.error(scope, '横向越界：{:.2f}+{:.2f} > 可用宽 {:.2f}mm'.format(left, width, avail_w))
        if top + height > avail_h + EPS:
            report.error(scope, '纵向越界：{:.2f}+{:.2f} > 可用高 {:.2f}mm'.format(top, height, avail_h))
        elif not continuous and top + height > bottom_limit + EPS:
            report.warn(scope, '内容底边 {:.2f}mm 距版心底边不足 {}mm 安全余量（可能被判到第二页）'.format(
                top + height, SAFETY_MARGIN))
        check_expressions(report, scope, o.get('formatter'))
        if el.get('type') == 'table':
            check_table(report, scope, o)

    check_pagination(report, t, label, avail_h, continuous)
    check_tiling(report, t)


def main() -> int:
    args = sys.argv[1:]
    as_json = '--json' in args
    if as_json:
        args.remove('--json')
    if not args:
        sys.stderr.write('用法：python3 validate_template.py <模板.json> [--json]\n')
        return 2
    path = args[0]
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    report = Report()
    if isinstance(data, dict) and isinstance(data.get('pages'), list):
        if not data['pages']:
            report.error('模板', 'pages 为空数组')
        for i, page in enumerate(data['pages']):
            check_page(report, page, '第{}页'.format(i + 1))
    else:
        check_page(report, data, '模板')

    if as_json:
        print(json.dumps({'errors': report.error_count, 'items': report.items},
                         ensure_ascii=False, indent=2))
    else:
        if not report.items:
            print('✅ 通过：未发现问题')
        for item in report.items:
            print('{} [{}] {}'.format(
                '❌' if item['level'] == 'ERROR' else '⚠️', item['scope'], item['message']))
        print('—— 共 {} 项（ERROR {} / WARN {}）'.format(
            len(report.items), report.error_count, len(report.items) - report.error_count))
    return 1 if report.error_count else 0


if __name__ == '__main__':
    sys.exit(main())
