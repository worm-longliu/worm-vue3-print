// packages/print-core/src/index.ts
import type { ASTNode, ExprFunction, EngineOptions } from './types.js'
import { tokenize } from './lexer.js'
import { parse } from './parser.js'
import { evaluate } from './evaluator.js'
import { parseTemplate, renderTemplate, compileTemplate } from './template-parser.js'

export class TemplateEngine {
  private functions: Record<string, ExprFunction> = {}

  constructor(options?: EngineOptions) {
    if (options?.functions) {
      this.functions = { ...options.functions }
    }
  }

  registerFunction(name: string, fn: ExprFunction): void {
    this.functions[name] = fn
  }

  evaluate(expression: string, context: Record<string, any>): any {
    const tokens = tokenize(expression)
    const ast = parse(tokens)
    return evaluate(ast, context, this.functions)
  }

  render(template: string, context: Record<string, any>): string {
    return compileTemplate(template, this.functions)(context)
  }
}

// 导出类型
export type { ASTNode, ExprFunction, EngineOptions, TemplateAST } from './types.js'

// 导出底层 API（高级用法）
export { tokenize } from './lexer.js'
export { parse } from './parser.js'
export { evaluate } from './evaluator.js'
export { parseTemplate, renderTemplate, compileTemplate } from './template-parser.js'
export { getByPath } from './utils.js'

// 导出函数库
export * from './functions/index.js'

// ─── 打印渲染管线（同构：Node 服务端 PDF 与浏览器 HTML 预览共用） ───
export { bindData, injectSystemVariables } from './render/data-binder.js'
export { resolveSystemVariables } from './render/data-binder.js'
export type { SystemVariableContext } from './render/data-binder.js'
export { generateHtml } from './render/html-generator.js'
export type { GenerateOptions } from './render/html-generator.js'
export { buildPageCss, elementPositionStyle, mm } from './render/css-builder.js'
export { paginate, tableDesignBottom } from './render/pagination-engine.js'
export { evaluateTemplate, safeEval } from './render/expression-eval.js'
export {
  getPaperDimensions,
  PAPER_DIMENSIONS,
  isContinuousPaper,
  isContinuousPaperSize,
} from './render/types.js'
export { composeContinuousHeight, MIN_CONTINUOUS_HEIGHT_MM } from './render/continuous-paper.js'
export {
  DEFAULT_SHRINK_MIN_FONT_SIZE_PT,
  MIN_SHRINK_FONT_SIZE_PT,
  resolveElementTextFit,
  resolveCellTextFit,
  resolveShrinkMinFontSize,
  roundFontSize,
  floorFontSize,
  cellFitKey,
  parseCellFitKey,
  cellFitCapMm,
} from './render/text-fit.js'
export type { TextFit } from './designer/types.js'
export type { FitFontSize, CellFitRowKind } from './render/text-fit.js'
export {
  WATERMARK_DEFAULTS,
  WATERMARK_DENSITY_PRESETS,
  PX_PER_MM,
  MM_PER_PX,
  isWatermarkVisible,
  resolveWatermarkText,
  formatTimestamp,
  resolveWatermarkLayout,
  renderWatermarkTileSvg,
  renderWatermarkLayerHtml,
} from './render/watermark.js'
export type { WatermarkPaper, WatermarkTile, ResolvedWatermark } from './render/watermark.js'
export type { WatermarkOptions } from './designer/types.js'
export type {
  TemplateData as PrintTemplateData,
  TemplateElement as PrintTemplateElement,
  PaperSize,
  ContinuousPaperSize,
  SheetPaperSize,
  PageLayout,
  PageSection,
  MeasuredElement,
  RenderRow,
  RenderCell,
  RenderRequest,
  CodeRenderer,
  CodeRenderOptions,
} from './render/types.js'

// 打印管线（纯 TS，Node 与浏览器都可加载；DOM 相关执行器在 ./browser 与 ./node 子路径）
export * from './print/index.js'
