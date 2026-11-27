import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2
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
  'ocean-add': { id: 'ocean-add', label: '发光知识晶体', color: 0xe6c8ff, emissive: 0x9c55e8 },
  'custom-crystal': { id: 'custom-crystal', label: '自定义知识水晶', color: 0xe8ccff, emissive: 0x8c52e0 }
}

function createRoundedRectShape(w: number, h: number, r: number): Shape {
  const s = new Shape()
  const hw = w / 2
  const hh = h / 2
  s.moveTo(-hw + r, -hh)
  s.lineTo(hw - r, -hh)
  s.quadraticCurveTo(hw, -hh, hw, -hh + r)
  s.lineTo(hw, hh - r)
  s.quadraticCurveTo(hw, hh, hw - r, hh)
  s.lineTo(-hw + r, hh)
  s.quadraticCurveTo(-hw, hh, -hw, hh - r)
  s.lineTo(-hw, -hh + r)
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return s
}

function createShieldShape(): Shape {
  const s = new Shape()
  s.moveTo(0, 0.56)
  s.bezierCurveTo(0.28, 0.54, 0.44, 0.44, 0.46, 0.34)
  s.bezierCurveTo(0.46, -0.08, 0.30, -0.36, 0, -0.56)
  s.bezierCurveTo(-0.30, -0.36, -0.46, -0.08, -0.46, 0.34)
  s.bezierCurveTo(-0.44, 0.44, -0.28, 0.54, 0, 0.56)
  return s
}

