import {
  BoxGeometry,
  ConeGeometry,
  Group,
  InstancedMesh,
  MeshPhysicalMaterial,
  Object3D,
  OctahedronGeometry
} from 'three'
import type { OceanResourceManager } from './resource-manager'

export interface CrystalIslandsHandle {
  group: Group
  update(elapsedSeconds: number): void
}

export function createCrystalIslands(resources: OceanResourceManager): CrystalIslandsHandle {
  const group = new Group()

  const crystalMat = resources.track(
    new MeshPhysicalMaterial({
      color: 0xe6c8ff,
      emissive: 0x9b6be8,
      emissiveIntensity: 0.18,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.85,
      transparent: true,
      opacity: 0.78
    })
  )

  const accentMat = resources.track(
    new MeshPhysicalMaterial({
      color: 0xffd2ec,
      emissive: 0xff7ab8,
      emissiveIntensity: 0.2,
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.82
    })
  )

  // 1. 远景水晶山脉集群（InstancedMesh 批处理，1 个 Draw Call）
  const spireGeo = resources.track(new ConeGeometry(1.15, 3.6, 5))
  const spireSpecs: Array<[number, number, number, number, number, number]> = [
    [-14.5, -0.5, -24.0, 2.2, 1.8, 0.12],
    [-12.2, -0.8, -22.5, 1.5, 1.3, -0.18],
    [-16.4, -0.9, -25.2, 1.4, 1.1, 0.24],
    [-7.6, -1.0, -28.0, 1.8, 1.4, -0.08],
    [17.5, -0.7, -25.0, 1.9, 1.6, -0.15],
    [15.2, -1.0, -23.4, 1.2, 1.0, 0.2],
    [-11.8, -1.1, -13.0, 0.9, 0.75, 0.14],
    [13.4, -1.1, -12.5, 0.85, 0.7, -0.12]
  ]
  const spires = resources.track(new InstancedMesh(spireGeo, crystalMat, spireSpecs.length))
  const dummy = new Object3D()
  spireSpecs.forEach(([x, y, z, sx, sy, rz], idx) => {
    dummy.position.set(x, y, z)
    dummy.scale.set(sx, sy, sx)
    dummy.rotation.set(0, idx * 0.7, rz)
    dummy.updateMatrix()
    spires.setMatrixAt(idx, dummy.matrix)
  })
  spires.instanceMatrix.needsUpdate = true
  group.add(spires)

  // 2. 中远景浮空晶体与悬浮文件片（各 1 个 InstancedMesh）
  const floatGeo = resources.track(new OctahedronGeometry(0.45, 0))
  const floatSpecs: Array<[number, number, number, number]> = [
    [-9.2, 2.2, -14.0, 1.15],
    [-4.8, 2.8, -19.5, 0.85],
    [2.6, 3.1, -21.0, 0.95],
    [14.2, 1.9, -15.5, 1.05],
    [-11.5, 0.9, -10.5, 0.7]
  ]
  const floatMesh = resources.track(new InstancedMesh(floatGeo, accentMat, floatSpecs.length))
  floatSpecs.forEach(([x, y, z, s], idx) => {
    dummy.position.set(x, y, z)
    dummy.scale.setScalar(s)
    dummy.rotation.set(0.2 * idx, 0.5 * idx, 0.1)
    dummy.updateMatrix()
    floatMesh.setMatrixAt(idx, dummy.matrix)
  })
  floatMesh.instanceMatrix.needsUpdate = true
  group.add(floatMesh)

  const docGeo = resources.track(new BoxGeometry(0.55, 0.72, 0.05))
  const docSpecs: Array<[number, number, number, number]> = [
    [4.4, 2.3, -12.5, -0.25],
    [6.1, 1.8, -13.8, 0.18],
    [-6.6, 1.7, -12.2, 0.22]
  ]
  const docMesh = resources.track(new InstancedMesh(docGeo, crystalMat, docSpecs.length))
  docSpecs.forEach(([x, y, z, rz], idx) => {
    dummy.position.set(x, y, z)
    dummy.scale.setScalar(1)
    dummy.rotation.set(0.1, idx * 0.6, rz)
    dummy.updateMatrix()
    docMesh.setMatrixAt(idx, dummy.matrix)
  })
  docMesh.instanceMatrix.needsUpdate = true
  group.add(docMesh)

  return {
    group,
    update(elapsedSeconds: number) {
      floatSpecs.forEach(([x, y, z, s], idx) => {
        dummy.position.set(x, y + Math.sin(elapsedSeconds * 0.9 + idx * 1.3) * 0.22, z)
        dummy.scale.setScalar(s)
        dummy.rotation.set(0.2 * idx, elapsedSeconds * 0.22 + idx, 0.12)
        dummy.updateMatrix()
        floatMesh.setMatrixAt(idx, dummy.matrix)
      })
      floatMesh.instanceMatrix.needsUpdate = true
    }
  }
}
