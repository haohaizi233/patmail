import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { extensionWorker, gotoWithRetry } from './support/browser.mjs'
import { distDir, reportsDir } from './support/paths.mjs'

const resultDir = path.join(reportsDir, 'workflow-ocean-v2.1')
const shotsDir = process.env.OCEAN_SHOTS_DIR || path.join(resultDir, 'screenshots')

await mkdir(resultDir, { recursive: true })
await mkdir(shotsDir, { recursive: true })

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 }
]

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1920, height: 1080 },
  ...(process.env.OCEAN_RECORD_VIDEO === '1'
    ? { recordVideo: { dir: resultDir, size: { width: 1280, height: 720 } } }
    : {}),
  args: [
    `--disable-extensions-except=${distDir}`,
    `--load-extension=${distDir}`,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader'
  ]
})

try {
  const worker = await extensionWorker(context)
  const extensionId = new URL(worker.url()).host
  const page = await context.newPage()

  const consoleErrors = []
  const pageErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => {
    pageErrors.push(String(err))
  })

  await page.addInitScript(() => {
    window.__oceanLongTasks = []
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__oceanLongTasks.push({ duration: entry.duration, startTime: entry.startTime })
          }
        })
        obs.observe({ entryTypes: ['longtask'] })
      } catch {
        // ignore unsupported PerformanceObserver
      }
    }
  })

  const t0 = Date.now()
  await gotoWithRetry(page, `chrome-extension://${extensionId}/app.html#/workflow`)
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.sea-card').first().waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(400)
  const loadMs = Date.now() - t0

  // 1. Default quality is 'static' (0 WebGL init)
  assert.equal(await page.locator('.sea-card').count(), 10)
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'sea')
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-quality'), 'static')
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-3d'), 'false')
  assert.equal(await page.locator('[data-testid="workflow-ocean-canvas"]').count(), 0)
  await page.screenshot({ path: path.join(shotsDir, 'after-static.png') })

  // Verify all 3D WebP icons loaded (naturalWidth > 0)
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.ocean-icon-img')]
    return imgs.length === 10 && imgs.every(img => img.complete && img.naturalWidth > 0)
  }, { timeout: 10000 })

  // 2. Switch to 'balanced' -> verify WebGL 3D ready, sidebar hit-testable, diagnostics non-null
  await page.locator('[data-quality-option="balanced"]').click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
    { timeout: 10000 }
  )
  await page.waitForTimeout(500)
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-state'), 'ready')

  const sidebarHitTest = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar')
    const btn = document.querySelector('.sidebar nav button')
    if (!sidebar || !btn) return { ok: false }
    const rect = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return { ok: Boolean(hit && sidebar.contains(hit)), zIndex: getComputedStyle(sidebar).zIndex }
  })
  assert.equal(sidebarHitTest.ok, true, `sidebar must remain above 3D canvas: ${JSON.stringify(sidebarHitTest)}`)

  await page.screenshot({ path: path.join(shotsDir, 'after-balanced.png') })
  await page.screenshot({ path: path.join(shotsDir, 'after-1920x1080.png') })

  const balancedDiag = await page.evaluate(() => ({
    diag: window.__patmailOceanDiagnostics?.() ?? null,
    domNodes: document.querySelectorAll('*').length,
    jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
    dpr: window.devicePixelRatio,
    glRenderer: (() => {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2') || c.getContext('webgl')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
    })()
  }))
  assert.ok(balancedDiag.diag && balancedDiag.diag.drawCalls > 0, 'balanced diagnostics must report drawCalls > 0')
  assert.equal(balancedDiag.diag.activeRenderers, 1, 'must have exactly 1 active renderer')

  // 3. Cinema & Eco screenshots + Eco idle RAF stop verification
  await page.locator('[data-quality-option="cinema"]').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(shotsDir, 'after-cinema.png') })

  await page.locator('[data-quality-option="eco"]').click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(shotsDir, 'after-eco.png') })
  // 慢速 CI 上相机收敛可能晚于固定等待：先轮询到 RAF 真正停住（连续 3 次采样不变），再验证空闲窗口不续跑
  await page.waitForFunction(() => {
    const count = window.__patmailOceanDiagnostics?.()?.rafCallbacks ?? -1
    if (count !== window.__ecoRafPrev) {
      window.__ecoRafPrev = count
      window.__ecoRafStable = 0
    } else {
      window.__ecoRafStable = (window.__ecoRafStable ?? 0) + 1
    }
    return count >= 0 && window.__ecoRafStable >= 3
  }, null, { polling: 300, timeout: 20000 })
  const ecoRafBefore = await page.evaluate(() => window.__patmailOceanDiagnostics?.()?.rafCallbacks ?? -1)
  await page.waitForTimeout(900)
  const ecoRafAfter = await page.evaluate(() => window.__patmailOceanDiagnostics?.()?.rafCallbacks ?? -1)
  assert.ok(ecoRafBefore >= 0 && ecoRafAfter - ecoRafBefore <= 1, `eco idle must stop RAF (before=${ecoRafBefore}, after=${ecoRafAfter})`)

  // 4. 100x quality switch stress (balanced <-> eco) -> zero resource growth
  await page.locator('[data-quality-option="balanced"]').click()
  await page.waitForTimeout(150)
  const stressBefore = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  assert.ok(stressBefore, 'diagnostics must be present before 100x stress')
  for (let i = 0; i < 100; i++) {
    await page.locator(`[data-quality-option="${i % 2 === 0 ? 'eco' : 'balanced'}"]`).click()
  }
  await page.waitForTimeout(250)
  const stressAfter = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  assert.ok(stressAfter, 'diagnostics must be present after 100x stress')
  assert.equal(stressAfter.activeRenderers, 1)
  assert.ok(
    stressAfter.trackedResources <= stressBefore.trackedResources + 2,
    `100x quality switch must not leak trackedResources: before=${stressBefore.trackedResources}, after=${stressAfter.trackedResources}`
  )
  await writeFile(
    path.join(resultDir, 'quality-switch-stress.json'),
    JSON.stringify({ switches: 100, before: stressBefore, after: stressAfter }, null, 2)
  )

  // 5. Responsive viewports (including 2560x1440 and 1366x768)
  const layoutChecks = []
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(180)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false, `${vp.name} should have no horizontal overflow`)
    layoutChecks.push({ viewport: vp.name, overflow })
    if (vp.name === '2560x1440' || vp.name === '1366x768') {
      await page.screenshot({ path: path.join(shotsDir, `after-${vp.name}.png`) })
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 })

  // 6. Fault injection A: WEBGL_lose_context simulation & recovery
  const loseCtxResult = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="workflow-ocean-canvas"]')
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_lose_context')
    if (!ext) return { supported: false }
    window.__oceanLoseExt = ext
    ext.loseContext()
    return { supported: true }
  })
  let contextRecoveryReport = { supported: loseCtxResult.supported }
  if (loseCtxResult.supported) {
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'false',
      { timeout: 5000 }
    )
    const lostState = await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-state')
    assert.equal(lostState, 'context-lost')
    // Workflow buttons stay clickable while context is lost
    assert.equal(await page.locator('.fee-reduce-workflow-card .sea-action-primary').isEnabled(), true)

    await page.evaluate(() => window.__oceanLoseExt?.restoreContext())
    await page.waitForFunction(
      () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
      { timeout: 5000 }
    )
    const restoredState = await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-state')
    contextRecoveryReport = { supported: true, lostState, restoredState }
  }

  // 7. Fault injection B: forced WebGL init failure -> static fallback + manual retry recovery
  await page.locator('[data-quality-option="static"]').click()
  await page.waitForTimeout(100)
  await page.evaluate(() => { window.__patmailOceanTestHooks = { forceInitError: true } })
  await page.locator('[data-quality-option="cinema"]').click()
  await page.locator('[data-testid="ocean-fallback-banner"]').waitFor({ state: 'visible', timeout: 5000 })
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-3d'), 'false')
  assert.equal(await page.locator('.fee-reduce-workflow-card .sea-action-primary').isEnabled(), true)

  await page.evaluate(() => { delete window.__patmailOceanTestHooks })
  await page.locator('[data-testid="ocean-retry-3d"]').click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
    { timeout: 5000 }
  )
  await writeFile(
    path.join(resultDir, 'context-recovery.json'),
    JSON.stringify({ contextRecoveryReport, forcedInitRecovery: true }, null, 2)
  )

  // 8. Verify SVG fallback when an icon image fails
  const svgFallbackCount = await page.evaluate(async () => {
    const firstImg = document.querySelector('.ocean-icon-img')
    if (!firstImg) return 0
    firstImg.dispatchEvent(new Event('error'))
    await new Promise(r => setTimeout(r, 80))
    return document.querySelectorAll('.ocean-icon-svg').length
  })
  assert.ok(svgFallbackCount >= 1, 'broken 3D icon image must fall back to inline SVG')

  // 9. Reduced-motion disables rendering
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(150)
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-rendering'), 'false')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
    { timeout: 10000 }
  )

  // 10. Business workflow enter/exit & 20x route switches stability
  await page.locator('.fee-reduce-workflow-card .sea-action-primary').click()
  await page.locator('.fee-reduce-page').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'workbench')
  await page.locator('.workflow-fee-reduce .workflow-back-btn').click()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
    null,
    { timeout: 10000 }
  )

  const loopBefore = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  for (let i = 0; i < 20; i++) {
    await page.locator('.sidebar nav button', { hasText: '首页' }).click()
    await page.locator('.sidebar nav button', { hasText: '工作流' }).click()
  }
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
    null,
    { timeout: 10000 }
  )
  await page.waitForTimeout(200)
  const loopAfter = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  assert.ok(loopBefore && loopAfter, 'diagnostics must be present around 20x route switch')
  assert.equal(loopAfter.geometries, loopBefore.geometries, '20x route switches must not leak geometries')
  assert.equal(loopAfter.textures, loopBefore.textures, '20x route switches must not leak textures')
  assert.equal(loopAfter.activeRenderers, 1)

  await writeFile(
    path.join(resultDir, 'resource-stability.json'),
    JSON.stringify({ routeSwitch20Before: loopBefore, routeSwitch20After: loopAfter }, null, 2)
  )

  // Reset stored quality back to default 'static' cleanly
  await page.locator('[data-quality-option="static"]').click()
  await page.waitForTimeout(100)

  assert.deepEqual(consoleErrors, [], `unexpected console errors: ${JSON.stringify(consoleErrors)}`)
  assert.deepEqual(pageErrors, [], `unexpected page errors: ${JSON.stringify(pageErrors)}`)

  const afterReport = {
    passed: true,
    os: `${os.platform()} ${os.release()}`,
    browser: 'Chromium (Playwright)',
    renderBackend: balancedDiag.glRenderer,
    note: 'Headless software rendering (SwiftShader) — not discrete GPU performance',
    viewport: '1920x1080',
    dpr: balancedDiag.dpr,
    loadMs,
    domNodes: balancedDiag.domNodes,
    jsHeapUsedBytes: balancedDiag.jsHeapUsedBytes,
    balanced: balancedDiag.diag,
    ecoIdleRafDelta800ms: ecoRafAfter - ecoRafBefore,
    layoutChecks,
    contextRecoveryReport
  }
  await writeFile(path.join(resultDir, 'performance-after.json'), JSON.stringify(afterReport, null, 2))
  console.log(JSON.stringify(afterReport))
} finally {
  await context.close()
}
