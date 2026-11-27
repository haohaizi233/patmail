import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Points,
  PointsMaterial
} from 'three'
import type { OceanResourceManager } from './resource-manager'

export interface OceanParticlesHandle {
  points: Points
  rebuild(count: number): void
  update(elapsedSeconds: number): void
}

function createSoftGlowTexture(resources: OceanResourceManager): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
  grad.addColorStop(0.45, 'rgba(255, 215, 244, 0.65)')
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 32, 32)
  const tex = new CanvasTexture(canvas)
  return resources.track(tex)
}

function buildParticleGeometry(count: number): BufferGeometry {
  const geo = new BufferGeometry()
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // 确定性伪随机分布，避免每次闪烁跳变
    const seed = (i + 1) * 12.9898
    const rx = Math.sin(seed * 1.3) * 0.5 + 0.5
    const ry = Math.sin(seed * 2.7 + 1.1) * 0.5 + 0.5
    const rz = Math.sin(seed * 4.1 + 2.3) * 0.5 + 0.5
    positions[i * 3] = (rx - 0.5) * 34
    positions[i * 3 + 1] = -0.4 + ry * 9.5
    positions[i * 3 + 2] = -4 - rz * 26
  }
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geo
}

export function createOceanParticles(
  resources: OceanResourceManager,
  initialCount: number
): OceanParticlesHandle {
  const sprite = createSoftGlowTexture(resources)
  const material = resources.track(
    new PointsMaterial({
      color: 0xfff0fa,
      size: 0.24,
      map: sprite ?? undefined,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: AdditiveBlending
    })
  )

  let currentCount = initialCount
  let geometry = resources.track(buildParticleGeometry(initialCount))
  const points = new Points(geometry, material)

  return {
    points,
    rebuild(count: number) {
      if (count === currentCount) return
      currentCount = count
      const next = buildParticleGeometry(count)
      points.geometry = next
      geometry = resources.replace(geometry, next)
    },
    update(elapsedSeconds: number) {
      points.position.y = Math.sin(elapsedSeconds * 0.55) * 0.18
      points.rotation.y = Math.sin(elapsedSeconds * 0.15) * 0.04
    }
  }
}
