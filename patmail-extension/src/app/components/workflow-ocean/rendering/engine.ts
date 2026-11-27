import {
  Color,
  FogExp2,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  WebGLRenderer
} from 'three'
import atmosphereFrag from './shaders/atmosphere.frag.glsl?raw'
import { OceanAdaptiveQuality } from './adaptive-quality'
import { OceanCameraRig } from './camera'
import { createCrystalIslands } from './crystal-islands'
import { createKnowledgePlanet } from './knowledge-planet'
import { createOceanLighting } from './lighting'
import { createOceanSurface } from './ocean-surface'
import { createOceanParticles } from './particles'
import {
  OceanRenderScheduler,
  QUALITY_PROFILES,
  type OceanQuality,
  type RenderInvalidationReason
} from './render-scheduler'
import type { OceanRendererState } from './renderer-state'
import { OceanResourceManager } from './resource-manager'

const SKY_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

let activeRendererCount = 0

export function getActiveOceanRendererCount(): number {
  return activeRendererCount
}

export interface OceanTestHooks {
  forceInitError?: boolean
  forceShaderError?: boolean
}

declare global {
  interface Window {
    __patmailOceanTestHooks?: OceanTestHooks
  }
}

export interface OceanEngineDiagnostics {
  preferredQuality: OceanQuality
  effectiveQuality: OceanQuality
  rendererState: OceanRendererState
  fps: number
  p95FrameMs: number
  cpuRenderCostMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  trackedResources: number
  rafCallbacks: number
  renderedFrames: number
  activeRenderers: number
  contextLost: boolean
  fallbackReason: string | null
}

export interface OceanEngineHandle {
  setQuality(quality: Exclude<OceanQuality, 'static'>): void
  setPointer(nx: number, ny: number): void
  setActive(active: boolean): void
  invalidate(reason: RenderInvalidationReason): void
  resize(width: number, height: number): void
  verifyFirstFrame(): boolean
  getDiagnostics(
    rendererState?: OceanRendererState,
    fallbackReason?: string | null
  ): OceanEngineDiagnostics
  dispose(): void
}

