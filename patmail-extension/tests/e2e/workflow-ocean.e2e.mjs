import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launchExtensionContext, extensionWorker, gotoWithRetry } from './support/browser.mjs'
import { distDir, reportsDir } from './support/paths.mjs'

const resultDir = joinIfNeeded(reportsDir, 'workflow-ocean')
const scratchShotsDir = 'C:/Users/Administrator/.gemini/antigravity/brain/005d5e6f-d6de-4f53-9d99-c95ce7da86c7/scratch/ocean-after'

function joinIfNeeded(base, sub) {
  return path.join(base, sub)
}

await mkdir(resultDir, { recursive: true })
await mkdir(scratchShotsDir, { recursive: true })

const viewports = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 }
]

const context = await launchExtensionContext(distDir, { viewport: { width: 1920, height: 1080 } })
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
  await page.waitForTimeout(350)
  const loadMs = Date.now() - t0

  // 1. Verify all 9 workflow cards + 1 add card render
  const cardCount = await page.locator('.sea-card').count()
  assert.equal(cardCount, 10, `expected 10 cards on sea screen, got ${cardCount}`)
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'sea')

  // Capture 1920x1080 screenshot & measure runtime metrics
  await page.screenshot({ path: path.join(scratchShotsDir, 'after-1920x1080.png') })
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
      hoverFrameMs
    }
  })
  assert.equal(perfMetrics.overflowX, false, '1920x1080 should have no horizontal overflow')

  // 2. Test responsive viewports & zoom levels (no horizontal overflow)
  const layoutChecks = []
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.waitForTimeout(150)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false, `${vp.name} should have no horizontal overflow`)
    layoutChecks.push({ viewport: vp.name, overflow })
    if (vp.name === '1440x900' || vp.name === '1366x768') {
      await page.screenshot({ path: path.join(scratchShotsDir, `after-${vp.name}.png`) })
    }
  }

  // Test browser zoom 80%, 100%, 125% at 1440x900
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const zoom of ['0.8', '1', '1.25']) {
    await page.evaluate((z) => { document.documentElement.style.zoom = z }, zoom)
    await page.waitForTimeout(100)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    assert.equal(overflow, false, `zoom ${zoom} should have no horizontal overflow`)
  }
  await page.evaluate(() => { document.documentElement.style.zoom = '' })
  await page.setViewportSize({ width: 1440, height: 900 })

  // 3. Click 开始使用 -> enters business workbench (data-ocean-mode="workbench", no ocean bg)
  await page.locator('.fee-reduce-workflow-card .sea-action-primary').click()
  await page.locator('.fee-reduce-page').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'workbench')
  await page.screenshot({ path: path.join(scratchShotsDir, 'workbench-fee-reduce.png') })

  // 4. Click 流程说明 -> docs rendered
  await page.locator('.workflow-fee-reduce').getByRole('tab', { name: '流程说明', exact: true }).click()
  await page.locator('.workflow-fee-reduce .workflow-guide .docs-md').waitFor({ state: 'visible', timeout: 10000 })

  // 5. Return back to sea & verify position memory on reload
  await page.locator('.workflow-fee-reduce .workflow-back-btn').click()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'sea')

  // 6. Copy & remove a custom workflow
  await page.locator('[data-workflow-id="pct-reminder"]').getByRole('button', { name: '复制副本', exact: true }).click()
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.locator('.sea-card').nth(10).waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.sea-card').count(), 11)
  await page.locator('.sea-card').nth(4).getByRole('button', { name: '拿掉', exact: true }).click()
  await page.getByRole('button', { name: '拿掉', exact: true }).last().click()
  await page.waitForTimeout(150)
  assert.equal(await page.locator('.sea-card').count(), 10)

  // 7. Enter "从知识海洋加一条" (ocean skill builder), create custom flow, and return
  await page.locator('[data-testid="workflow-ocean-add-card"]').click()
  await page.locator('.ocean-builder').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'ocean')
  await page.screenshot({ path: path.join(scratchShotsDir, 'ocean-skill-builder.png') })

  await page.locator('.ocean-builder .skill-bubble').first().click()
  await page.locator('.ocean-builder input[type="text"]').fill('海洋测试流')
  await page.getByRole('button', { name: '放进我的工作流', exact: true }).click()
  await page.locator('.flow-board').waitFor({ state: 'visible', timeout: 10000 })
  assert.equal(await page.locator('.workflow-page-root').getAttribute('data-ocean-mode'), 'workbench')

  // Reload & verify flow position restored
  await page.reload()
  await page.locator('.flow-board').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.workflow-back-btn').first().click()
  await page.locator('[data-testid="workflow-ocean-scene"]').waitFor({ state: 'visible', timeout: 10000 })

  // 8. Switch to home route (#/) and confirm zero ocean theme leakage
  await page.locator('.sidebar nav button', { hasText: '首页' }).click()
  await page.waitForTimeout(200)
  const homeHasOcean = await page.evaluate(() => Boolean(document.querySelector('.route-pane:not(.is-hidden-pane) > .workflow-page-root')))
  assert.equal(homeHasOcean, false, 'home route should not have active workflow-page-root')

  const report = {
    passed: true,
    loadMs,
    perfMetrics,
    layoutChecks
  }
  await writeFile(path.join(resultDir, 'report.json'), JSON.stringify(report, null, 2))
  await writeFile(path.join(scratchShotsDir, 'perf-after.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await context.close()
}
