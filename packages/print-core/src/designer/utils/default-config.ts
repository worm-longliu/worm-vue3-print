// web/src/components/print/utils/default-config.ts
import type { TemplateData } from '../types.js'

/** 标签纸分组名（PAPER_PRESETS.group）：该组纸型默认取消页眉、页脚与页边距 */
export const LABEL_PAPER_GROUP = '标签纸'

export interface PaperPreset {
  width: number
  height: number
  /** 连续纸（热敏卷纸/小票纸）：出纸高度按内容推导，纸宽可用 customWidth 覆盖 */
  continuous?: boolean
  /** 设计器下拉显示名 */
  label?: string
  /** 设计器下拉分组名 */
  group?: string
}

/** 纸张预设（mm）；顺序即设计器下拉顺序，与 render 层 PAPER_DIMENSIONS 数值保持一致 */
export const PAPER_PRESETS: Record<string, PaperPreset> = {
  A4:     { width: 210, height: 297, label: 'A4 210×297mm',   group: '常用纸张' },
  A3:     { width: 297, height: 420, label: 'A3 297×420mm',   group: '常用纸张' },
  A5:     { width: 148, height: 210, label: 'A5 148×210mm',   group: '常用纸张' },
  Letter: { width: 216, height: 279, label: 'Letter 216×279mm', group: '常用纸张' },
  Legal:  { width: 216, height: 356, label: 'Legal 216×356mm',  group: '常用纸张' },
  // 针式打印纸（241 系列等分）：11 英寸整张 279.4mm 按等分取整
  DOT_FULL:  { width: 241, height: 279.4, label: '全等分 241×279.4mm', group: '针式打印纸' },
  DOT_HALF:  { width: 241, height: 139.7, label: '二等分 241×139.7mm', group: '针式打印纸' },
  DOT_THIRD: { width: 241, height: 93.1,  label: '三等分 241×93.1mm',  group: '针式打印纸' },
  // 标签纸
  LABEL_80X60: { width: 80, height: 60, label: '80×60mm', group: LABEL_PAPER_GROUP },
  LABEL_60X40: { width: 60, height: 40, label: '60×40mm', group: LABEL_PAPER_GROUP },
  LABEL_40X30: { width: 40, height: 30, label: '40×30mm', group: LABEL_PAPER_GROUP },
  // 小票纸（热敏卷纸）：高度仅为设计画布高度，出纸按内容推导
  THERMAL_57:  { width: 57,  height: 297, continuous: true, label: '57mm',  group: '小票纸' },
  THERMAL_80:  { width: 80,  height: 297, continuous: true, label: '80mm',  group: '小票纸' },
  THERMAL_110: { width: 110, height: 297, continuous: true, label: '110mm', group: '小票纸' },
  // 连续纸：默认 80mm 热敏；高度仅为设计画布高度，出纸按内容推导
  CONTINUOUS: { width: 80, height: 297, continuous: true, label: '连续纸（自定义宽度）', group: '连续纸' },
}

/** 纸型是否连续纸（小票纸/热敏卷纸）：出纸高度按渲染内容推导 */
export function isContinuousPaperSize(paperSize: string | undefined): boolean {
  return !!paperSize && PAPER_PRESETS[paperSize]?.continuous === true
}

/** 纸型是否标签纸：整张纸即一张标签，默认不留页边距、不占页眉页脚 */
export function isLabelPaperSize(paperSize: string | undefined): boolean {
  return !!paperSize && PAPER_PRESETS[paperSize]?.group === LABEL_PAPER_GROUP
}

/**
 * 标签纸的默认版面：四边页边距归零、页眉页脚高度归零（整张纸都给内容区）。
 * 页眉页脚里的元素保留，之后把高度改回即可恢复——切换纸型不应静默删掉用户内容。
 * 只在「切到标签纸」时套用一次，用户随后仍可自行调整。
 */
export function labelPaperDefaults(
  t: Pick<TemplateData, 'header' | 'footer'>,
): Pick<TemplateData, 'margins' | 'header' | 'footer'> {
  return {
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    header: { ...t.header, height: 0 },
    footer: { ...t.footer, height: 0 },
  }
}

/**
 * 获取纸张原始宽高（mm，未应用方向）
 * CUSTOM 时读取 customWidth/customHeight，缺省回退 A4；
 * 连续纸时宽度取 customWidth（缺省取预设纸宽），高度取 customHeight（缺省 297，仅设计画布），方向强制纵向。
 */
export function getPaperDimensions(t: Pick<TemplateData, 'paperSize' | 'orientation' | 'customWidth' | 'customHeight'>): { width: number; height: number } {
  const continuous = isContinuousPaperSize(t.paperSize)
  let base: { width: number; height: number }
  if (t.paperSize === 'CUSTOM' || continuous) {
    const preset = PAPER_PRESETS[t.paperSize]
    base = {
      width: t.customWidth ?? preset?.width ?? 210,
      height: t.customHeight ?? preset?.height ?? 297,
    }
  } else {
    const preset = PAPER_PRESETS[t.paperSize] || PAPER_PRESETS['A4']!
    // 只取宽高：预设还带 label/group 等下拉元数据，不能泄漏进几何结果
    base = { width: preset.width, height: preset.height }
  }
  return t.orientation === 'landscape' && !continuous
    ? { width: base.height, height: base.width }
    : base
}
