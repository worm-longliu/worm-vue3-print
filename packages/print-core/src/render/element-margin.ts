export interface ElementMarginOptions {
  marginTop?: unknown
  marginRight?: unknown
  marginBottom?: unknown
  marginLeft?: unknown
}

export interface ElementMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ElementBox {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface ElementBoxInput extends ElementMarginOptions {
  left?: number
  top?: number
  width?: number
  height?: number
}

export interface ElementLayoutBoxes {
  border: ElementBox
  margin: ElementBox
}

const finite = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export function resolveElementMargins(options?: ElementMarginOptions | null): ElementMargins {
  const value = options ?? {}
  return {
    top: finite(value.marginTop),
    right: finite(value.marginRight),
    bottom: finite(value.marginBottom),
    left: finite(value.marginLeft),
  }
}

export function elementMarginCss(options?: ElementMarginOptions | null): string {
  const margins = resolveElementMargins(options)
  return (['top', 'right', 'bottom', 'left'] as const)
    .filter(key => margins[key] !== 0)
    .map(key => `margin-${key}:${margins[key]}mm`)
    .join(';')
}

export function resolveElementBoxes(
  input: ElementBoxInput = {},
  effectiveHeight = input.height ?? 0,
): ElementLayoutBoxes {
  const margins = resolveElementMargins(input)
  const left = input.left ?? 0
  const top = input.top ?? 0
  const width = input.width ?? 100
  const height = effectiveHeight
  const border = {
    left: left + margins.left,
    top: top + margins.top,
    right: left + margins.left + width,
    bottom: top + margins.top + height,
    width,
    height,
  }
  const margin = {
    left,
    top,
    right: left + margins.left + width + margins.right,
    bottom: top + margins.top + height + margins.bottom,
    width: Math.max(0, margins.left + width + margins.right),
    height: Math.max(0, margins.top + height + margins.bottom),
  }
  return { border, margin }
}
