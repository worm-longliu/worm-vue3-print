// clients/print-client/src/main/font-service.ts
// 本机系统字体清单：采集一次并缓存整个进程生命周期。
// 采集走 core 的 readSystemFonts（平台差异集中在那里），此处只负责缓存策略。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readSystemFonts } from '@worm-vue3-print/core'
import type { FontCommandRunner, FontSourceReport } from '@worm-vue3-print/core'

const execFileAsync = promisify(execFile)

/** 默认执行器：system_profiler 的 JSON 输出可达数 MB，放宽 maxBuffer */
const runCommand: FontCommandRunner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 16 * 1024 * 1024 })
  return { stdout }
}

export interface FontService {
  list(): Promise<FontSourceReport>
}

export function makeFontService(
  run: FontCommandRunner = runCommand,
  platform: NodeJS.Platform = process.platform,
): FontService {
  let cached: FontSourceReport | null = null
  return {
    async list() {
      if (cached) return cached
      const report = await readSystemFonts(platform, run)
      // 只缓存成功结果：失败多为暂时性的（进程未就绪、权限），不该被钉死
      if (report.available) cached = report
      return report
    },
  }
}
