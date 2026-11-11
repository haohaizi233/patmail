/** FIFO permits; callers hold them only around the resource-consuming operation. */
export class PermitPool {
  private active = 0
  private waiters: (() => void)[] = []
  constructor(private readonly limit: number) { if (!Number.isInteger(limit) || limit < 1) throw new Error('并发数无效') }
  acquire(signal?: AbortSignal): Promise<() => void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('已停止')); return }
      const abort = () => { this.waiters = this.waiters.filter(w => w !== enter); signal?.removeEventListener('abort', abort); reject(new Error('已停止')) }
      const enter = () => {
        signal?.removeEventListener('abort', abort)
        this.active++
        let released = false
        resolve(() => {
          if (released) return
          released = true; this.active--
          this.waiters.shift()?.()
        })
      }
      if (this.active < this.limit) enter()
      else { this.waiters.push(enter); signal?.addEventListener('abort', abort, { once: true }) }
    })
  }
  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal)
    try { if (signal?.aborted) throw new Error('已停止'); return await work() } finally { release() }
  }
}
