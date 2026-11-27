import { DirectionalLight, Group, HemisphereLight } from 'three'

/** 三点柔和粉紫冷暖光源（无实时阴影贴图开销） */
export function createOceanLighting(): Group {
  const group = new Group()

  const hemi = new HemisphereLight(0xfff0fa, 0x9980d8, 1.35)
  group.add(hemi)

  const keySun = new DirectionalLight(0xffe7f3, 1.55)
  keySun.position.set(-14, 16, 10)
  group.add(keySun)

  const glacierRim = new DirectionalLight(0xaad8ff, 0.95)
  glacierRim.position.set(16, 8, -14)
  group.add(glacierRim)

  return group
}
