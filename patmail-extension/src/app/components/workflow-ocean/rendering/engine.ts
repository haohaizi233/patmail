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
import { OceanCameraRig } from './camera'
import { createCrystalIslands } from './crystal-islands'
import { createKnowledgePlanet } from './knowledge-planet'
import { createOceanLighting } from './lighting'
import { createOceanSurface } from './ocean-surface'
import { createOceanParticles } from './particles'
import { OceanRenderScheduler, QUALITY_PROFILES, type OceanQuality } from './render-scheduler'
import { OceanResourceManager } from './resource-manager'

const SKY_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`

export interface OceanEngineDiagnostics {
  quality: OceanQuality
  fps: number
  p95FrameMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  trackedResources: number
  contextLost: boolean
}

export interface OceanEngineHandle {
  setQuality(quality: Exclude<OceanQuality, 'static'>): void
  setPointer(nx: number, ny: number): void
  setActive(active: boolean): void
  resize(width: number, height: number): void
  getDiagnostics(): OceanEngineDiagnostics
  dispose(): void
}

export function createOceanEngine(
  canvas: HTMLCanvasElement,
  initialQuality: Exclude<OceanQuality, 'static'> = 'balanced',
  onContextLostChange?: (lost: boolean) => void
): OceanEngineHandle {
  let currentQuality: Exclude<OceanQuality, 'static'> = initialQuality
  let isActive = false
  let contextLost = false
  let disposed = false

  const renderer = new WebGLRenderer({
    canvas,
    alpha: false,
    antialias: initialQuality !== 'eco',
    powerPreference: 'high-performance'
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(new Color(0xf4ddf9), 1)
  renderer.autoClear = false

  const resources = new OceanResourceManager()

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

  const profile = QUALITY_PROFILES[currentQuality]
  const ocean = createOceanSurface(resources, profile.oceanSegments, profile.detailLevel)
  scene.add(ocean.mesh)

  const planet = createKnowledgePlanet(resources)
  scene.add(planet.group)

  const islands = createCrystalIslands(resources)
  scene.add(islands.group)

  const particles = createOceanParticles(resources, profile.particleCount)
  scene.add(particles.points)

  const applyDprAndSize = (width: number, height: number) => {
    const cap = QUALITY_PROFILES[currentQuality].dprCap
    const dpr = Math.min(cap, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    renderer.setPixelRatio(dpr)
    renderer.setSize(Math.max(1, width), Math.max(1, height), false)
    cameraRig.resize(width, height)
  }

  applyDprAndSize(canvas.clientWidth || 1280, canvas.clientHeight || 720)

  const scheduler = new OceanRenderScheduler((dtSeconds, elapsedSeconds) => {
    if (disposed || contextLost) return
    const activeProfile = QUALITY_PROFILES[currentQuality]
    cameraRig.update(dtSeconds)
    const timeVal = activeProfile.animateEnvironment ? elapsedSeconds : 0
    ocean.update(timeVal, activeProfile.animateEnvironment ? 1.0 : 0.35)
    if (activeProfile.animateEnvironment) {
      planet.update(dtSeconds, elapsedSeconds)
      islands.update(elapsedSeconds)
      particles.update(elapsedSeconds)
    }
    renderer.clear()
    renderer.render(skyScene, skyCam)
    renderer.clearDepth()
    renderer.render(scene, cameraRig.camera)
  })
  scheduler.setQuality(currentQuality)

  const handleContextLost = (event: Event) => {
    event.preventDefault()
    contextLost = true
    scheduler.stop()
    onContextLostChange?.(true)
  }

  const handleContextRestored = () => {
    contextLost = false
    onContextLostChange?.(false)
    if (isActive && !disposed) {
      scheduler.start()
    }
  }

  canvas.addEventListener('webglcontextlost', handleContextLost)
  canvas.addEventListener('webglcontextrestored', handleContextRestored)

  return {
    setQuality(nextQuality: Exclude<OceanQuality, 'static'>) {
      if (disposed || nextQuality === currentQuality) return
      currentQuality = nextQuality
      const nextProfile = QUALITY_PROFILES[nextQuality]
      scheduler.setQuality(nextQuality)
      ocean.rebuild(nextProfile.oceanSegments, nextProfile.detailLevel)
      particles.rebuild(nextProfile.particleCount)
      applyDprAndSize(canvas.clientWidth || 1280, canvas.clientHeight || 720)
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
    resize(width: number, height: number) {
      if (disposed) return
      applyDprAndSize(width, height)
      if (isActive && !contextLost) {
        scheduler.renderSingleFrame()
      }
    },
    getDiagnostics(): OceanEngineDiagnostics {
      const metrics = scheduler.getMetrics()
      return {
        quality: currentQuality,
        fps: metrics.fps,
        p95FrameMs: metrics.p95FrameMs,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        trackedResources: resources.count,
        contextLost
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
      renderer.dispose()
    }
  }
}
