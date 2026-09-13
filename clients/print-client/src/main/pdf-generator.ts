// PDF 生成：Electron printToPDF 的参数构造与超时兜底（纯逻辑，可在 Node 下单测）。
//
// 两条已实测的坑（Electron 40+）：
// 1. `webContents.printToPDF` 只保留 Promise 形式，回调重载已从类型与实现中移除。
//    仍按旧写法传回调会导致：回调永不触发、返回的 Promise 拒绝无人接收（错误被静默吞掉），
//    任务只能等超时；串行锁在整个等待期间不释放，后续任务全部返回 BUSY。
// 2. `PrintToPDFOptions.pageSize` 的单位是**英寸**（`webContents.print` 的 pageSize 才是微米）。
//    直接把微米值传进去会得到 210000×297000 英寸的荒诞纸张：Electron 44 生成直接失败
//    （print compositor: Page reading failed），Electron 40 则产出 5.3km×7.5km 的 PDF。
import { ProtocolFailure } from './protocol-error.js'

/** 1 英寸 = 25400 微米（协议与渲染层的长度单位） */
export const MICROMETERS_PER_INCH = 25_400

/** 纸张尺寸（微米），与协议 print.paperSize 同一坐标系 */
export interface MicrometerPaper {
  width: number
  height: number
}

/**
 * 与 Electron.PrintToPDFOptions 对齐的最小结构（不引 electron 类型以便单测）。
 * pageSize / margins 单位均为英寸。
 */
export interface PrintToPdfOptions {
  margins: { top: number; bottom: number; left: number; right: number }
  pageSize: { width: number; height: number }
  printBackground: boolean
  scale: number
}

/** printToPDF 的最小来源（真实实现为 webContents） */
export interface PrintToPdfSource {
  printToPDF: (options: PrintToPdfOptions) => Promise<Buffer>
}

/** 微米 → 英寸 */
export function micrometersToInches(um: number): number {
  return um / MICROMETERS_PER_INCH
}

/**
 * 构造 printToPDF 参数：
 * - 纸张：微米 → 英寸（Chromium 按该纸张排版，与服务端 `page.pdf({width,height})` 等价）；
 * - 边距：显式零边距（边距由 core HTML padding 自控）；
 * - 背景：保留（水印层与页面底色都依赖 printBackground）；
 * - 缩放：1，不做额外缩放。
 */
export function buildPrintToPdfOptions(paper: MicrometerPaper): PrintToPdfOptions {
  return {
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    pageSize: {
      width: micrometersToInches(paper.width),
      height: micrometersToInches(paper.height),
    },
    printBackground: true,
    scale: 1,
  }
}

/**
 * 生成 PDF。必须走 Promise 形式并自带超时兜底：
 * - 超时抛 PRINT_FAILED（串行锁随任务结束释放，避免后续任务一直被 BUSY 拒绝）；
 * - 生成失败（如纸张异常、渲染进程异常）抛 PRINT_FAILED，并保留原始原因便于排查。
 */
export async function renderPdf(
  source: PrintToPdfSource,
  paper: MicrometerPaper,
  timeoutMs: number,
): Promise<Buffer> {
  const options = buildPrintToPdfOptions(paper)
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const buffer = await Promise.race([
      source.printToPDF(options),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new ProtocolFailure('PRINT_FAILED', `PDF 生成超过 ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        )
      }),
    ])
    return Buffer.from(buffer)
  } catch (err) {
    if (err instanceof ProtocolFailure) throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new ProtocolFailure('PRINT_FAILED', `PDF 生成失败：${message}`)
  } finally {
    if (timer) clearTimeout(timer)
  }
}
