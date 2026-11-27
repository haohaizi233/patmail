import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry
} from 'three'
import type { WorkflowOceanIconId } from '../workflow-ocean.types'
import type { OceanResourceManager } from './resource-manager'

export interface OceanModelDescriptor {
  id: WorkflowOceanIconId
  label: string
  color: number
  emissive: number
}

export const OCEAN_MODEL_CATALOG: Record<WorkflowOceanIconId, OceanModelDescriptor> = {
  'pct-bell': { id: 'pct-bell', label: '水晶铃铛', color: 0xffb3d6, emissive: 0xff4f93 },
  'pct-layers': { id: 'pct-layers', label: '层叠文件与邮件', color: 0xd1bfff, emissive: 0x8661eb },
  'file-folder': { id: 'file-folder', label: '立体文件夹', color: 0xffcfb3, emissive: 0xf27d42 },
  'filing-export': { id: 'filing-export', label: '文档与导出箭头', color: 0xb3dcff, emissive: 0x3b8ce2 },
  'hague-globe': { id: 'hague-globe', label: '水晶地球', color: 0xd5bfff, emissive: 0x7c4dff },
  'jihua-flask': { id: 'jihua-flask', label: '透明实验瓶', color: 0xdfbaff, emissive: 0x9952e8 },
  'billing-coins': { id: 'billing-coins', label: '金币与账单', color: 0xffe4a3, emissive: 0xd68c1a },
  'pct-cloud': { id: 'pct-cloud', label: '双向同步云朵', color: 0xbde8ff, emissive: 0x2d92d6 },
  'fee-shield': { id: 'fee-shield', label: '费用保护盾牌', color: 0xffbcd9, emissive: 0xe6458a },
  'ocean-add': { id: 'ocean-add', label: '发光知识立方体', color: 0xe6c8ff, emissive: 0x9c55e8 },
  'custom-crystal': { id: 'custom-crystal', label: '自定义知识水晶', color: 0xe8ccff, emissive: 0x8c52e0 }
}

/**
 * 统一的本地程序化 3D 水晶模型工厂（共享材质模板，所有 Geometry/Material 均登记到 ResourceManager）。
 */
export function buildOceanCrystalModel(
  id: WorkflowOceanIconId,
  resources: OceanResourceManager
): Group {
  const desc = OCEAN_MODEL_CATALOG[id] ?? OCEAN_MODEL_CATALOG['custom-crystal']
  const mat = resources.track(
    new MeshPhysicalMaterial({
      color: desc.color,
      emissive: desc.emissive,
      emissiveIntensity: 0.24,
      roughness: 0.18,
      metalness: 0.08,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.9
    })
  )
  const accentMat = resources.track(
    new MeshStandardMaterial({
      color: 0xffffff,
      emissive: desc.emissive,
      emissiveIntensity: 0.45,
      roughness: 0.2
    })
  )

  const group = new Group()
  switch (id) {
    case 'pct-bell': {
      const dome = new Mesh(resources.track(new ConeGeometry(0.42, 0.72, 14)), mat)
      const clapper = new Mesh(resources.track(new SphereGeometry(0.14, 10, 10)), accentMat)
      clapper.position.y = -0.38
      group.add(dome, clapper)
      break
    }
    case 'pct-layers': {
      const back = new Mesh(resources.track(new BoxGeometry(0.65, 0.82, 0.08)), mat)
      back.position.set(-0.08, 0.06, -0.1)
      const front = new Mesh(resources.track(new BoxGeometry(0.65, 0.82, 0.08)), accentMat)
      front.position.set(0.08, -0.04, 0.08)
      group.add(back, front)
      break
    }
    case 'file-folder': {
      const body = new Mesh(resources.track(new BoxGeometry(0.86, 0.62, 0.22)), mat)
      const tab = new Mesh(resources.track(new BoxGeometry(0.34, 0.14, 0.22)), accentMat)
      tab.position.set(-0.24, 0.34, 0)
      group.add(body, tab)
      break
    }
    case 'filing-export': {
      const doc = new Mesh(resources.track(new BoxGeometry(0.62, 0.82, 0.09)), mat)
      const arrow = new Mesh(resources.track(new ConeGeometry(0.2, 0.36, 6)), accentMat)
      arrow.position.set(0.26, 0.18, 0.16)
      group.add(doc, arrow)
      break
    }
    case 'hague-globe': {
      const sphere = new Mesh(resources.track(new SphereGeometry(0.42, 18, 14)), mat)
      const ring = new Mesh(resources.track(new TorusGeometry(0.58, 0.04, 8, 36)), accentMat)
      ring.rotation.set(1.1, 0.4, 0)
      group.add(sphere, ring)
      break
    }
    case 'jihua-flask': {
      const base = new Mesh(resources.track(new ConeGeometry(0.44, 0.64, 14)), mat)
      const neck = new Mesh(resources.track(new CylinderGeometry(0.14, 0.16, 0.32, 12)), accentMat)
      neck.position.y = 0.42
      group.add(base, neck)
      break
    }
    case 'billing-coins': {
      const bill = new Mesh(resources.track(new BoxGeometry(0.58, 0.78, 0.08)), mat)
      const coin = new Mesh(resources.track(new CylinderGeometry(0.24, 0.24, 0.1, 18)), accentMat)
      coin.rotation.x = Math.PI / 2
      coin.position.set(0.24, -0.18, 0.12)
      group.add(bill, coin)
      break
    }
    case 'pct-cloud': {
      const left = new Mesh(resources.track(new SphereGeometry(0.26, 12, 10)), mat)
      left.position.set(-0.22, -0.04, 0)
      const center = new Mesh(resources.track(new SphereGeometry(0.34, 14, 12)), mat)
      center.position.set(0.04, 0.08, 0)
      const right = new Mesh(resources.track(new SphereGeometry(0.24, 12, 10)), accentMat)
      right.position.set(0.3, -0.06, 0)
      group.add(left, center, right)
      break
    }
    case 'fee-shield': {
      const shield = new Mesh(resources.track(new OctahedronGeometry(0.46, 0)), mat)
      shield.scale.set(0.95, 1.15, 0.45)
      const core = new Mesh(resources.track(new BoxGeometry(0.24, 0.24, 0.24)), accentMat)
      core.position.z = 0.14
      group.add(shield, core)
      break
    }
    default: {
      const crystal = new Mesh(resources.track(new OctahedronGeometry(0.46, 0)), mat)
      const halo = new Mesh(resources.track(new TorusGeometry(0.56, 0.03, 8, 32)), accentMat)
      halo.rotation.x = Math.PI / 2.4
      group.add(crystal, halo)
      break
    }
  }
  return group
}
