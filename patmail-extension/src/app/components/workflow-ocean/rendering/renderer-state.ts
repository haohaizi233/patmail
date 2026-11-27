export type OceanRendererState =
  | 'uninitialized'
  | 'initializing'
  | 'first-frame-pending'
  | 'ready'
  | 'paused'
  | 'context-lost'
  | 'recovering'
  | 'fallback'
  | 'disposed'

const ALLOWED_TRANSITIONS: Record<OceanRendererState, ReadonlySet<OceanRendererState>> = {
  uninitialized: new Set(['initializing', 'fallback', 'disposed']),
  initializing: new Set(['first-frame-pending', 'paused', 'fallback', 'disposed', 'uninitialized']),
  'first-frame-pending': new Set(['ready', 'paused', 'context-lost', 'fallback', 'disposed', 'uninitialized']),
  ready: new Set(['paused', 'context-lost', 'fallback', 'disposed', 'uninitialized']),
  paused: new Set(['ready', 'first-frame-pending', 'context-lost', 'fallback', 'disposed', 'uninitialized']),
  'context-lost': new Set(['recovering', 'fallback', 'disposed', 'uninitialized']),
  recovering: new Set(['first-frame-pending', 'ready', 'paused', 'context-lost', 'fallback', 'disposed']),
  fallback: new Set(['initializing', 'uninitialized', 'disposed']),
  disposed: new Set([])
}

export class OceanRendererStateMachine {
  private _state: OceanRendererState = 'uninitialized'
  private _hasValidFrame = false
  private _fallbackReason: string | null = null
  private _recoveryAttempts = 0
  readonly maxRecoveryAttempts: number

  constructor(maxRecoveryAttempts = 2) {
    this.maxRecoveryAttempts = maxRecoveryAttempts
  }

  get state(): OceanRendererState {
    return this._state
  }

  get hasValidFrame(): boolean {
    return this._hasValidFrame
  }

  get fallbackReason(): string | null {
    return this._fallbackReason
  }

  get recoveryAttempts(): number {
    return this._recoveryAttempts
  }

  get canShowCanvas(): boolean {
    return this._hasValidFrame && (this._state === 'ready' || this._state === 'paused')
  }

  canTransition(next: OceanRendererState): boolean {
    if (this._state === next) return true
    return ALLOWED_TRANSITIONS[this._state].has(next)
  }

  transition(next: OceanRendererState, reason: string | null = null): boolean {
    if (this._state === 'disposed') return false
    if (!this.canTransition(next)) {
      return false
    }

    this._state = next

    if (next === 'ready') {
      this._hasValidFrame = true
      this._fallbackReason = null
      this._recoveryAttempts = 0
    } else if (next === 'first-frame-pending' || next === 'initializing' || next === 'uninitialized') {
      this._hasValidFrame = false
      if (next === 'initializing') {
        this._fallbackReason = null
      }
    } else if (next === 'context-lost') {
      this._hasValidFrame = false
      this._fallbackReason = reason ?? 'webgl-context-lost'
    } else if (next === 'recovering') {
      this._hasValidFrame = false
      this._recoveryAttempts += 1
    } else if (next === 'fallback') {
      this._hasValidFrame = false
      this._fallbackReason = reason ?? 'webgl-unavailable'
    } else if (next === 'disposed') {
      this._hasValidFrame = false
    }

    return true
  }

  canAttemptRecovery(): boolean {
    return this._state === 'context-lost' && this._recoveryAttempts < this.maxRecoveryAttempts
  }

  resetForManualRetry(): boolean {
    if (this._state === 'disposed') return false
    this._recoveryAttempts = 0
    this._fallbackReason = null
    this._hasValidFrame = false
    return this.transition('uninitialized')
  }
}
