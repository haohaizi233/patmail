type Kind = 'naming' | 'download'
interface Waiter { kind: Kind; signal: AbortSignal; abort: () => void; resolve: (release: () => void) => void }

/** 六个可归还的在途额度；优先级在派发时读取，正文读完或取消才归还。 */
export class DownloadTokens {
  private active = 0
  private waiters: Waiter[] = []
  constructor(private readonly preferred: () => Kind) {}

  acquire(kind: Kind, signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) return Promise.reject(signal.reason)
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { kind, signal, resolve, abort: () => {
        this.waiters = this.waiters.filter(item => item !== waiter)
        reject(signal.reason)
        this.drain()
      } }
      this.waiters.push(waiter)
      signal.addEventListener('abort', waiter.abort, { once: true })
      this.drain()
    })
  }

  private drain(): void {
    while (this.active < 6 && this.waiters.length) {
      const preferred = this.waiters.findIndex(item => item.kind === this.preferred())
      const [waiter] = this.waiters.splice(preferred < 0 ? 0 : preferred, 1)
      waiter.signal.removeEventListener('abort', waiter.abort)
      this.active++
      let released = false
      waiter.resolve(() => {
        if (released) return
        released = true
        this.active--
        this.drain()
      })
    }
  }
}
