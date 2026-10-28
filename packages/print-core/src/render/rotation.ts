// print-core/src/render/rotation.ts
// 元素级旋转的口径单点：AABB 几何、类型/档位放行与直角吸附。
// 分页引擎、连续纸推导、出纸校验与 HTML 渲染四处共用本文件，禁止各自重抄三角公式。

/** 旋转后轴对齐外接盒（mm），坐标与设计盒同一参照系 */
export interface RotatedAabb {
  left: number
  top: number
  width: number
  height: number
}

/** 归一化到 [0,360) 的整数度；非有限值返回 0 */
export function normalizeRotationAngle(angleDeg: number): number {
  if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg)) return 0
  return ((angleDeg % 360) + 360) % 360
}

/**
 * 设计盒绕中心旋转 angleDeg 后的轴对齐外接盒。
 * effectiveHeight 为实测/设计高（autoHeight 元素以测量趟实测为准）。
 * 直角档走精确换算不走三角函数——0° 必须逐字退化回原盒，存量分页产物才 byte 级不变。
 */
export function getRotatedAabb(
  box: { left: number; top: number; width: number; height: number },
  effectiveHeight: number,
  angleDeg: number,
): RotatedAabb {
  const w = box.width
  const h = effectiveHeight
  const a = normalizeRotationAngle(angleDeg)
  let aabbW: number
  let aabbH: number
  if (a === 0 || a === 180) {
    aabbW = w
    aabbH = h
  } else if (a === 90 || a === 270) {
    aabbW = h
    aabbH = w
  } else {
    const theta = (a * Math.PI) / 180
    aabbW = w * Math.abs(Math.cos(theta)) + h * Math.abs(Math.sin(theta))
    aabbH = w * Math.abs(Math.sin(theta)) + h * Math.abs(Math.cos(theta))
  }
  return {
    left: box.left - (aabbW - w) / 2,
    top: box.top - (aabbH - h) / 2,
    width: aabbW,
    height: aabbH,
  }
}

/** 条码任意角度的点阵放行门槛（点/英寸）：实测 385dpi 起斜角游程恢复干净，300dpi 细条劣化 9 倍 */
export const CODE_ROTATION_MIN_DPI = 385

/** v1 忽略元素级旋转的类型（渲染不转；模板不报错，出纸保持水平） */
const ROTATION_EXCLUDED_TYPES = new Set(['table', 'flowList'])

/** 类型本身是否不参与元素级旋转（v1 排除项单点，宿主判「属性台是否出行」用它） */
export function isRotationExcludedType(type: string): boolean {
  return ROTATION_EXCLUDED_TYPES.has(type)
}

/** 码类「任意角度」需 385dpi 以上打印头；属性台据此置灰自由角度输入（90° 步进不受限） */
export const CODE_OBLIQUE_NOTE = '条码与二维码仅支持 90° 步进；任意角度需 385dpi 以上打印头'

/**
 * 自由角度是否可编辑：`barcode` / `qrcode` 受 CODE_ROTATION_MIN_DPI 门槛约束（未声明打印头分辨率即不可），
 * 其余类型恒可编辑。与 resolveElementRotation 的吸附档同一门槛，避免属性台放开、出纸又吸附的分叉。
 */
export function isFreeAngleEditable(type: string, opts?: { printerDpi?: number }): boolean {
  if (type !== 'barcode' && type !== 'qrcode') return true
  const dpi = opts?.printerDpi
  return typeof dpi === 'number' && dpi > 0 && dpi >= CODE_ROTATION_MIN_DPI
}

/**
 * 元素的有效旋转角（度，[0,360) 归一）；不旋转返回 undefined。
 * - table / flowList：v1 排除，恒 undefined
 * - barcode / qrcode：直角档（90/180/270）全 dpi 放行；斜角需 dpi ≥ CODE_ROTATION_MIN_DPI，
 *   已知 dpi 低于门槛时吸附到最近的直角倍数（0 档归 undefined）；dpi 未知按声明角放行
 *   （设计器无法预知打印端 dpi，出纸端按各自已知值传入）
 * @param dpi 出纸端已知分辨率；缺省取元素自身的 `options.printerDpi`（条码与二维码同口径）
 */
export function resolveElementRotation(
  type: string,
  opts: { rotate?: number; printerDpi?: number } | undefined,
  dpi?: number,
): number | undefined {
  const raw = opts?.rotate
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  const a = normalizeRotationAngle(raw)
  if (a === 0) return undefined
  if (ROTATION_EXCLUDED_TYPES.has(type)) return undefined
  if (type === 'barcode' || type === 'qrcode') {
    if (a === 90 || a === 180 || a === 270) return a
    const effDpi = dpi ?? opts?.printerDpi
    if (typeof effDpi === 'number' && effDpi > 0 && effDpi < CODE_ROTATION_MIN_DPI) {
      const snapped = normalizeRotationAngle(Math.round(a / 90) * 90)
      return snapped === 0 ? undefined : snapped
    }
  }
  return a
}

/**
 * 换页落点修正量：AABB 顶相对设计盒顶的上移量（mm，正值）。
 * 换页把 AABB 顶贴目标页列游标，renderTop = 目标顶 − 本函数返回值。
 */
export function rotatedTopShift(effectiveHeight: number, angleDeg: number, width: number): number {
  const a = normalizeRotationAngle(angleDeg)
  if (a === 0) return 0
  const aabb = getRotatedAabb({ left: 0, top: 0, width, height: effectiveHeight }, effectiveHeight, a)
  return -aabb.top
}