export function createOceanEngine(
  canvas: HTMLCanvasElement,
  initialQuality: Exclude<OceanQuality, 'static'> = 'balanced',
  callbacks?: {
    onContextLostChange?: (lost: boolean) => void
    onContextRestored?: () => void
    onEffectiveQualityChange?: (effective: Exclude<OceanQuality, 'static'>, reason: string | null) => void
    onFirstFrameError?: (reason: string) => void
  }
): OceanEngineHandle {
  const testHooks = typeof window !== 'undefined' ? window.__patmailOceanTestHooks : undefined
  if (testHooks?.forceInitError) {
    throw new Error('forced-webgl-init-error')
  }

  const resources = new OceanResourceManager()
  let renderer: WebGLRenderer | null = null
  let rendererCounted = false

  try {
    let effectiveQuality: Exclude<OceanQuality, 'static'> = initialQuality
    const adaptive = new OceanAdaptiveQuality(initialQuality)
    let isActive = false
    let contextLost = false
    let disposed = false

    renderer = new WebGLRenderer({
      canvas,
      alpha: false,
      antialias: initialQuality !== 'eco',
      powerPreference: 'high-performance'
    })
    activeRendererCount += 1
    rendererCounted = true

    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor(new Color(0xf4ddf9), 1)
    renderer.autoClear = false
    renderer.info.autoReset = false

    const gl = renderer.getContext()
    if (!gl || gl.isContextLost()) {
      throw new Error('webgl-context-unavailable')
    }

    // 天空背景全屏面片（正交相机绘制在最底层）
    const skyScene = new Scene()
    const skyCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const skyGeo = resources.track(new PlaneGeometry(2, 2))
    const skyMat = resources.track(
      new ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: atmosphereFrag,
        depthTest: false,
        depthWrite: false
      })
    )
    skyScene.add(new Mesh(skyGeo, skyMat))

    // 主三维海洋场景
    const scene = new Scene()
    scene.fog = new FogExp2(0xf4ddf9, 0.014)

    const cameraRig = new OceanCameraRig(
      canvas.clientWidth && canvas.clientHeight ? canvas.clientWidth / canvas.clientHeight : 16 / 9
    )
    scene.add(createOceanLighting())

    const profile = QUALITY_PROFILES[effectiveQuality]
    const ocean = createOceanSurface(resources, profile.oceanSegments, profile.detailLevel)
    scene.add(ocean.mesh)

    const planet = createKnowledgePlanet(resources)
    scene.add(planet.group)

    const islands = createCrystalIslands(resources)
    scene.add(islands.group)

    const particles = createOceanParticles(resources, profile.particleCount)
    scene.add(particles.points)

    const applyDprAndSize = (width: number, height: number) => {
      if (!renderer) return
      const cap = QUALITY_PROFILES[effectiveQuality].dprCap
      const dpr = Math.min(cap, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
      renderer.setPixelRatio(dpr)
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
      cameraRig.resize(width, height)
    }

    applyDprAndSize(canvas.clientWidth || 1280, canvas.clientHeight || 720)

    const renderFullFrame = (dtSeconds: number, elapsedSeconds: number) => {
      if (!renderer || disposed || contextLost) return
      const activeProfile = QUALITY_PROFILES[effectiveQuality]
      cameraRig.update(dtSeconds)
      const timeVal = activeProfile.animateEnvironment ? elapsedSeconds : 0
      ocean.update(timeVal, activeProfile.animateEnvironment ? 1.0 : 0.35)
      if (activeProfile.animateEnvironment) {
        planet.update(dtSeconds, elapsedSeconds)
        islands.update(elapsedSeconds)
        particles.update(elapsedSeconds)
      }
      renderer.info.reset()
      renderer.clear()
      renderer.render(skyScene, skyCam)
      renderer.clearDepth()
      renderer.render(scene, cameraRig.camera)
    }

    const applyEffectiveQuality = (nextEffective: Exclude<OceanQuality, 'static'>) => {
      if (nextEffective === effectiveQuality) return
      effectiveQuality = nextEffective
      const nextProfile = QUALITY_PROFILES[nextEffective]
      scheduler.setQuality(nextEffective)
      ocean.rebuild(nextProfile.oceanSegments, nextProfile.detailLevel)
      particles.rebuild(nextProfile.particleCount)
      applyDprAndSize(canvas.clientWidth || 1280, canvas.clientHeight || 720)
    }

    const scheduler = new OceanRenderScheduler(
      renderFullFrame,
      () => cameraRig.isSettled(),
      (cpuCostMs, nowMs) => {
        const res = adaptive.recordCpuCost(cpuCostMs, nowMs)
        if (res.changed && res.effective !== 'static') {
          applyEffectiveQuality(res.effective)
          callbacks?.onEffectiveQualityChange?.(res.effective, res.reason)
        }
      }
    )
    scheduler.setQuality(effectiveQuality)

    const verifyFirstFrame = (): boolean => {
      if (!renderer || disposed) return false
      try {
        if (typeof window !== 'undefined' && window.__patmailOceanTestHooks?.forceShaderError) {
          throw new Error('forced-shader-compile-error')
        }
        const activeGl = renderer.getContext()
        if (!activeGl || activeGl.isContextLost()) {
          throw new Error('webgl-context-lost-during-first-frame')
        }
        scheduler.renderSingleFrame()
        if (activeGl.isContextLost()) {
          throw new Error('webgl-context-lost-after-first-frame')
        }
        return true
      } catch (err) {
        callbacks?.onFirstFrameError?.(err instanceof Error ? err.message : 'first-frame-failed')
        return false
      }
    }

    const handleContextLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      scheduler.stop()
      callbacks?.onContextLostChange?.(true)
    }

    const handleContextRestored = () => {
      contextLost = false
      callbacks?.onContextLostChange?.(false)
      if (!disposed) {
        if (verifyFirstFrame()) {
          callbacks?.onContextRestored?.()
          if (isActive) {
            scheduler.start()
          }
        }
      }
    }

    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    return {
      setQuality(nextQuality: Exclude<OceanQuality, 'static'>) {
        if (disposed) return
        adaptive.setPreferred(nextQuality)
        applyEffectiveQuality(nextQuality)
        callbacks?.onEffectiveQualityChange?.(nextQuality, null)
        if (isActive && !contextLost) {
          scheduler.renderSingleFrame()
        }
      },
      setPointer(nx: number, ny: number) {
        if (disposed) return
        cameraRig.setPointerTarget(nx, ny)
        scheduler.notifyPointerActivity()
      },
      setActive(active: boolean) {
        if (disposed) return
        isActive = active
        if (active && !contextLost) {
          scheduler.start()
        } else {
          scheduler.stop()
        }
      },
      invalidate(reason: RenderInvalidationReason) {
        if (disposed) return
        scheduler.invalidate(reason)
      },
      resize(width: number, height: number) {
        if (disposed) return
        applyDprAndSize(width, height)
        scheduler.invalidate('resize')
        if (isActive && !contextLost) {
          scheduler.renderSingleFrame()
        }
      },
      verifyFirstFrame,
      getDiagnostics(
        rendererState: OceanRendererState = contextLost ? 'context-lost' : 'ready',
        fallbackReason: string | null = adaptive.getReason()
      ): OceanEngineDiagnostics {
        const metrics = scheduler.getMetrics()
        return {
          preferredQuality: adaptive.getPreferred(),
          effectiveQuality,
          rendererState,
          fps: metrics.fps,
          p95FrameMs: metrics.p95FrameMs,
          cpuRenderCostMs: metrics.cpuRenderCostMs,
          drawCalls: renderer?.info.render.calls ?? 0,
          triangles: renderer?.info.render.triangles ?? 0,
          geometries: renderer?.info.memory.geometries ?? 0,
          textures: renderer?.info.memory.textures ?? 0,
          trackedResources: resources.count,
          rafCallbacks: metrics.rafCallbacks,
          renderedFrames: metrics.renderedFrames,
          activeRenderers: activeRendererCount,
          contextLost,
          fallbackReason: fallbackReason ?? adaptive.getReason()
        }
      },
      dispose() {
        if (disposed) return
        disposed = true
        isActive = false
        scheduler.stop()
        canvas.removeEventListener('webglcontextlost', handleContextLost)
        canvas.removeEventListener('webglcontextrestored', handleContextRestored)
        resources.disposeAll()
        renderer?.dispose()
        renderer = null
        if (rendererCounted) {
          activeRendererCount = Math.max(0, activeRendererCount - 1)
          rendererCounted = false
        }
      }
    }
  } catch (err) {
    resources.disposeAll()
    renderer?.dispose()
    if (rendererCounted) {
      activeRendererCount = Math.max(0, activeRendererCount - 1)
    }
    throw err
  }
}
