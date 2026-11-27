import type { OceanQuality } from './render-scheduler'

const QUALITY_ORDER: ReadonlyArray<Exclude<OceanQuality, 'static'>> = ['cinema', 'balanced', 'eco']

const CPU_BUDGET_MS: Record<Exclude<OceanQuality, 'static'>, number> = {
  cinema: 11,
  balanced: 16,
  eco: 24
}

export class OceanAdaptiveQuality {
  private preferred: OceanQuality
  private effective: OceanQuality
  private smoothedCpuMs = 0
  private overBudgetStreak = 0
  private underBudgetStreak = 0
  private lastSwitchAtMs = 0
  private degradeReason: string | null = null
  private readonly ewmaAlpha = 0.25
  private readonly cooldownMs = 8000

  constructor(initialPreferred: OceanQuality = 'static') {
    this.preferred = initialPreferred
    this.effective = initialPreferred
  }

  setPreferred(next: OceanQuality): void {
    this.preferred = next
    this.effective = next
    this.overBudgetStreak = 0
    this.underBudgetStreak = 0
    this.degradeReason = null
  }

  getPreferred(): OceanQuality {
    return this.preferred
  }

  getEffective(): OceanQuality {
    return this.effective
  }

  getReason(): string | null {
    return this.degradeReason
  }

  getSmoothedCpuMs(): number {
    return Number(this.smoothedCpuMs.toFixed(2))
  }

  /**
   * 基于单帧 CPU 渲染提交耗时（而非限帧后的 RAF 间隔）进行 EWMA 平滑与滞回调节：
   * - 静态模式永不自动升级；
   * - 实际画质永不超过用户偏好画质；
   * - 每次降级/恢复后进入冷却窗口，防止抖动。
   */
  recordCpuCost(cpuCostMs: number, nowMs: number): { changed: boolean; effective: OceanQuality; reason: string | null } {
    if (this.preferred === 'static' || this.effective === 'static') {
      return { changed: false, effective: this.effective, reason: this.degradeReason }
    }

    this.smoothedCpuMs =
      this.smoothedCpuMs === 0
        ? cpuCostMs
        : this.ewmaAlpha * cpuCostMs + (1 - this.ewmaAlpha) * this.smoothedCpuMs

    if (nowMs - this.lastSwitchAtMs < this.cooldownMs) {
      return { changed: false, effective: this.effective, reason: this.degradeReason }
    }

    const budget = CPU_BUDGET_MS[this.effective]
    const currentIdx = QUALITY_ORDER.indexOf(this.effective)
    const preferredIdx = QUALITY_ORDER.indexOf(this.preferred)

    if (this.smoothedCpuMs > budget) {
      this.overBudgetStreak += 1
      this.underBudgetStreak = 0
      if (this.overBudgetStreak >= 6 && currentIdx < QUALITY_ORDER.length - 1) {
        const next = QUALITY_ORDER[currentIdx + 1]
        this.effective = next
        this.overBudgetStreak = 0
        this.lastSwitchAtMs = nowMs
        this.degradeReason = `adaptive-downgrade:${next}`
        return { changed: true, effective: this.effective, reason: this.degradeReason }
      }
    } else if (this.smoothedCpuMs < budget * 0.55) {
      this.underBudgetStreak += 1
      this.overBudgetStreak = 0
      if (this.underBudgetStreak >= 18 && currentIdx > preferredIdx) {
        const next = QUALITY_ORDER[currentIdx - 1]
        this.effective = next
        this.underBudgetStreak = 0
        this.lastSwitchAtMs = nowMs
        this.degradeReason = next === this.preferred ? null : `adaptive-downgrade:${next}`
        return { changed: true, effective: this.effective, reason: this.degradeReason }
      }
    } else {
      this.overBudgetStreak = Math.max(0, this.overBudgetStreak - 1)
      this.underBudgetStreak = Math.max(0, this.underBudgetStreak - 1)
    }

    return { changed: false, effective: this.effective, reason: this.degradeReason }
  }
}
