import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const outDir = path.join(rootDir, 'public', 'assets', 'workflow-ocean')
const threeBuildDir = path.join(rootDir, 'node_modules', 'three', 'build')

const ICONS = [
  { id: 'pct-bell', color: 0xffb3d6, emissive: 0xff4f93 },
  { id: 'pct-layers', color: 0xd1bfff, emissive: 0x8661eb },
  { id: 'file-folder', color: 0xffcfb3, emissive: 0xf27d42 },
  { id: 'filing-export', color: 0xb3dcff, emissive: 0x3b8ce2 },
  { id: 'hague-globe', color: 0xd5bfff, emissive: 0x7c4dff },
  { id: 'jihua-flask', color: 0xdfbaff, emissive: 0x9952e8 },
  { id: 'billing-coins', color: 0xffe4a3, emissive: 0xd68c1a },
  { id: 'pct-cloud', color: 0xbde8ff, emissive: 0x2d92d6 },
  { id: 'fee-shield', color: 0xffbcd9, emissive: 0xe6458a },
  { id: 'ocean-add', color: 0xe6c8ff, emissive: 0x9c55e8 },
  { id: 'custom-crystal', color: 0xe8ccff, emissive: 0x8c52e0 }
]

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chromium',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
})

try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } })
  const { readFile } = await import('node:fs/promises')
  await page.route('https://three.local/**', async (route) => {
    const reqUrl = new URL(route.request().url())
    if (reqUrl.pathname === '/index.html') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html><body style="margin:0;background:transparent;"><canvas id="c" width="256" height="256"></canvas></body></html>'
      })
      return
    }
    const filePath = path.join(threeBuildDir, path.basename(reqUrl.pathname))
    const code = await readFile(filePath, 'utf8')
    await route.fulfill({ contentType: 'application/javascript', body: code })
  })
  await page.goto('https://three.local/index.html')

  const manifestEntries = []

  for (const spec of ICONS) {
    const dataUrl = await page.evaluate(async ({ icon }) => {
      const THREE = await import('https://three.local/three.module.js')

      const canvas = globalThis.document.getElementById('c')
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
      renderer.setSize(256, 256, false)
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20)
      camera.position.set(0.35, 0.35, 2.35)
      camera.lookAt(0, 0, 0)

      // 统一摄影棚三点布光：左上粉暖主光 + 右侧冰蓝轮廓补光 + 柔和环境光
      scene.add(new THREE.AmbientLight(0xfff4fc, 1.35))
      const key = new THREE.DirectionalLight(0xffd4eb, 2.2)
      key.position.set(-2.5, 3.2, 2.8)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0xa8d8ff, 1.4)
      rim.position.set(2.8, 1.2, -1.8)
      scene.add(rim)

      const mat = new THREE.MeshPhysicalMaterial({
        color: icon.color,
        emissive: icon.emissive,
        emissiveIntensity: 0.22,
        roughness: 0.14,
        metalness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: 0.92
      })
      const accentMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: icon.emissive,
        emissiveIntensity: 0.42,
        roughness: 0.18,
        metalness: 0.15
      })

      const rounded = (w, h, r) => {
        const s = new THREE.Shape()
        const hw = w / 2, hh = h / 2
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

      const g = new THREE.Group()
      switch (icon.id) {
        case 'pct-bell': {
          const pts = [
            new THREE.Vector2(0.01, 0.48), new THREE.Vector2(0.14, 0.44),
            new THREE.Vector2(0.26, 0.28), new THREE.Vector2(0.32, 0.04),
            new THREE.Vector2(0.42, -0.24), new THREE.Vector2(0.48, -0.32),
            new THREE.Vector2(0.42, -0.34)
          ]
          g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat))
          const crown = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 14), accentMat)
          crown.position.y = 0.50
          const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), accentMat)
          clapper.position.y = -0.40
          g.add(crown, clapper)
          break
        }
        case 'pct-layers': {
          const geo = new THREE.ExtrudeGeometry(rounded(0.64, 0.80, 0.09), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 })
          const back = new THREE.Mesh(geo, mat); back.position.set(-0.14, 0.10, -0.14); back.rotation.set(0.08, 0.12, 0.06)
          const mid = new THREE.Mesh(geo, mat)
          const front = new THREE.Mesh(geo, accentMat); front.position.set(0.14, -0.10, 0.14); front.rotation.set(-0.06, -0.1, -0.04)
          g.add(back, mid, front)
          break
        }
        case 'file-folder': {
          const bGeo = new THREE.ExtrudeGeometry(rounded(0.88, 0.60, 0.09), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3 })
          const tGeo = new THREE.ExtrudeGeometry(rounded(0.36, 0.18, 0.05), { depth: 0.10, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 })
          const back = new THREE.Mesh(bGeo, mat); back.position.set(0, -0.04, -0.10)
          const tab = new THREE.Mesh(tGeo, accentMat); tab.position.set(-0.24, 0.30, -0.07)
          const doc = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.44, 0.04), accentMat); doc.position.set(0.03, 0.14, 0.03); doc.rotation.z = -0.05
          const front = new THREE.Mesh(bGeo, mat); front.position.set(0, -0.08, 0.08); front.rotation.x = 0.14
          g.add(back, tab, doc, front)
          break
        }
        case 'filing-export': {
          const dGeo = new THREE.ExtrudeGeometry(rounded(0.62, 0.82, 0.08), { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 })
          g.add(new THREE.Mesh(dGeo, mat))
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 14), accentMat)
          stem.position.set(0.26, 0.10, 0.16); stem.rotation.z = -0.55
          const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 18), accentMat)
          head.position.set(0.38, 0.24, 0.16); head.rotation.z = -0.55
          g.add(stem, head)
          break
        }
        case 'hague-globe': {
          g.add(new THREE.Mesh(new THREE.SphereGeometry(0.40, 32, 24), mat))
          const rA = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.032, 12, 48), accentMat); rA.rotation.set(1.12, 0.42, 0)
          const rB = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.022, 10, 44), mat); rB.rotation.set(-0.7, 0.85, 0.3)
          g.add(rA, rB)
          break
        }
        case 'jihua-flask': {
          const pts = [
            new THREE.Vector2(0.01, -0.44), new THREE.Vector2(0.38, -0.44),
            new THREE.Vector2(0.44, -0.34), new THREE.Vector2(0.36, -0.06),
            new THREE.Vector2(0.14, 0.22), new THREE.Vector2(0.13, 0.46),
            new THREE.Vector2(0.18, 0.50)
          ]
          g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), mat))
          const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.35, 0.24, 24), accentMat); liq.position.y = -0.26
          g.add(liq)
          break
        }
        case 'billing-coins': {
          const bGeo = new THREE.ExtrudeGeometry(rounded(0.56, 0.76, 0.07), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 })
          const bill = new THREE.Mesh(bGeo, mat); bill.position.set(-0.10, 0.04, -0.06)
          const cGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 28)
          const rGeo = new THREE.TorusGeometry(0.22, 0.022, 10, 28)
          for (let i = 0; i < 3; i++) {
            const c = new THREE.Mesh(cGeo, accentMat); c.rotation.set(Math.PI / 2 - 0.25, 0, 0); c.position.set(0.22 + i * 0.02, -0.24 + i * 0.12, 0.10 + i * 0.05)
            const r = new THREE.Mesh(rGeo, mat); r.rotation.set(-0.25, 0, 0); r.position.copy(c.position)
            g.add(c, r)
          }
          g.add(bill)
          break
        }
        case 'pct-cloud': {
          const l = new THREE.Mesh(new THREE.SphereGeometry(0.26, 22, 18), mat); l.position.set(-0.24, -0.04, 0)
          const c = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 20), mat); c.position.set(0.02, 0.10, 0.02)
          const r = new THREE.Mesh(new THREE.SphereGeometry(0.24, 22, 18), mat); r.position.set(0.30, -0.06, 0)
          const sr = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.026, 10, 40), accentMat); sr.rotation.set(1.2, 0.35, 0); sr.position.set(0.02, -0.10, 0.12)
          g.add(l, c, r, sr)
          break
        }
        case 'fee-shield': {
          const s = new THREE.Shape()
          s.moveTo(0, 0.56); s.bezierCurveTo(0.28, 0.54, 0.44, 0.44, 0.46, 0.34)
          s.bezierCurveTo(0.46, -0.08, 0.30, -0.36, 0, -0.56)
          s.bezierCurveTo(-0.30, -0.36, -0.46, -0.08, -0.46, 0.34)
          s.bezierCurveTo(-0.44, 0.44, -0.28, 0.54, 0, 0.56)
          const sGeo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3 })
          const shield = new THREE.Mesh(sGeo, mat); shield.position.z = -0.06
          const emb = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 28), accentMat); emb.position.set(0, 0.04, 0.12)
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.04), accentMat); bar.position.set(0, 0.04, 0.13)
          g.add(shield, emb, bar)
          break
        }
        default: {
          const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mat); cr.scale.set(0.85, 1.18, 0.85)
          const hA = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.028, 10, 40), accentMat); hA.rotation.set(Math.PI / 2.5, 0.2, 0)
          const hB = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 8, 36), mat); hB.rotation.set(-Math.PI / 3.2, 0.5, 0.3)
          g.add(cr, hA, hB)
          break
        }
      }
      g.rotation.set(0.14, -0.22, 0)
      scene.add(g)
      renderer.render(scene, camera)
      const out = canvas.toDataURL('image/webp', 0.92)
      renderer.dispose()
      return out
    }, { icon: spec })

    const base64 = dataUrl.replace(/^data:image\/webp;base64,/, '')
    const fileName = `${spec.id}.webp`
    await writeFile(path.join(outDir, fileName), Buffer.from(base64, 'base64'))
    manifestEntries.push({
      id: spec.id,
      file: `/assets/workflow-ocean/${fileName}`,
      width: 256,
      height: 256,
      format: 'webp',
      source: 'scripts/render-ocean-icons.mjs (Three.js studio offscreen render)'
    })
  }

  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ generatedBy: 'scripts/render-ocean-icons.mjs', assets: manifestEntries }, null, 2))
  console.log(`Generated ${manifestEntries.length} 3D WebP icons in ${outDir}`)
} finally {
  await browser.close()
}