/**
 * 统一的本地程序化 3D 水晶模型工厂（Lathe/Extrude 精细轮廓，所有 Geometry/Material 均登记到 ResourceManager）。
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
      emissiveIntensity: 0.22,
      roughness: 0.14,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.9
    })
  )
  const accentMat = resources.track(
    new MeshStandardMaterial({
      color: 0xffffff,
      emissive: desc.emissive,
      emissiveIntensity: 0.42,
      roughness: 0.18,
      metalness: 0.15
    })
  )

  const group = new Group()
  switch (id) {
    case 'pct-bell': {
      const profile = [
        new Vector2(0.01, 0.48),
        new Vector2(0.14, 0.44),
        new Vector2(0.26, 0.28),
        new Vector2(0.32, 0.04),
        new Vector2(0.42, -0.24),
        new Vector2(0.48, -0.32),
        new Vector2(0.42, -0.34)
      ]
      const bell = new Mesh(resources.track(new LatheGeometry(profile, 28)), mat)
      const crown = new Mesh(resources.track(new SphereGeometry(0.1, 14, 12)), accentMat)
      crown.position.y = 0.50
      const clapper = new Mesh(resources.track(new SphereGeometry(0.13, 14, 12)), accentMat)
      clapper.position.y = -0.40
      group.add(bell, crown, clapper)
      break
    }
    case 'pct-layers': {
      const sheetShape = createRoundedRectShape(0.64, 0.80, 0.09)
      const sheetGeo = resources.track(
        new ExtrudeGeometry(sheetShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 })
      )
      const back = new Mesh(sheetGeo, mat)
      back.position.set(-0.14, 0.10, -0.14)
      back.rotation.set(0.08, 0.12, 0.06)
      const mid = new Mesh(sheetGeo, mat)
      mid.position.set(0.0, 0.0, 0.0)
      const front = new Mesh(sheetGeo, accentMat)
      front.position.set(0.14, -0.10, 0.14)
      front.rotation.set(-0.06, -0.1, -0.04)
      group.add(back, mid, front)
      break
    }
    case 'file-folder': {
      const bodyGeo = resources.track(
        new ExtrudeGeometry(createRoundedRectShape(0.88, 0.60, 0.09), {
          depth: 0.16,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.03,
          bevelSegments: 3
        })
      )
      const tabGeo = resources.track(
        new ExtrudeGeometry(createRoundedRectShape(0.36, 0.18, 0.05), {
          depth: 0.10,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.02,
          bevelSegments: 2
        })
      )
      const back = new Mesh(bodyGeo, mat)
      back.position.set(0, -0.04, -0.10)
      const tab = new Mesh(tabGeo, accentMat)
      tab.position.set(-0.24, 0.30, -0.07)
      const doc = new Mesh(resources.track(new BoxGeometry(0.66, 0.44, 0.04)), accentMat)
      doc.position.set(0.03, 0.14, 0.03)
      doc.rotation.z = -0.05
      const front = new Mesh(bodyGeo, mat)
      front.position.set(0, -0.08, 0.08)
      front.rotation.x = 0.14
      group.add(back, tab, doc, front)
      break
    }
    case 'filing-export': {
      const docGeo = resources.track(
        new ExtrudeGeometry(createRoundedRectShape(0.62, 0.82, 0.08), {
          depth: 0.07,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.02,
          bevelSegments: 3
        })
      )
      const doc = new Mesh(docGeo, mat)
      const stem = new Mesh(resources.track(new CylinderGeometry(0.06, 0.06, 0.34, 12)), accentMat)
      stem.position.set(0.26, 0.10, 0.16)
      stem.rotation.z = -0.55
      const head = new Mesh(resources.track(new ConeGeometry(0.16, 0.28, 16)), accentMat)
      head.position.set(0.38, 0.24, 0.16)
      head.rotation.z = -0.55
      group.add(doc, stem, head)
      break
    }
    case 'hague-globe': {
      const sphere = new Mesh(resources.track(new SphereGeometry(0.40, 28, 22)), mat)
      const ringA = new Mesh(resources.track(new TorusGeometry(0.56, 0.032, 12, 48)), accentMat)
      ringA.rotation.set(1.12, 0.42, 0)
      const ringB = new Mesh(resources.track(new TorusGeometry(0.48, 0.022, 10, 44)), mat)
      ringB.rotation.set(-0.7, 0.85, 0.3)
      group.add(sphere, ringA, ringB)
      break
    }
    case 'jihua-flask': {
      const flaskProfile = [
        new Vector2(0.01, -0.44),
        new Vector2(0.38, -0.44),
        new Vector2(0.44, -0.34),
        new Vector2(0.36, -0.06),
        new Vector2(0.14, 0.22),
        new Vector2(0.13, 0.46),
        new Vector2(0.18, 0.50)
      ]
      const flask = new Mesh(resources.track(new LatheGeometry(flaskProfile, 28)), mat)
      const liquid = new Mesh(resources.track(new CylinderGeometry(0.24, 0.35, 0.24, 24)), accentMat)
      liquid.position.y = -0.26
      group.add(flask, liquid)
      break
    }
    case 'billing-coins': {
      const billGeo = resources.track(
        new ExtrudeGeometry(createRoundedRectShape(0.56, 0.76, 0.07), {
          depth: 0.06,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.02,
          bevelSegments: 2
        })
      )
      const bill = new Mesh(billGeo, mat)
      bill.position.set(-0.10, 0.04, -0.06)
      const coinGeo = resources.track(new CylinderGeometry(0.22, 0.22, 0.07, 24))
      const rimGeo = resources.track(new TorusGeometry(0.22, 0.022, 10, 28))
      for (let i = 0; i < 3; i++) {
        const coin = new Mesh(coinGeo, accentMat)
        coin.rotation.set(Math.PI / 2 - 0.25, 0, 0)
        coin.position.set(0.22 + i * 0.02, -0.24 + i * 0.12, 0.10 + i * 0.05)
        const rim = new Mesh(rimGeo, mat)
        rim.rotation.set(-0.25, 0, 0)
        rim.position.copy(coin.position)
        group.add(coin, rim)
      }
      group.add(bill)
      break
    }
    case 'pct-cloud': {
      const left = new Mesh(resources.track(new SphereGeometry(0.26, 20, 16)), mat)
      left.position.set(-0.24, -0.04, 0)
      const center = new Mesh(resources.track(new SphereGeometry(0.35, 22, 18)), mat)
      center.position.set(0.02, 0.10, 0.02)
      const right = new Mesh(resources.track(new SphereGeometry(0.24, 20, 16)), mat)
      right.position.set(0.30, -0.06, 0)
      const syncRing = new Mesh(resources.track(new TorusGeometry(0.38, 0.026, 10, 40)), accentMat)
      syncRing.rotation.set(1.2, 0.35, 0)
      syncRing.position.set(0.02, -0.10, 0.12)
      group.add(left, center, right, syncRing)
      break
    }
    case 'fee-shield': {
      const shieldGeo = resources.track(
        new ExtrudeGeometry(createShieldShape(), {
          depth: 0.12,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.03,
          bevelSegments: 3
        })
      )
      const shield = new Mesh(shieldGeo, mat)
      shield.position.z = -0.06
      const emblem = new Mesh(resources.track(new TorusGeometry(0.16, 0.035, 10, 28)), accentMat)
      emblem.position.set(0, 0.04, 0.12)
      const bar = new Mesh(resources.track(new BoxGeometry(0.06, 0.24, 0.04)), accentMat)
      bar.position.set(0, 0.04, 0.13)
      group.add(shield, emblem, bar)
      break
    }
    default: {
      const crystal = new Mesh(resources.track(new OctahedronGeometry(0.42, 0)), mat)
      crystal.scale.set(0.85, 1.18, 0.85)
      const haloA = new Mesh(resources.track(new TorusGeometry(0.54, 0.028, 10, 40)), accentMat)
      haloA.rotation.set(Math.PI / 2.5, 0.2, 0)
      const haloB = new Mesh(resources.track(new TorusGeometry(0.46, 0.02, 8, 36)), mat)
      haloB.rotation.set(-Math.PI / 3.2, 0.5, 0.3)
      group.add(crystal, haloA, haloB)
      break
    }
  }
  return group
}
