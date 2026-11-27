import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { extensionWorker, gotoWithRetry } from './support/browser.mjs'
import { distDir, reportsDir } from './support/paths.mjs'

const resultDir = path.join(reportsDir, 'workflow-ocean')
const scratchShotsDir = process.env.OCEAN_SHOTS_DIR || resultDir

await mkdir(resultDir, { recursive: true })
await mkdir(scratchShotsDir, { recursive: true })

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
    ? { recordVideo: { dir: scratchShotsDir, size: { width: 1280, height: 720 } } }
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
  await page.waitForTimeout(900)
  const loadMs = Date.now() - t0

  // 1. Verify all 9 workflow cards + 1 add card render & default quality is 'static'
  const cardCount = await page.locator('.sea-card').count()
  assert.equal(cardCount, 10, `expected 10 cards on sea screen, got ${cardCount}`)
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'sea')
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-quality'), 'static')
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-3d'), 'false')
  assert.equal(await page.locator('[data-testid="workflow-ocean-canvas"]').count(), 0, 'default static mode should not mount WebGL canvas')

  // Switch to 'balanced' to activate 3D WebGL mode & verify sidebar remains visible and clickable above canvas
  await page.locator('[data-quality-option="balanced"]').click()
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workflow-ocean-scene"]')?.getAttribute('data-ocean-3d') === 'true',
    { timeout: 5000 }
  )
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-3d'), 'true')
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-rendering'), 'true')

  const sidebarHitTest = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar')
    const btn = document.querySelector('.sidebar nav button')
    if (!sidebar || !btn) return { ok: false, reason: 'missing sidebar or button' }
    const rect = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return {
      ok: Boolean(hit && sidebar.contains(hit)),
      hitTag: hit?.tagName ?? null,
      zIndex: getComputedStyle(sidebar).zIndex
    }
  })
  assert.equal(sidebarHitTest.ok, true, `sidebar must remain visible & hit-testable above 3D canvas: ${JSON.stringify(sidebarHitTest)}`)

  // Verify WebGL canvas non-interactive & diagnostics
  const canvasPointerEvents = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="workflow-ocean-canvas"]')
    return canvas ? getComputedStyle(canvas).pointerEvents : 'none'
  })
  assert.equal(canvasPointerEvents, 'none', '3D canvas must not intercept pointer events')

  const webglDiag = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  const is3d = await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-3d')
  if (is3d === 'true') {
    assert.ok(webglDiag && webglDiag.drawCalls > 0, 'expected non-zero drawCalls when 3D WebGL is active')
  }

  // Simulate gentle pointer parallax for video & screenshot
  await page.mouse.move(960, 420)
  await page.waitForTimeout(250)
  await page.mouse.move(1220, 540, { steps: 10 })
  await page.waitForTimeout(250)

  // Capture 1920x1080 screenshot & runtime perf metrics
  await page.screenshot({ path: path.join(scratchShotsDir, 'v2-1920x1080.png') })
  const perfMetrics = await page.evaluate(async () => {
    const perfMem = performance.memory
    const firstCard = document.querySelector('.ocean-card')
    let hoverFrameMs = 0
    if (firstCard) {
      const tStart = performance.now()
      firstCard.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      hoverFrameMs = Number((performance.now() - tStart).toFixed(2))
    }
    return {
      domNodes: document.querySelectorAll('*').length,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      longTasks: window.__oceanLongTasks ?? [],
      jsHeapUsedBytes: perfMem ? perfMem.usedJSHeapSize : null,
      hoverFrameMs,
      webgl: window.__patmailOceanDiagnostics?.() ?? null
    }
  })
  assert.equal(perfMetrics.overflowX, false, '1920x1080 should have no horizontal overflow')

  // 2. Test all 4 quality modes (cinema, balanced, eco, static)
  for (const q of ['cinema', 'eco', 'static', 'balanced']) {
    await page.locator(`[data-quality-option="${q}"]`).click()
    await page.waitForTimeout(220)
    assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-quality'), q)
    if (q === 'static') {
      assert.equal(await page.locator('[data-testid="workflow-ocean-canvas"]').count(), 0, 'static mode must remove WebGL canvas')
      assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-rendering'), 'false')
    } else {
      assert.equal(await page.locator('[data-testid="workflow-ocean-canvas"]').count(), 1)
    }
  }

  // 3. Test responsive viewports & zoom levels
  const layoutChecks = []
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(180)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false, `${vp.name} should have no horizontal overflow`)
    layoutChecks.push({ viewport: vp.name, overflow })
    if (vp.name === '2560x1440' || vp.name === '1366x768') {
      await page.screenshot({ path: path.join(scratchShotsDir, `v2-${vp.name}.png`) })
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  for (const zoom of ['0.8', '1', '1.25']) {
    await page.evaluate((z) => { document.documentElement.style.zoom = z }, zoom)
    await page.waitForTimeout(100)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false, `zoom ${zoom} should have no horizontal overflow`)
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '' })

  // 4. Test reduced-motion disables rendering
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.reload()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(150)
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-rendering'), 'false')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(250)
  assert.equal(await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-rendering'), 'true')

  // 5. Enter business workbench -> rendering stops
  await page.locator('.fee-reduce-workflow-card .sea-action-primary').click()
  await page.locator('.fee-reduce-page').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'workbench')
  await page.screenshot({ path: path.join(scratchShotsDir, 'v2-workbench.png') })

  await page.locator('.workflow-fee-reduce').getByRole('tab', { name: '流程说明', exact: true }).click()
  await page.locator('.workflow-fee-reduce .workflow-guide .docs-md').waitFor({ state: 'visible', timeout: 10000 })

  await page.locator('.workflow-fee-reduce .workflow-back-btn').click()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })

  // 6. Copy & remove a custom workflow
  await page.locator('[data-workflow-id="pct-reminder"]').getByRole('button', { name: '复制副本', exact: true }).click()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.locator('.sea-card').nth(10).waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.sea-card').count(), 11)
  await page.locator('.sea-card').nth(4).getByRole('button', { name: '拿掉', exact: true }).click()
  await page.getByRole('button', { name: '拿掉', exact: true }).last().click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.sea-card').count(), 10)

  // 7. Enter "从知识海洋加一条" (ocean skill builder) & create custom flow
  await page.locator('[data-testid="workflow-ocean-add-card"]').click()
  await page.locator('.ocean-builder').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'ocean')
  await page.screenshot({ path: path.join(scratchShotsDir, 'v2-ocean-builder.png') })

  await page.locator('.ocean-builder .skill-bubble').first().click()
  await page.locator('.ocean-builder input[type="text"]').fill('海洋2.0测试流')
  await page.getByRole('button', { name: '放进我的工作流', exact: true }).click()
  await page.locator('.flow-board').waitFor({ state: 'visible', timeout: 10000 })
  await page.reload()
  await page.locator('.flow-board').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.workflow-back-btn').first().click()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })

  // 8. 20x top-level route switches: verify rendering stops on Home & zero resource leak on return
  const initialDiag = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  for (let i = 0; i < 20; i++) {
    await page.locator('.sidebar nav button', { hasText: '首页' }).click()
    await page.locator('.sidebar nav button', { hasText: '工作流' }).click()
  }
  await page.waitForTimeout(200)
  assert.equal(await page.locator('[data-testid="workflow-ocean-canvas"]').count(), 1)
  const afterLoopDiag = await page.evaluate(() => window.__patmailOceanDiagnostics?.() ?? null)
  if (initialDiag && afterLoopDiag) {
    assert.equal(afterLoopDiag.geometries, initialDiag.geometries, '20x route switches must not leak geometries')
    assert.equal(afterLoopDiag.textures, initialDiag.textures, '20x route switches must not leak textures')
  }

  // Final home check: renderingActive becomes false when route !== /workflow
  await page.locator('.sidebar nav button', { hasText: '首页' }).click()
  await page.waitForTimeout(150)
  const homeHasOcean = await page.evaluate(() => Boolean(document.querySelector('.route-pane:not(.is-hidden-pane) > .workflow-page-root')))
  assert.equal(homeHasOcean, false, 'home route should not have active workflow-page-root')
  assert.equal(
    await page.locator('[data-testid="workflow-ocean-scene"]').getAttribute('data-ocean-rendering'),
    'false',
    'rendering must stop when switched away from workflow route'
  )

  const report = {
    passed: true,
    loadMs,
    perfMetrics,
    layoutChecks,
    afterLoopDiag
  }
  await writeFile(path.join(resultDir, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(scratchShotsDir, 'perf-v2.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await context.close()
}
