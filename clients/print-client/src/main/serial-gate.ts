// 打印任务串行锁：客户端同一时刻只处理一个打印任务，并发直接拒绝（不排队）。
import { ProtocolFailure } from './protocol-error.js'

export class SerialGate {
  private running = false

  get isBusy(): boolean {
    return this.running
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running) {
      throw new ProtocolFailure('BUSY', '客户端正在处理其他打印任务，请稍后重试')
    }
    this.running = true
    try {
      return await fn()
    } finally {
      this.running = false
    }
  }
}
