import assert from 'node:assert/strict'
import path from 'node:path'
import { launchExtensionContext, extensionWorker } from './support/browser.mjs'
import { distDir, resultPath } from './support/paths.mjs'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { createHagueFixture } from './support/hague-fixture.mjs'

// Optional local sample directory; the material never leaves this isolated browser.
const fixture = process.argv[2] === '--fixture' ? await createHagueFixture() : null
const sample = fixture?.root || process.argv[2]
const expectedCount = Number(process.argv[3] || 1)
assert.ok(sample, 'Pass the local Hague sample folder as the first argument')
let server, browser
if (process.env.HAGUE_TEST_CHROME) {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.HAGUE_TEST_CHROME, headless: true })
}
const context = browser ? await browser.newContext({ viewport: { width: 1440, height: 1000 } }) : await launchExtensionContext(distDir, { viewport: { width: 1440, height: 1000 } })
await context.route(/^https?:/, route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort())
try {
  const page = await context.newPage()
  if (server) {
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/e2e/hague-harness.html`)
  } else {
    const worker = await extensionWorker(context)
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/app.html`)
    await page.getByRole('button', { name: '工作流', exact: true }).click()
    await page.getByRole('button', { name: /海牙新申请.*选择总文件夹/ }).click()
  }
  await page.getByLabel('选择海牙申请总文件夹').setInputFiles(path.resolve(sample))
  await page.getByRole('dialog',{name:'导入海牙申请材料',exact:true}).getByRole('button',{name:'导入材料',exact:true}).click()
  await page.getByRole('status').filter({ hasText: `已识别 ${expectedCount} 件案件` }).waitFor()
  if (expectedCount === 3) {
    assert.equal(await page.locator('.hague-cases button').count(), 3)
    await page.locator('.hague-cases button').filter({ hasText: 'PO2530287HAGUE' }).click()
    assert.equal(await page.locator('.hague-page figure').count(), 10)
    assert.match(await page.locator('.hague-page figcaption').last().innerText(), /1\.10.jpg.*Enlarged/)
    assert.equal(await page.locator('.hague-page .errors li').count(), 0)
    await page.locator('.hague-cases button').filter({ hasText: 'PA2532115CN' }).click()
    assert.equal(await page.locator('.hague-page figure').count(), 20)
    assert.equal(await page.locator('.hague-page .errors li').count(), 0)
    await page.locator('.hague-cases button').filter({ hasText: 'PO2631874HAGUE' }).click()
  }
  await page.getByText('默认使用文件夹识别的', { exact: false }).waitFor()
  assert.equal(await page.locator('.hague-page figure').count(), 8)
  assert.match(await page.locator('.hague-page figcaption').nth(3).innerText(), /1\.4\.(jpg|png).*Left/)
  assert.match(await page.locator('.hague-page figcaption').nth(5).innerText(), /1\.6\.(jpg|png).*Top/)
  assert.equal(await page.getByRole('button', { name: '已核实，采用此文号' }).count(), 0)
  assert.equal(await page.locator('.test-top-actions [role=progressbar], .top-actions [role=progressbar]').getAttribute('aria-valuenow'), '33.3')
  assert.equal(await page.locator('.hague-page .errors li').count(), 0)
  assert.equal(await page.getByRole('button', { name: '读取并仲裁本案', exact: true }).isEnabled(), false)
  assert.equal(await page.locator('.hague-page [role=progressbar]').count(), 0)
  await page.getByText('等待 eHague 登录验证', { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('region', { name: 'WIPO eHague 登录会话', exact: true }).count(), 1)
  const firstName = (await page.locator('.hague-page figcaption').nth(0).innerText()).split(' · ')[0]
  const secondName = (await page.locator('.hague-page figcaption').nth(1).innerText()).split(' · ')[0]
  await page.getByRole('button', { name: `放大预览 ${firstName}`, exact: true }).click()
  const preview = page.getByRole('dialog', { name: '图片放大预览', exact: true })
  await preview.waitFor()
  await preview.locator('img').evaluate(img => img.decode())
  assert.equal(await preview.locator('img').getAttribute('alt'), `${firstName} · Perspective`)
  await preview.getByRole('button', { name: '放大图片', exact: true }).click()
  await preview.getByRole('button', { name: '适应窗口', exact: true }).filter({ hasText: '125%' }).waitFor()
  await preview.getByRole('button', { name: '下一张图片', exact: true }).click()
  assert.equal(await preview.locator('img').getAttribute('alt'), `${secondName} · Front`)
  await page.keyboard.press('Escape')
  await preview.waitFor({ state: 'detached' })
  const barBox = await page.locator('.test-top-actions [role=progressbar], .top-actions [role=progressbar]').boundingBox()
  const pageBox = await page.locator('.hague-page').boundingBox()
  assert.ok(barBox && pageBox && barBox.y < pageBox.y, 'progress belongs in the shared top header')
  const scroll = await page.locator('.split-scroll-pane').evaluate(host => {
    const side = host.querySelector('.split-scroll-sidebar'), main = host.querySelector('.split-scroll-detail')
    const card = side.querySelector('nav')
    for (let i = 0; i < 30; i++) card.appendChild(card.firstElementChild.cloneNode(true))
    main.scrollTop = 100; side.scrollTop = 50
    return { side: getComputedStyle(side).overflowY, main: getComputedStyle(main).overflowY, sideTop: side.scrollTop, mainTop: main.scrollTop, height: host.clientHeight, viewport: innerHeight }
  })
  assert.equal(scroll.side, 'auto'); assert.equal(scroll.main, 'auto'); assert.ok(scroll.sideTop > 0); assert.ok(scroll.mainTop > 0)
  assert.ok(scroll.height < scroll.viewport)
  await page.screenshot({ path: resultPath('hague-preview.png'), fullPage: true })
  console.log(`Hague import: ${expectedCount} cases; document parsing, top-only progress, and independent pane scrolling passed`)
} finally { await context.close(); await browser?.close(); await server?.close(); await fixture?.cleanup() }
