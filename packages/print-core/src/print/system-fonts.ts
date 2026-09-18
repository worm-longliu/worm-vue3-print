// packages/print-core/src/print/system-fonts.ts
// 系统字体清单采集：把各平台的枚举输出解析为字体名数组。
// 只做切分，去重/排序/过滤交给 normalizeFontList，保证三端归一化口径一致。
import { normalizeFontList } from './fonts.js'
import type { FontSourceReport } from './fonts.js'

/** 命令执行结果；只取 stdout，stderr 与退出码由调用方在 run 内处理 */
export interface FontCommandResult {
  stdout: string
}

export type FontCommandRunner = (file: string, args: string[]) => Promise<FontCommandResult>

/**
 * 解析 `fc-list --format=%{family}\n` 输出。
 * family 字段是逗号分隔的多值（一个 .ttc 可携带多语言 family），必须整串展开。
 */
export function parseFcListOutput(stdout: string): string[] {
  const out: string[] = []
  for (const line of stdout.split('\n')) {
    for (const family of line.split(',')) {
      const name = family.trim()
      if (name) out.push(name)
    }
  }
  return out
}

/**
 * 解析 `system_profiler SPFontsDataType -json` 输出。
 * 每个条目是一个字体**文件**，_name 是文件名（"Times New Roman Bold.ttf"），
 * 真正的字体族在其 typefaces[].family —— 只取 _name 会得到一堆带后缀的假字体名。
 */
export function parseSystemProfilerFonts(json: unknown): string[] {
  const list = (json as { SPFontsDataType?: unknown } | null)?.SPFontsDataType
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const entry of list) {
    const typefaces = (entry as { typefaces?: unknown })?.typefaces
    if (!Array.isArray(typefaces)) continue
    for (const tf of typefaces) {
      const family = (tf as { family?: unknown })?.family
      if (typeof family === 'string' && family.trim()) out.push(family.trim())
    }
  }
  return out
}

/** 解析逐行输出的字体名（Windows InstalledFontCollection） */
export function parseWindowsFontOutput(stdout: string): string[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

/** Windows：PowerShell 调 GDI+ 枚举已安装字体族 */
const WIN_ARGS = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  // 不设 OutputEncoding 会按控制台代码页输出，中文系统下「宋体」等名字会乱码
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;' +
    '[System.Drawing.Text.InstalledFontCollection]::new().Families | ForEach-Object { $_.Name }',
]

/**
 * 采集本机系统字体清单。
 * 命令执行失败或输出不可解析时返回 available:false —— 表示「未知」，
 * 不能退化成空清单，否则下游会把每一个模板都判成字体缺失。
 */
export async function readSystemFonts(
  platform: NodeJS.Platform,
  run: FontCommandRunner,
): Promise<FontSourceReport> {
  const unavailable: FontSourceReport = { available: false, fonts: [] }
  try {
    let raw: string[]
    if (platform === 'win32') {
      raw = parseWindowsFontOutput((await run('powershell', WIN_ARGS)).stdout)
    } else if (platform === 'darwin') {
      const { stdout } = await run('system_profiler', ['SPFontsDataType', '-json'])
      const parsed = parseSystemProfilerFonts(JSON.parse(stdout))
      // 解析出 0 条几乎只可能是输出格式变了，按「未知」处理
      if (!parsed.length) return unavailable
      raw = parsed
    } else {
      // \n 需保持反斜杠字面量交给 fc-list 解释；execFile 不走 shell，无需引号
      const { stdout } = await run('fc-list', ['--format=%{family}\\n'])
      raw = parseFcListOutput(stdout)
    }
    const fonts = normalizeFontList(raw)
    if (!fonts.length) return unavailable
    return { available: true, fonts }
  } catch {
    return unavailable
  }
}
