import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3
} from 'three'
import hologramFrag from './shaders/hologram.frag.glsl?raw'
import type { OceanResourceManager } from './resource-manager'

const HOLOGRAM_VERT = `
varying vec3 vNormalDir;
varying vec3 vViewDir;
varying vec2 vLocalUv;

void main() {
  vLocalUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalDir = normalize(mat3(modelMatrix) * normal);
  vViewDir = cameraPosition - worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

export interface KnowledgePlanetHandle {
  group: Group
  update(dtSeconds: number, elapsedSeconds: number): void
}

export function createKnowledgePlanet(resources: OceanResourceManager): KnowledgePlanetHandle {
  const group = new Group()
  group.position.set(9.8, 3.9, -15.5)

  // 1. 半透明水晶全息球体
  const shellGeo = resources.track(new SphereGeometry(3.05, 32, 24))
  const shellMat = resources.track(
    new ShaderMaterial({
      vertexShader: HOLOGRAM_VERT,
      fragmentShader: hologramFrag,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uCoreColor: { value: new Color(0xcba8ff) },
        uRimColor: { value: new Color(0xa8e2ff) },
        uOpacity: { value: 0.72 }
      }
    })
  )
  group.add(new Mesh(shellGeo, shellMat))

  // 2. 低密度球面知识网络（单一 LineSegments 批处理 + InstancedMesh 节点）
  const netGeo = resources.track(new IcosahedronGeometry(3.12, 1))
  const posAttr = netGeo.getAttribute('position')
  const uniqueVerts: Vector3[] = []
  for (let i = 0; i < posAttr.count; i++) {
    const v = new Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i))
    if (!uniqueVerts.some(u => u.distanceToSquared(v) < 0.0001)) {
      uniqueVerts.push(v)
    }
  }

  const linePositions: number[] = []
  for (let i = 0; i < uniqueVerts.length; i++) {
    for (let j = i + 1; j < uniqueVerts.length; j++) {
      if (uniqueVerts[i].distanceTo(uniqueVerts[j]) < 2.25) {
        linePositions.push(
          uniqueVerts[i].x,
          uniqueVerts[i].y,
          uniqueVerts[i].z,
          uniqueVerts[j].x,
          uniqueVerts[j].y,
          uniqueVerts[j].z
        )
      }
    }
  }
  const linesGeo = resources.track(new BufferGeometry())
  linesGeo.setAttribute('position', new Float32BufferAttribute(linePositions, 3))
  const linesMat = resources.track(
    new LineBasicMaterial({ color: 0xe9d4ff, transparent: true, opacity: 0.55 })
  )
  group.add(new LineSegments(linesGeo, linesMat))

  const nodeGeo = resources.track(new SphereGeometry(0.085, 8, 8))
  const nodeMat = resources.track(
    new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff8ed4,
      emissiveIntensity: 0.9,
      roughness: 0.25
    })
  )
  const nodesMesh = new InstancedMesh(nodeGeo, nodeMat, uniqueVerts.length)
  const dummy = new Object3D()
  uniqueVerts.forEach((v, idx) => {
    dummy.position.copy(v)
    dummy.scale.setScalar(1)
    dummy.updateMatrix()
    nodesMesh.setMatrixAt(idx, dummy.matrix)
  })
  nodesMesh.instanceMatrix.needsUpdate = true
  group.add(nodesMesh)

  // 3. 三条环绕光轨
  const ringMatA = resources.track(
    new MeshStandardMaterial({
      color: 0xffd7f0,
      emissive: 0xff85c8,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85
    })
  )
  const ringMatB = resources.track(
    new MeshStandardMaterial({
      color: 0xcbe8ff,
      emissive: 0x87cbff,
      emissiveIntensity: 0.42,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.78
    })
  )

  const ring1 = new Mesh(resources.track(new TorusGeometry(4.35, 0.045, 10, 72)), ringMatA)
  ring1.rotation.set(1.18, 0.35, 0.15)
  group.add(ring1)

  const ring2 = new Mesh(resources.track(new TorusGeometry(4.95, 0.032, 8, 72)), ringMatB)
  ring2.rotation.set(1.42, -0.45, -0.22)
  group.add(ring2)

  const ring3 = new Mesh(resources.track(new TorusGeometry(3.75, 0.025, 8, 64)), ringMatA)
  ring3.rotation.set(0.62, 0.82, 0.4)
  group.add(ring3)

  // 4. 中央悬浮专利证书模型（淡粉水晶板 + 金色印章）
  const certGroup = new Group()
  const certGeo = resources.track(new BoxGeometry(1.45, 1.9, 0.12))
  const certMat = resources.track(
    new MeshPhysicalMaterial({
      color: 0xfff5fb,
      emissive: 0xffa6d8,
      emissiveIntensity: 0.22,
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.92
    })
  )
  certGroup.add(new Mesh(certGeo, certMat))

  const sealGeo = resources.track(new SphereGeometry(0.24, 16, 12))
  const sealMat = resources.track(
    new MeshStandardMaterial({
      color: 0xffd27d,
      emissive: 0xffae42,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.45
    })
  )
  const seal = new Mesh(sealGeo, sealMat)
  seal.position.set(0.36, -0.52, 0.09)
  seal.scale.set(1, 1, 0.4)
  certGroup.add(seal)

  certGroup.rotation.set(0.08, -0.24, 0.05)
  group.add(certGroup)

  return {
    group,
    update(dtSeconds: number, elapsedSeconds: number) {
      shellMat.uniforms.uTime.value = elapsedSeconds
      group.rotation.y += dtSeconds * 0.075
      ring1.rotation.z += dtSeconds * 0.12
      ring2.rotation.z -= dtSeconds * 0.09
      certGroup.position.y = Math.sin(elapsedSeconds * 1.1) * 0.14
      certGroup.rotation.y = -0.24 + Math.sin(elapsedSeconds * 0.65) * 0.12
    }
  }
}
