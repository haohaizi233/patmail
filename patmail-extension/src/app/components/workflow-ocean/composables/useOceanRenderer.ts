import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { OceanEngineDiagnostics, OceanEngineHandle } from '../rendering/engine'
import type { OceanQuality, RenderInvalidationReason } from '../rendering/render-scheduler'
import { OceanRendererStateMachine, type OceanRendererState } from '../rendering/renderer-state'

declare global {
  interface Window {
    __patmailOceanDiagnostics?: () => OceanEngineDiagnostics | null
  }
}

export function useOceanRenderer(options: {
  canvasEl: Ref<HTMLCanvasElement | null>
  quality: Ref<OceanQuality>
  renderingActive: Ref<boolean>
  onWebglUnavailable: (reason?: string) => void
  onEffectiveQualityChange?: (effective: OceanQuality, reason: string | null) => void
}) {
  const stateMachine = new OceanRendererStateMachine(2)
  const rendererState = ref<OceanRendererState>(stateMachine.state)
  const hasValidFrame = ref(false)
  const fallbackReason = ref<string | null>(null)
  const contextLost = ref(false)

  let engine: OceanEngineHandle | null = null
  let generation = 0
  let initInFlight = false
  let pendingEnsure = false
  let resizeObserver: ResizeObserver | null = null
  let disposed = false

  const canShowCanvas = computed(
    () => hasValidFrame.value && (rendererState.value === 'ready' || rendererState.value === 'paused')
  )

  function syncStateFromMachine(): void {
    rendererState.value = stateMachine.state
    hasValidFrame.value = stateMachine.hasValidFrame
    fallbackReason.value = stateMachine.fallbackReason
    contextLost.value = stateMachine.state === 'context-lost' || stateMachine.state === 'recovering'
  }

  function destroyEngine(nextState: 'uninitialized' | 'fallback' | 'disposed' = 'uninitialized', reason: string | null = null): void {
    generation += 1
    resizeObserver?.disconnect()
    resizeObserver = null
    if (engine) {
      engine.dispose()
      engine = null
    }
    if (!disposed) {
      stateMachine.transition(nextState, reason)
      syncStateFromMachine()
    }
  }

  const currentQuality = (): OceanQuality => options.quality.value

  async function ensureEngine(): Promise<void> {
    if (disposed || currentQuality() === 'static' || !options.canvasEl.value || engine) {
      return
    }
    if (initInFlight) {
      pendingEnsure = true
      return
    }

    initInFlight = true
    pendingEnsure = false
    const token = ++generation
    stateMachine.transition('initializing')
    syncStateFromMachine()

    try {
      const { createOceanEngine } = await import('../rendering/engine')

      // 异步返回后重新校验代次、销毁标记以及最新画布和画质
      if (token !== generation || disposed) return
      const latestCanvas = options.canvasEl.value
      const latestQuality = currentQuality()
      if (!latestCanvas || latestQuality === 'static') {
        stateMachine.transition('uninitialized')
        syncStateFromMachine()
        return
      }

      const created = createOceanEngine(latestCanvas, latestQuality, {
        onContextLostChange(lost) {
          if (token !== generation || disposed) return
          if (lost) {
            stateMachine.transition('context-lost', 'webgl-context-lost')
            syncStateFromMachine()
            if (!stateMachine.canAttemptRecovery()) {
              destroyEngine('fallback', 'webgl-context-lost-exhausted')
              options.onWebglUnavailable('webgl-context-lost-exhausted')
            }
          } else {
            if (stateMachine.canAttemptRecovery()) {
              stateMachine.transition('recovering')
              syncStateFromMachine()
            } else {
              destroyEngine('fallback', 'webgl-context-lost-exhausted')
              options.onWebglUnavailable('webgl-context-lost-exhausted')
            }
          }
        },
        onContextRestored() {
          if (token !== generation || disposed) return
          stateMachine.transition('ready')
          if (!options.renderingActive.value) {
            stateMachine.transition('paused')
          }
          syncStateFromMachine()
        },
        onEffectiveQualityChange(effective, reason) {
          if (token !== generation || disposed) return
          options.onEffectiveQualityChange?.(effective, reason)
        },
        onFirstFrameError(reason) {
          if (token !== generation || disposed) return
          destroyEngine('fallback', reason)
          options.onWebglUnavailable(reason)
        }
      })

      const postQuality = currentQuality()
      if (token !== generation || disposed || !options.canvasEl.value || postQuality === 'static') {
        created.dispose()
        return
      }

      engine = created
      stateMachine.transition('first-frame-pending')
      syncStateFromMachine()

      const firstFrameOk = created.verifyFirstFrame()
      if (token !== generation || disposed) {
        if (engine === created) {
          created.dispose()
          engine = null
        }
        return
      }

      if (!firstFrameOk) {
        destroyEngine('fallback', 'first-frame-verification-failed')
        options.onWebglUnavailable('first-frame-verification-failed')
        return
      }

      if (options.renderingActive.value) {
        stateMachine.transition('ready')
        created.setActive(true)
      } else {
        stateMachine.transition('ready')
        stateMachine.transition('paused')
        created.setActive(false)
      }
      syncStateFromMachine()

      if (typeof ResizeObserver !== 'undefined' && options.canvasEl.value) {
        resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0]
          if (entry && engine && !disposed) {
            engine.resize(entry.contentRect.width, entry.contentRect.height)
          }
        })
        resizeObserver.observe(options.canvasEl.value)
      }
    } catch (err) {
      if (token === generation && !disposed) {
        const reason = err instanceof Error ? err.message : 'webgl-init-failed'
        destroyEngine('fallback', reason)
        options.onWebglUnavailable(reason)
      }
    } finally {
      initInFlight = false
      const finalQuality = currentQuality()
      if (
        pendingEnsure &&
        !disposed &&
        !engine &&
        finalQuality !== 'static' &&
        options.canvasEl.value &&
        options.renderingActive.value &&
        stateMachine.state !== 'fallback'
      ) {
        pendingEnsure = false
        void ensureEngine()
      }
    }
  }

  if (typeof window !== 'undefined') {
    window.__patmailOceanDiagnostics = () =>
      engine ? engine.getDiagnostics(stateMachine.state, stateMachine.fallbackReason) : null
  }

  watch(
    [options.canvasEl, options.quality, options.renderingActive],
    ([canvas, q, active]) => {
      if (q === 'static' || !canvas) {
        destroyEngine('uninitialized')
        return
      }
      if (stateMachine.state === 'fallback') {
        return
      }
      if (!engine) {
        if (active) {
          void ensureEngine()
        }
        return
      }
      engine.setQuality(q)
      if (stateMachine.state === 'ready' || stateMachine.state === 'paused') {
        stateMachine.transition(active ? 'ready' : 'paused')
        syncStateFromMachine()
      }
      engine.setActive(active)
    },
    { immediate: true }
  )

  function setPointerTarget(nx: number, ny: number): void {
    engine?.setPointer(nx, ny)
  }

  function invalidate(reason: RenderInvalidationReason): void {
    engine?.invalidate(reason)
  }

  function retry3D(): void {
    if (disposed) return
    destroyEngine('uninitialized')
    stateMachine.resetForManualRetry()
    syncStateFromMachine()
    if (options.quality.value !== 'static' && options.canvasEl.value && options.renderingActive.value) {
      void ensureEngine()
    }
  }

  onBeforeUnmount(() => {
    disposed = true
    destroyEngine('disposed')
    stateMachine.transition('disposed')
    syncStateFromMachine()
    if (typeof window !== 'undefined' && window.__patmailOceanDiagnostics) {
      delete window.__patmailOceanDiagnostics
    }
  })

  return {
    rendererState,
    canShowCanvas,
    webglActive: canShowCanvas,
    contextLost,
    fallbackReason,
    setPointerTarget,
    invalidate,
    retry3D
  }
}
