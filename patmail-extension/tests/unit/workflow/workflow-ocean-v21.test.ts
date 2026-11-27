import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { OceanAdaptiveQuality } from '../../../src/app/components/workflow-ocean/rendering/adaptive-quality'
import { OceanCameraRig } from '../../../src/app/components/workflow-ocean/rendering/camera'
import { OceanRenderScheduler } from '../../../src/app/components/workflow-ocean/rendering/render-scheduler'
import { OceanRendererStateMachine } from '../../../src/app/components/workflow-ocean/rendering/renderer-state'
import { OceanResourceManager } from '../../../src/app/components/workflow-ocean/rendering/resource-manager'
import { useOceanRenderer } from '../../../src/app/components/workflow-ocean/composables/useOceanRenderer'

describe('Knowledge Ocean 2.1 unit guarantees', () => {
  let app: ReturnType<typeof createApp> | null = null
  let host: HTMLElement | null = null

  afterEach(() => {
    app?.unmount()
    app = null
    host?.remove()
    host = null
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, '__patmailOceanTestHooks')
  })

  it('enforces OceanRendererStateMachine transitions, first-frame gate, and terminal disposed state', () => {
    const sm = new OceanRendererStateMachine(2)
    expect(sm.state).toBe('uninitialized')
    expect(sm.canShowCanvas).toBe(false)

    // Cannot jump directly from uninitialized to ready without initialization & first frame
    expect(sm.transition('ready')).toBe(false)
    expect(sm.state).toBe('uninitialized')

    expect(sm.transition('initializing')).toBe(true)
    expect(sm.transition('first-frame-pending')).toBe(true)
    expect(sm.canShowCanvas).toBe(false)

    expect(sm.transition('ready')).toBe(true)
    expect(sm.hasValidFrame).toBe(true)
    expect(sm.canShowCanvas).toBe(true)

    // Normal pause retains last valid frame
    expect(sm.transition('paused')).toBe(true)
    expect(sm.canShowCanvas).toBe(true)

    // Context lost clears valid frame and hides canvas
    expect(sm.transition('context-lost', 'webgl-context-lost')).toBe(true)
    expect(sm.hasValidFrame).toBe(false)
    expect(sm.canShowCanvas).toBe(false)
    expect(sm.canAttemptRecovery()).toBe(true)

    expect(sm.transition('recovering')).toBe(true)
    expect(sm.recoveryAttempts).toBe(1)
    expect(sm.transition('context-lost')).toBe(true)
    expect(sm.transition('recovering')).toBe(true)
    expect(sm.recoveryAttempts).toBe(2)
    expect(sm.transition('context-lost')).toBe(true)
    expect(sm.canAttemptRecovery()).toBe(false)

    expect(sm.transition('fallback', 'exhausted')).toBe(true)
    expect(sm.fallbackReason).toBe('exhausted')
    expect(sm.resetForManualRetry()).toBe(true)
    expect(sm.state).toBe('uninitialized')

    // Disposed is terminal
    expect(sm.transition('disposed')).toBe(true)
    expect(sm.transition('initializing')).toBe(false)
    expect(sm.resetForManualRetry()).toBe(false)
  })

  it('manages GPU resources cleanly across 100 replacements and fault-tolerant disposeAll', () => {
    const mgr = new OceanResourceManager()
    let current = mgr.track({ dispose: vi.fn() })
    for (let i = 0; i < 100; i++) {
      const prev = current
      const next = { dispose: vi.fn() }
      current = mgr.replace(prev, next)
      expect(prev.dispose).toHaveBeenCalledTimes(1)
      expect(mgr.count).toBe(1)
    }

    // Double release is idempotent
    mgr.release(current)
    mgr.release(current)
    expect(current.dispose).toHaveBeenCalledTimes(1)
    expect(mgr.count).toBe(0)

    // Throwing dispose does not block remaining resources
    const bad = mgr.track({
      dispose() {
        throw new Error('dispose boom')
      }
    })
    const good = mgr.track({ dispose: vi.fn() })
    expect(bad).toBeTruthy()
    mgr.disposeAll()
    expect(good.dispose).toHaveBeenCalledTimes(1)
    expect(mgr.count).toBe(0)
  })

  it('stops RAF when eco mode settles and wakes on invalidate()', () => {
    let nextRafId = 1
    const rafQueue = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextRafId++
      rafQueue.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue.delete(id)
    })

    const rig = new OceanCameraRig(16 / 9)
    let renders = 0
    const scheduler = new OceanRenderScheduler(
      dt => {
        rig.update(dt)
        renders += 1
      },
      () => rig.isSettled()
    )
    scheduler.setQuality('eco')
    scheduler.start()

    // Initial tick renders first frame & clears dirty flags -> camera is already settled -> stops RAF
    const entries1 = [...rafQueue.entries()]
    rafQueue.clear()
    for (const [, cb] of entries1) cb(100)
    expect(renders).toBe(1)
    expect(rafQueue.size).toBe(0)

    // Pointer activity wakes scheduler until camera converges again
    rig.setPointerTarget(0.8, -0.4)
    scheduler.notifyPointerActivity()
    expect(rafQueue.size).toBe(1)

    let guard = 0
    while (rafQueue.size > 0 && guard < 120) {
      const batch = [...rafQueue.entries()]
      rafQueue.clear()
      for (const [, cb] of batch) cb(200 + guard * 50)
      guard += 1
    }
    expect(rig.isSettled()).toBe(true)
    expect(rafQueue.size).toBe(0)
  })

  it('applies EWMA smoothing, hysteresis, and cooldown in OceanAdaptiveQuality without upgrading static', () => {
    const aqStatic = new OceanAdaptiveQuality('static')
    for (let i = 0; i < 20; i++) {
      expect(aqStatic.recordCpuCost(1, i * 1000).effective).toBe('static')
    }

    const aq = new OceanAdaptiveQuality('cinema')
    // Single spike must not downgrade
    expect(aq.recordCpuCost(30, 1000).changed).toBe(false)
    expect(aq.getEffective()).toBe('cinema')

    // Sustained over-budget after cooldown downgrades cinema -> balanced
    let res = { changed: false, effective: aq.getEffective(), reason: aq.getReason() }
    for (let i = 0; i < 8; i++) {
      res = aq.recordCpuCost(22, 9000 + i * 50)
    }
    expect(aq.getEffective()).toBe('balanced')
    expect(res.reason).toBe('adaptive-downgrade:balanced')

    // Cooldown window blocks immediate second downgrade
    for (let i = 0; i < 8; i++) {
      aq.recordCpuCost(35, 10000 + i * 50)
    }
    expect(aq.getEffective()).toBe('balanced')

    // Cautious recovery after cooldown + 18 low-cost samples
    for (let i = 0; i < 25; i++) {
      aq.recordCpuCost(2, 20000 + i * 50)
    }
    expect(aq.getEffective()).toBe('cinema')
  })

  it('guards useOceanRenderer against async init races and forced init failures', async () => {
    window.__patmailOceanTestHooks = { forceInitError: true }
    const canvasEl = ref<HTMLCanvasElement | null>(document.createElement('canvas'))
    const quality = ref<'static' | 'balanced' | 'cinema' | 'eco'>('cinema')
    const renderingActive = ref(true)
    const unavailableSpy = vi.fn()
    const apiHolder: { current?: ReturnType<typeof useOceanRenderer> } = {}

    const Harness = defineComponent({
      setup() {
        apiHolder.current = useOceanRenderer({
          canvasEl,
          quality,
          renderingActive,
          onWebglUnavailable: unavailableSpy
        })
        return () => h('div')
      }
    })

    host = document.body.appendChild(document.createElement('div'))
    app = createApp(Harness)
    app.mount(host)

    // Race: switch to static immediately while async import is in flight
    quality.value = 'static'
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 40))

    expect(apiHolder.current?.rendererState.value).toBe('uninitialized')
    expect(unavailableSpy).not.toHaveBeenCalled()

    // Now test forced init error when quality stays balanced
    quality.value = 'balanced'
    await nextTick()
    await vi.waitFor(() => {
      expect(apiHolder.current?.rendererState.value).toBe('fallback')
    }, { timeout: 3000 })
    expect(apiHolder.current?.canShowCanvas.value).toBe(false)
    expect(unavailableSpy).toHaveBeenCalled()
  })
})
