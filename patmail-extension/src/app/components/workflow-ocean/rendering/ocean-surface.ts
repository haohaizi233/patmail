import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import oceanVert from './shaders/ocean.vert.glsl?raw'
import oceanFrag from './shaders/ocean.frag.glsl?raw'
import type { OceanResourceManager } from './resource-manager'

export interface OceanSurfaceHandle {
  mesh: Mesh
  rebuild(segments: number, detailLevel: number): void
  update(elapsedSeconds: number, waveScale?: number): void
}

export function createOceanSurface(
  resources: OceanResourceManager,
  initialSegments: number,
  initialDetailLevel: number
): OceanSurfaceHandle {
  const material = resources.track(
    new ShaderMaterial({
      vertexShader: oceanVert,
      fragmentShader: oceanFrag,
      transparent: true,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWaveScale: { value: 1.0 },
        uSunDir: { value: new Vector3(-0.65, 0.52, -0.45) },
        uFogColor: { value: new Color(0xf4ddf9) },
        uDetailLevel: { value: initialDetailLevel }
      }
    })
  )

  let currentSegments = initialSegments
  let geometry = resources.track(new PlaneGeometry(120, 74, initialSegments, initialSegments))
  geometry.rotateX(-Math.PI / 2)

  const mesh = new Mesh(geometry, material)
  mesh.position.set(0, -1.35, -18)
  mesh.frustumCulled = true

  return {
    mesh,
    rebuild(segments: number, detailLevel: number) {
      material.uniforms.uDetailLevel.value = detailLevel
      if (segments === currentSegments) return
      currentSegments = segments
      const next = new PlaneGeometry(120, 74, segments, segments)
      next.rotateX(-Math.PI / 2)
      mesh.geometry = next
      geometry = resources.replace(geometry, next)
    },
    update(elapsedSeconds: number, waveScale = 1.0) {
      material.uniforms.uTime.value = elapsedSeconds
      material.uniforms.uWaveScale.value = waveScale
    }
  }
}
