import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { OceanEngineDiagnostics, OceanEngineHandle } from '../rendering/engine'
import type { OceanQuality } from '../rendering/render-scheduler'

declare global {
  interface Window {
    __patmailOceanDiagnostics?: () => OceanEngineDiagnostics | null
  }
}

export function useOceanRenderer(options: {
  canvasEl: Ref<HTMLCanvasElement | null>
  quality: Ref<OceanQuality>
  renderingActive: Ref<boolean>
  onWebglUnavailable: () => void
}) {
  const webglActive = ref(false)
  const contextLost = ref(false)
  let engine: OceanEngineHandle | null = null
  let initInFlight = false
  let resizeObserver: ResizeObserver | null = null
  let disposed = false

  function destroyEngine(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (engine) {
      engine.dispose()
      engine = null
    }
    webglActive.value = false
    contextLost.value = false
  }

  async function ensureEngine(): Promise<void> {
    const canvas = options.canvasEl.value
    const q = options.quality.value
    if (disposed || !canvas || q === 'static' || engine || initInFlight) return

    initInFlight = true
    try {
      const { createOceanEngine } = await import('../rendering/engine')
      if (disposed || options.quality.value === 'static' || !options.canvasEl.value) return
      engine = createOceanEngine(options.canvasEl.value, q, lost => {
        contextLost.value = lost
      })
      webglActive.value = true
      engine.setActive(options.renderingActive.value)

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(entries => {
          const entry = entries[0]
          if (entry && engine) {
            engine.resize(entry.contentRect.width, entry.contentRect.height)
          }
        })
        resizeObserver.observe(options.canvasEl.value)
      }
    } catch {
      destroyEngine()
      options.onWebglUnavailable()
    } finally {
      initInFlight = false
    }
  }

  if (typeof window !== 'undefined') {
    window.__patmailOceanDiagnostics = () => (engine ? engine.getDiagnostics() : null)
  }

  watch(
    [options.canvasEl, options.quality, options.renderingActive],
    ([canvas, q, active]) => {
      if (q === 'static' || !canvas) {
        destroyEngine()
        return
      }
      if (!engine) {
        if (active) {
          void ensureEngine()
        }
        return
      }
      engine.setQuality(q)
      engine.setActive(active)
    },
    { immediate: true }
  )

  function setPointerTarget(nx: number, ny: number): void {
    engine?.setPointer(nx, ny)
  }

  onBeforeUnmount(() => {
    disposed = true
    destroyEngine()
    if (typeof window !== 'undefined' && window.__patmailOceanDiagnostics) {
      delete window.__patmailOceanDiagnostics
    }
  })

  return {
    webglActive,
    contextLost,
    setPointerTarget
  }
}
