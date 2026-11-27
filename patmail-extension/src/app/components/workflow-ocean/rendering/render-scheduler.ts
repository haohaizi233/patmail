export type OceanQuality = 'cinema' | 'balanced' | 'eco' | 'static'

export interface QualityProfile {
  dprCap: number
  idleFps: number
  activeFps: number
  oceanSegments: number
  particleCount: number
  detailLevel: number
  animateEnvironment: boolean
}

export const QUALITY_PROFILES: Record<Exclude<OceanQuality, 'static'>, QualityProfile> = {
  cinema: {
    dprCap: 1.75,
    idleFps: 60,
    activeFps: 60,
    oceanSegments: 88,
    particleCount: 160,
    detailLevel: 1.0,
    animateEnvironment: true
  },
  balanced: {
    dprCap: 1.5,
    idleFps: 30,
    activeFps: 50,
    oceanSegments: 60,
    particleCount: 90,
    detailLevel: 0.72,
    animateEnvironment: true
  },
  eco: {
    dprCap: 1.0,
    idleFps: 15,
    activeFps: 24,
    oceanSegments: 32,
    particleCount: 36,
    detailLevel: 0.4,
    animateEnvironment: false
  }
}

export class OceanRenderScheduler {
  private rafId = 0
  private running = false
  private lastTickMs = 0
  private lastRenderMs = 0
  private pointerBoostUntil = 0
  private readonly frameDurations: number[] = []
  private quality: Exclude<OceanQuality, 'static'> = 'balanced'

  constructor(private readonly onRender: (dtSeconds: number, elapsedSeconds: number) => void) {}

  private startedAt = 0

  setQuality(quality: Exclude<OceanQuality, 'static'>): void {
    this.quality = quality
  }

  notifyPointerActivity(): void {
    this.pointerBoostUntil = performance.now() + 900
  }

  start(): void {
    if (this.running) return
    this.running = true
    const now = performance.now()
    if (!this.startedAt) this.startedAt = now
    this.lastTickMs = now
    this.lastRenderMs = 0
    this.scheduleNext()
  }

  stop(): void {
    this.running = false
    if (this.rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  renderSingleFrame(): void {
    const now = performance.now()
    if (!this.startedAt) this.startedAt = now
    this.onRender(0.016, (now - this.startedAt) / 1000)
  }

  getMetrics(): { fps: number; p95FrameMs: number } {
    if (!this.frameDurations.length) return { fps: 0, p95FrameMs: 0 }
    const sorted = [...this.frameDurations].sort((a, b) => a - b)
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
    const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length
    return {
      fps: avg > 0 ? Math.round(1000 / avg) : 0,
      p95FrameMs: Number((sorted[p95Idx] ?? 0).toFixed(2))
    }
  }

  private scheduleNext(): void {
    if (!this.running || typeof requestAnimationFrame !== 'function') return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private readonly tick = (now: number): void => {
    this.rafId = 0
    if (!this.running) return

    const profile = QUALITY_PROFILES[this.quality]
    const targetFps = now < this.pointerBoostUntil ? profile.activeFps : profile.idleFps
    const minInterval = 1000 / Math.max(1, targetFps)

    if (!this.lastRenderMs || now - this.lastRenderMs >= minInterval - 1.5) {
      const dtMs = this.lastRenderMs ? now - this.lastRenderMs : minInterval
      this.lastRenderMs = now
      this.frameDurations.push(dtMs)
      if (this.frameDurations.length > 90) this.frameDurations.shift()

      const dtSeconds = Math.min(0.1, Math.max(0.001, (now - this.lastTickMs) / 1000))
      this.lastTickMs = now
      this.onRender(dtSeconds, (now - this.startedAt) / 1000)
    }

    this.scheduleNext()
  }
}
