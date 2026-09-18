// services/print-render/src/font-service.ts
// 容器内系统字体清单：进进程采集一次并缓存（容器字体集在部署生命周期内不变）。
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readSystemFonts, type FontCommandRunner, type FontSourceReport } from '@worm-vue3-print/core'

const execFileAsync = promisify(execFile)

/** 默认执行器：fc-list 输出可达数百 KB，放宽 maxBuffer */
const runCommand: FontCommandRunner = async (file, args) => {
  const { stdout } = await execFileAsync(file, args, { maxBuffer: 8 * 1024 * 1024 })
  return { stdout }
}

export interface FontService {
  list(): Promise<FontSourceReport>
}

/**
 * platform 可注入：部署环境为 Linux 容器，但开发机可能是 macOS，
 * 注入后测试才能稳定覆盖 fc-list 分支而不用跟随宿主平台漂移。
 */
export function makeFontService(
  run: FontCommandRunner = runCommand,
  platform: NodeJS.Platform = process.platform,
): FontService {
  let cached: FontSourceReport | null = null
  return {
    async list() {
      if (cached) return cached
      const report = await readSystemFonts(platform, run)
      // 只缓存成功结果：采集中途失败多半是暂时性的（进程/权限），不该钉死整个进程生命周期
      if (report.available) cached = report
      return report
    },
  }
}
