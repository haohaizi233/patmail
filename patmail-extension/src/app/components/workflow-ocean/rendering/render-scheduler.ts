export type OceanQuality = 'cinema' | 'balanced' | 'eco' | 'static'

export type RenderInvalidationReason = 'camera' | 'scene' | 'resize' | 'quality'

export interface RenderInvalidation {
  cameraDirty: boolean
  sceneDirty: boolean
  resizeDirty: boolean
  qualityDirty: boolean
  environmentAnimated: boolean
}

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
  private readonly cpuCosts: number[] = []
  private quality: Exclude<OceanQuality, 'static'> = 'balanced'
  private startedAt = 0
  private rafCallbacks = 0
  private renderedFrames = 0

  readonly invalidation: RenderInvalidation = {
    cameraDirty: true,
    sceneDirty: true,
    resizeDirty: false,
    qualityDirty: false,
    environmentAnimated: true
  }

  constructor(
    private readonly onRender: (dtSeconds: number, elapsedSeconds: number) => void,
    private readonly isCameraSettled: () => boolean = () => true,
    private readonly onCpuCostSample?: (cpuCostMs: number, nowMs: number) => void
  ) {}

  setQuality(quality: Exclude<OceanQuality, 'static'>): void {
    this.quality = quality
    this.invalidation.environmentAnimated = QUALITY_PROFILES[quality].animateEnvironment
    this.invalidate('quality')
  }

  invalidate(reason: RenderInvalidationReason): void {
    if (reason === 'camera') this.invalidation.cameraDirty = true
    if (reason === 'scene') this.invalidation.sceneDirty = true
    if (reason === 'resize') this.invalidation.resizeDirty = true
    if (reason === 'quality') this.invalidation.qualityDirty = true
    if (this.running && !this.rafId) {
      this.lastTickMs = performance.now()
      this.scheduleNext()
    }
  }

  notifyPointerActivity(): void {
    this.pointerBoostUntil = performance.now() + 900
    this.invalidate('camera')
  }

  start(): void {
    if (this.running) return
    this.running = true
    const now = performance.now()
    if (!this.startedAt) this.startedAt = now
    this.lastTickMs = now
    this.lastRenderMs = 0
    this.invalidation.sceneDirty = true
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
    const t0 = performance.now()
    this.onRender(0.016, (now - this.startedAt) / 1000)
    this.recordCpuCost(performance.now() - t0, now)
    this.renderedFrames += 1
    this.clearDirtyFlags()
  }

  getMetrics(): {
    fps: number
    p95FrameMs: number
    cpuRenderCostMs: number
    rafCallbacks: number
    renderedFrames: number
  } {
    const sorted = [...this.frameDurations].sort((a, b) => a - b)
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
    const avg = sorted.length ? sorted.reduce((sum, v) => sum + v, 0) / sorted.length : 0
    const avgCpu = this.cpuCosts.length
      ? this.cpuCosts.reduce((sum, v) => sum + v, 0) / this.cpuCosts.length
      : 0
    return {
      fps: avg > 0 ? Math.round(1000 / avg) : 0,
      p95FrameMs: Number((sorted[p95Idx] ?? 0).toFixed(2)),
      cpuRenderCostMs: Number(avgCpu.toFixed(2)),
      rafCallbacks: this.rafCallbacks,
      renderedFrames: this.renderedFrames
    }
  }

  private recordCpuCost(costMs: number, now: number): void {
    this.cpuCosts.push(costMs)
    if (this.cpuCosts.length > 60) this.cpuCosts.shift()
    this.onCpuCostSample?.(costMs, now)
  }

  private clearDirtyFlags(): void {
    this.invalidation.cameraDirty = !this.isCameraSettled()
    this.invalidation.sceneDirty = false
    this.invalidation.resizeDirty = false
    this.invalidation.qualityDirty = false
  }

  private shouldContinueLoop(): boolean {
    return (
      this.invalidation.environmentAnimated ||
      this.invalidation.cameraDirty ||
      this.invalidation.sceneDirty ||
      this.invalidation.resizeDirty ||
      this.invalidation.qualityDirty ||
      !this.isCameraSettled()
    )
  }

  private scheduleNext(): void {
    if (!this.running || this.rafId || typeof requestAnimationFrame !== 'function') return
    if (!this.shouldContinueLoop()) return
    this.rafId = requestAnimationFrame(this.tick)
  }

  private readonly tick = (now: number): void => {
    this.rafId = 0
    this.rafCallbacks += 1
    if (!this.running) return

    const profile = QUALITY_PROFILES[this.quality]
    const targetFps = now < this.pointerBoostUntil ? profile.activeFps : profile.idleFps
    const minInterval = 1000 / Math.max(1, targetFps)

    const mustRender =
      this.invalidation.resizeDirty ||
      this.invalidation.qualityDirty ||
      this.invalidation.sceneDirty

    if (mustRender || !this.lastRenderMs || now - this.lastRenderMs >= minInterval - 1.5) {
      const dtMs = this.lastRenderMs ? now - this.lastRenderMs : minInterval
      this.lastRenderMs = now
      this.frameDurations.push(dtMs)
      if (this.frameDurations.length > 90) this.frameDurations.shift()

      const dtSeconds = Math.min(0.1, Math.max(0.001, (now - this.lastTickMs) / 1000))
      this.lastTickMs = now
      const t0 = performance.now()
      this.onRender(dtSeconds, (now - this.startedAt) / 1000)
      this.recordCpuCost(performance.now() - t0, now)
      this.renderedFrames += 1
      this.clearDirtyFlags()
    }

    this.scheduleNext()
  }
}
