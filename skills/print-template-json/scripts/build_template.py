#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「简写场景描述」编译成 worm-vue3-print 的可导入模板 JSON。

用法：
    python3 build_template.py scene.json -o output.template.json
    cat scene.json | python3 build_template.py - > output.template.json

简写描述只需给出「纸张 + 元素列表」，骨架字段（header/footer/firstPageOverlay/unit/
元素 id/printElementType/表格占位格）由本脚本补齐，避免手写完整 JSON 时漏字段。

完整字段规范见 references/template-schema.md。
"""

import json
import sys
from typing import Any, Dict, List, Optional

# 元素类型 → 设计器显示的中文名（写进 printElementType.title）
TYPE_TITLES = {
    'text': '文本',
    'image': '图片',
    'longText': '长文',
    'table': '表格',
    'hline': '横线',
    'vline': '竖线',
    'rect': '矩形',
    'oval': '椭圆',
    'barcode': '条形码',
    'qrcode': '二维码',
    'html': 'HTML',
    'pageNumber': '页码',
}

# 简写键 → 原生 ElementOptions 键（通用项）
COMMON_ALIAS = {
    'text': 'formatter',      # 文本/条码/二维码的内容（支持 {field} 与表达式）
    'size': 'fontSize',
    'weight': 'fontWeight',
    'family': 'fontFamily',
    'color': 'color',
    'bg': 'backgroundColor',
    'align': 'textAlign',
    'valign': 'verticalAlign',
    'decoration': 'textDecoration',
    'lineHeight': 'lineHeight',
    'letterSpacing': 'letterSpacing',
    'textFit': 'textFit',
    'wordWrap': 'wordWrap',
    'fit': 'fit',
    'zIndex': 'zIndex',
}

# 各类型专属别名
TYPE_ALIAS = {
    'barcode': {
        'code': 'barcodeType',   # code128 / ean13 / code39 / itf14 ...
        'barWidth': 'barWidth',  # 模块宽度倍率 2~4
        'dpi': 'printerDpi',     # 203/300/600，给出则吸附整数打印点
        'hideTitle': 'hideTitle',
    },
    'qrcode': {
        'level': 'qrCodeLevel',  # L/M/Q/H
    },
    'image': {
        'src': 'src',
        'maxWidth': 'maxWidth',
        'maxHeight': 'maxHeight',
    },
    'table': {
        'source': 'dataSource',  # 明细行迭代的数据数组路径，如 goods
        'cols': None,            # 特殊处理：列宽数组 → tableColWidths
        'rows': None,            # 特殊处理：行定义 → tableRows
        'size': 'tableDefaultFontSize',
        'padding': 'tableDefaultPadding',
        'color': 'tableDefaultColor',
    },
    'longText': {
        'text': 'formatter',
        'indent': 'longTextIndent',
    },
}

# 表格单元格简写键 → 原生键
CELL_ALIAS = {
    'text': 'formatter',
    'size': 'fontSize',
    'weight': 'fontWeight',
    'family': 'fontFamily',
    'color': 'color',
    'bg': 'backgroundColor',
    'align': 'align',
    'valign': 'valign',
    'type': 'cellType',
    'code': 'barcodeType',
    'barWidth': 'barWidth',
    'dpi': 'printerDpi',
    'showText': 'showBarcodeText',
    'level': 'qrCodeLevel',
    'padding': 'padding',
    'textFit': 'textFit',
    'wordWrap': 'wordWrap',
    'colspan': 'colspan',
    'rowspan': 'rowspan',
    'borders': 'borders',
}

ROW_TYPES = ('header', 'data', 'subtotal', 'summary')


class BuildError(Exception):
    pass


def parse_margins(value: Any, name: str) -> Dict[str, float]:
    """四边边距：接受 [上,右,下,左] 数组或 {top,right,bottom,left} 对象"""
    if value is None:
        return {'top': 0, 'right': 0, 'bottom': 0, 'left': 0}
    if isinstance(value, (int, float)):
        v = float(value)
        return {'top': v, 'right': v, 'bottom': v, 'left': v}
    if isinstance(value, dict):
        return {
            'top': float(value.get('top', 0)),
            'right': float(value.get('right', 0)),
            'bottom': float(value.get('bottom', 0)),
            'left': float(value.get('left', 0)),
        }
    if isinstance(value, list) and len(value) == 4:
        keys = ('top', 'right', 'bottom', 'left')
        return {k: float(v) for k, v in zip(keys, value)}
    if isinstance(value, list) and len(value) == 2:
        return {'top': float(value[0]), 'right': float(value[1]),
                'bottom': float(value[0]), 'left': float(value[1])}
    raise BuildError('{} 必须是 [上,右,下,左] 或 {{top,right,bottom,left}}'.format(name))


def parse_box(spec: Dict[str, Any]) -> Dict[str, float]:
    """元素几何：box=[left,top,width,height]（mm）"""
    box = spec.get('box')
    if not isinstance(box, list) or len(box) != 4:
        raise BuildError('元素缺少 box: [left, top, width, height]（mm）')
    keys = ('left', 'top', 'width', 'height')
    return {k: float(v) for k, v in zip(keys, box)}


def parse_border(value: Any) -> Dict[str, Any]:
    """边框简写：[宽(pt), 颜色]、[宽, 样式, 颜色] 或 {width,style,color}"""
    if value is None:
        return {}
    if isinstance(value, dict):
        out = {}
        if 'width' in value:
            out['borderWidth'] = float(value['width'])
        if 'style' in value:
            out['borderStyle'] = value['style']
        if 'color' in value:
            out['borderColor'] = value['color']
        return out
    if isinstance(value, list):
        out = {'borderWidth': float(value[0])}
        if len(value) == 2:
            out['borderColor'] = value[1]
        elif len(value) >= 3:
            out['borderStyle'] = value[1]
            out['borderColor'] = value[2]
        return out
    raise BuildError('border 必须是 [宽,色]、[宽,样式,色] 或 {width,style,color}')


def build_options(spec: Dict[str, Any], etype: str) -> Dict[str, Any]:
    """把元素简写编译成原生 ElementOptions"""
    options: Dict[str, Any] = parse_box(spec)
    alias = dict(COMMON_ALIAS)
    alias.update({k: v for k, v in TYPE_ALIAS.get(etype, {}).items() if v})

    for key, value in spec.items():
        if key in ('box', 'type', 'id', 'rows', 'cols', 'border'):
            continue
        if key not in alias:
            continue
        options[alias[key]] = value

    options.update(parse_border(spec.get('border')))

    # 横线/竖线：默认给一条 0.4pt 深灰线
    if etype in ('hline', 'vline') and 'borderWidth' not in options:
        options.setdefault('borderWidth', 0.4)
        options.setdefault('borderColor', '#333333')
        options.setdefault('borderStyle', 'solid')
    if etype == 'barcode':
        options.setdefault('barcodeType', 'code128')
    if etype == 'qrcode':
        options.setdefault('qrCodeLevel', 'M')
    if etype in ('text', 'longText'):
        options.setdefault('fontSize', 9)
    return options


def build_table(spec: Dict[str, Any], counters: Dict[str, int]) -> Dict[str, Any]:
    """表格元素：cols 列宽 + rows 行定义，自动补齐合并占位格"""
    options = build_options(spec, 'table')
    cols = spec.get('cols')
    if not isinstance(cols, list) or not cols:
        raise BuildError('表格元素缺少 cols: [列宽mm, ...]')
    options['tableColWidths'] = [float(c) for c in cols]

    rows_spec = spec.get('rows') or []
    if not rows_spec:
        raise BuildError('表格元素缺少 rows: [{type,height,cells}, ...]')

    ncol = len(cols)
    rows: List[Dict[str, Any]] = []
    # rowspan 记账：{列索引: 还需占用的行数}
    pending: Dict[int, int] = {}
    counters.setdefault('cell', 0)

    for r_index, r in enumerate(rows_spec):
        rtype = r.get('type', 'data')
        if rtype not in ROW_TYPES:
            raise BuildError('未知表格行类型：{}（可选 {}）'.format(rtype, '/'.join(ROW_TYPES)))
        cells: List[Dict[str, Any]] = []
        col = 0
        # 先填上一行 rowspan 延续下来的占位格
        while col in pending and pending[col] > 0:
            counters['cell'] += 1
            cells.append({'id': 'c{}'.format(counters['cell']), 'merged': True})
            pending[col] -= 1
            if pending[col] == 0:
                del pending[col]
            col += 1

        for c in r.get('cells', []):
            if col >= ncol:
                raise BuildError('第 {} 行单元格数超过列数 {}'.format(r_index + 1, ncol))
            counters['cell'] += 1
            cell: Dict[str, Any] = {'id': 'c{}'.format(counters['cell'])}
            for key, value in c.items():
                if key in CELL_ALIAS:
                    cell[CELL_ALIAS[key]] = value
            cells.append(cell)

            span = int(c.get('colspan', 1) or 1)
            rowspan = int(c.get('rowspan', 1) or 1)
            start_col = col
            col += 1  # 当前格占 1 列
            if rowspan > 1:
                pending[start_col] = rowspan - 1
            # colspan 覆盖的其余列补占位格
            for _ in range(span - 1):
                if col >= ncol:
                    raise BuildError('第 {} 行 colspan 超出列数 {}'.format(r_index + 1, ncol))
                counters['cell'] += 1
                cells.append({'id': 'c{}'.format(counters['cell']), 'merged': True})
                if rowspan > 1:
                    pending[col] = rowspan - 1
                col += 1

        # 行尾补齐到列数
        while len(cells) < ncol:
            counters['cell'] += 1
            cells.append({'id': 'c{}'.format(counters['cell']), 'merged': True})

        row: Dict[str, Any] = {
            'id': 'r{}'.format(r_index + 1),
            'type': rtype,
            'height': float(r.get('height', 7)),
            'cells': cells,
        }
        if rtype == 'header' and r.get('repeatOnPage') is not None:
            row['repeatOnPage'] = bool(r['repeatOnPage'])
        rows.append(row)

    options['tableRows'] = rows
    return options


def build_element(spec: Dict[str, Any], index: int, counters: Dict[str, int]) -> Dict[str, Any]:
    """单个元素：带 options 的对象视为原生写法，原样透传（逃生舱）"""
    if 'options' in spec and isinstance(spec['options'], dict):
        etype = spec.get('type', 'text')
        element = {
            'id': spec.get('id', 'el{}'.format(index + 1)),
            'type': etype,
            'options': spec['options'],
            'printElementType': {'type': etype, 'title': TYPE_TITLES.get(etype, etype)},
        }
        return element

    etype = spec.get('type')
    if not etype:
        raise BuildError('第 {} 个元素缺少 type'.format(index + 1))
    if etype not in TYPE_TITLES:
        raise BuildError('未知元素类型：{}（可选 {}）'.format(etype, '/'.join(sorted(TYPE_TITLES))))

    options = build_table(spec, counters) if etype == 'table' else build_options(spec, etype)
    return {
        'id': spec.get('id', 'el{}'.format(index + 1)),
        'type': etype,
        'options': options,
        'printElementType': {'type': etype, 'title': TYPE_TITLES[etype]},
    }


def build_template(spec: Dict[str, Any]) -> Dict[str, Any]:
    """整份模板：纸张骨架 + 元素列表"""
    paper = spec.get('paper', 'A4')
    if isinstance(paper, dict):
        paper_size = paper.get('size', 'CUSTOM')
        custom_w = paper.get('width')
        custom_h = paper.get('height')
        if paper_size == 'CUSTOM' and not (custom_w and custom_h):
            raise BuildError('自定义纸张必须给出 width 与 height（mm）')
    else:
        paper_size = paper
        custom_w = custom_h = None

    template: Dict[str, Any] = {
        'unit': 'mm',
        'paperSize': paper_size,
        'orientation': spec.get('orientation', 'portrait'),
        'margins': parse_margins(spec.get('margins'), 'margins'),
        'header': {'height': float(spec.get('header', 0)), 'elements': []},
        'footer': {'height': float(spec.get('footer', 0)), 'elements': []},
        'firstPageOverlay': {'height': 0, 'elements': []},
        'elements': [],
    }
    if custom_w is not None:
        template['customWidth'] = float(custom_w)
    if custom_h is not None:
        template['customHeight'] = float(custom_h)
    if 'name' in spec:
        template['name'] = spec['name']
    if 'watermark' in spec:
        template['watermark'] = spec['watermark']

    tiling = spec.get('tiling')
    if tiling:
        sheet_margin = parse_margins(tiling.get('sheetMargin', [10, 10, 10, 10]), 'tiling.sheetMargin')
        template['tiling'] = {
            'enabled': True,
            'sheetPaperSize': tiling.get('sheet', 'A4'),
            'sheetOrientation': tiling.get('sheetOrientation', 'portrait'),
            'sheetMargin': sheet_margin,
            'gapX': float(tiling.get('gapX', 2)),
            'gapY': float(tiling.get('gapY', 2)),
            'columns': int(tiling.get('columns', 2)),
        }
        if tiling.get('sheet') == 'CUSTOM':
            template['tiling']['sheetCustomWidth'] = float(tiling.get('sheetWidth', 210))
            template['tiling']['sheetCustomHeight'] = float(tiling.get('sheetHeight', 297))
        # 拼版标签：整张纸给内容区，内部边距留 0
        if not spec.get('margins'):
            template['margins'] = {'top': 0, 'right': 0, 'bottom': 0, 'left': 0}

    counters: Dict[str, int] = {'cell': 0}
    elements = spec.get('elements', [])
    for i, e in enumerate(elements):
        template['elements'].append(build_element(e, i, counters))

    # 页眉/页脚元素（较少用，走同一套简写）
    for zone in ('header', 'footer'):
        zone_elements = spec.get(zone + 'Elements')
        if zone_elements:
            template[zone]['elements'] = [
                build_element(e, i, counters) for i, e in enumerate(zone_elements)
            ]
    return template


def main() -> int:
    args = [a for a in sys.argv[1:]]
    out_path = None
    if '-o' in args:
        idx = args.index('-o')
        out_path = args[idx + 1]
        del args[idx:idx + 2]
    src = args[0] if args else '-'

    raw = sys.stdin.read() if src == '-' else open(src, encoding='utf-8').read()
    spec = json.loads(raw)

    # 多页面：{pages:[scene,...]} 逐个编译
    try:
        if 'pages' in spec:
            result = {'pages': [build_template(p) for p in spec['pages']]}
        else:
            result = build_template(spec)
    except BuildError as e:
        sys.stderr.write('编译失败：{}\n'.format(e))
        return 1

    text = json.dumps(result, ensure_ascii=False, indent=2)
    if out_path:
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(text + '\n')
        sys.stderr.write('已生成 {}（{} 字节）\n'.format(out_path, len(text)))
    else:
        sys.stdout.write(text + '\n')
    return 0


if __name__ == '__main__':
    sys.exit(main())
